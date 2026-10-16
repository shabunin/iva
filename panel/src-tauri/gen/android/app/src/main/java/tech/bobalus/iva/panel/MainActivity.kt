package tech.bobalus.iva.panel

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var multicastLock: WifiManager.MulticastLock? = null

  private var webView: WebView? = null

  // Back: not the web view's history (the panel has none)
  override val handleBackNavigation: Boolean = false

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
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
    webView?.resumeTimers()
    webView?.evaluateJavascript("window.ivaPanelSleep && window.ivaPanelSleep(false)", null)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // a panel on the wall: the screen stays on while it shows, the GUI takes all of it
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }
    immersive()
    // Back puts the panel away, as Home does: it keeps running (its systems connected). Closing
    // it would end the process under its Rust threads (an abort on the way out).
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        moveTaskToBack(true)
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
    if (hasFocus) immersive()
  }

  /** no status or navigation bar (a swipe from the edge shows them for a while) */
  private fun immersive() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).let {
      it.hide(WindowInsetsCompat.Type.systemBars())
      it.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      if (multicastLock?.isHeld == true) multicastLock?.release()
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }
}
