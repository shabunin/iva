package tech.bobalus.iva.panel

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

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
    asleep = false
    device.touched()
    webView?.resumeTimers()
    webView?.evaluateJavascript("window.ivaPanelSleep && window.ivaPanelSleep(false)", null)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
