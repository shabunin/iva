package tech.bobalus.iva.panel

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

class MainActivity : TauriActivity() {
  private var multicastLock: WifiManager.MulticastLock? = null

  private var webView: WebView? = null

  /** the phone as the GUI's scripts have it: brightness, volume, battery, the bars, hardware keys, the auto-lock */
  private val device by lazy { PanelDevice(this) }

  // Back: not the web view's history (the panel has none)
  override val handleBackNavigation: Boolean = false

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    // (before its first page: the page's channel to the device)
    device.attach(webView)
    // the timers are the process's: a web view before this one (its renderer gone) may have left them paused
    if (!asleep) webView.resumeTimers()
    // once wry has given it its client and IPC (next in this turn of the main thread), before its page loads
    webView.post {
      PanelWebView.ownIpc(webView)
      PanelWebView.watchRenderer(webView, ::rendererGone, ::pageLoaded)
    }
  }

  // The web view's renderer gone (a crash, or Android took its memory back): the page again in a new web
  // view - the activity made again as for a configuration change, which wry and tao live through (the
  // window, the web view's Rust side kept; the page's start closes the sockets the last one left). Not
  // in the background: a page started there would run awake, its servers holding their ports.
  /** why the page starts again, for its error list: kept across the activity made again */
  private var renewal: String? = null
  /** this activity's web view dead, the activity not made again yet (in the background: when it's back) */
  private var dead = false

  private fun rendererGone(view: WebView, crashed: Boolean) {
    val why = if (crashed) "crashed" else "was ended by Android (low on memory)"
    Log.e(TAG, "the web view's renderer $why: the page again in a new one")
    // a dead renderer's web view is never used again: out of the window, destroyed
    (view.parent as? ViewGroup)?.removeView(view)
    view.destroy()
    if (webView === view) webView = null
    dead = true
    renewal = "the panel's web view $why at ${DateFormat.getTimeInstance().format(Date())}: its page started again"
    if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) recreate()
  }

  private fun pageLoaded(view: WebView) {
    val note = renewal ?: return
    renewal = null
    // (main.ts keeps what console.error says)
    view.evaluateJavascript("console.error(${JSONObject.quote(note)})", null)
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    renewal?.let { outState.putString(RENEWAL, it) }
  }

  // In the background the GUI sleeps, as iViewer's does: the page is told first (GUISuspended - its
  // systems disconnect, its servers let their ports go, its page timers stop), then its scripts'
  // timers stop too. Told, not left to learn it's hidden: it may not before Android freezes the app,
  // and a frozen app's server keeps its port with no one to answer (iViewer couldn't open its own).
  private var asleep = false

  override fun onPause() {
    super.onPause()
    asleep = true
    val view = webView ?: return
    view.evaluateJavascript("window.ivaPanelSleep && window.ivaPanelSleep(true)") {
      // (back meanwhile: left running)
      if (asleep) view.pauseTimers()
    }
  }

  override fun onResume() {
    super.onResume()
    // its renderer went while in the background: the page again now
    if (dead) {
      recreate()
      return
    }
    asleep = false
    device.touched()
    webView?.resumeTimers()
    webView?.evaluateJavascript("window.ivaPanelSleep && window.ivaPanelSleep(false)", null)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    renewal = savedInstanceState?.getString(RENEWAL)
    // a panel on the wall: the screen stays on while it shows (unless a GUI's autoLockDelay says
    // for how long without a touch), the GUI takes all of it
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }
    // Android 12's splash gone at once, not faded out: the window under it shows the same icon in the same place
    // (res/drawable/splash.xml), and a fade between the two dims it for a moment
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      splashScreen.setOnExitAnimationListener { it.remove() }
    }
    device.start()
    device.applyBars()
    // Back puts the panel away, as Home does: it keeps running (its systems connected). Closing
    // it would end the process under its Rust threads (an abort on the way out). A GUI's
    // CF.interceptHardwareKey can keep it for itself.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackStarted(backEvent: BackEventCompat) = device.backStarted()

      override fun handleOnBackCancelled() = device.backCancelled()

      override fun handleOnBackPressed() {
        if (!device.backPressed()) moveTaskToBack(true)
      }
    })
    try {
      // the web inspector: chrome://inspect over adb
      android.webkit.WebView.setWebContentsDebuggingEnabled(true)
      // UDP multicast for systems (Wi-Fi drops it without the lock)
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      multicastLock = wifi.createMulticastLock("iva_panel_multicast").apply {
        setReferenceCounted(true)
        acquire()
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // no status or navigation bar (a swipe from the edge shows them for a while), unless the GUI shows one
    if (hasFocus) device.applyBars()
  }

  // the keys a GUI watches (CF.interceptHardwareKey): to it, or kept from the system
  override fun dispatchKeyEvent(event: KeyEvent): Boolean = device.keyEvent(event) { super.dispatchKeyEvent(it) }

  // a touch, a key: the screen stays on (autoLockDelay counts from here)
  override fun onUserInteraction() {
    super.onUserInteraction()
    device.touched()
  }

  companion object {
    private const val TAG = "iva-panel"
    private const val RENEWAL = "tech.bobalus.iva.panel.renewal"
  }

  override fun onDestroy() {
    device.stop()
    super.onDestroy()
    try {
      if (multicastLock?.isHeld == true) multicastLock?.release()
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }
}
