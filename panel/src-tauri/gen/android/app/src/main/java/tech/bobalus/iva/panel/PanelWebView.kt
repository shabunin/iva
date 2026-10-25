package tech.bobalus.iva.panel

import android.graphics.Bitmap
import android.os.Build
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.RequiresApi
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.util.concurrent.Executors

/**
 * What the panel changes of the web view wry makes - after wry has set it
 * up (its client, its IPC: in the same turn of the main thread as
 * MainActivity.onWebViewCreate, so a post from there), before its page
 * loads (posted after that).
 */
object PanelWebView {
  /** the panel's own page (Tauri's origin on Android) */
  private val ORIGINS = setOf("http://tauri.localhost", "https://tauri.localhost")

  /**
   * Where the page's IPC messages go to Rust, one after another: not the main thread, where the
   * listener hears them - a command may wait for the main thread (wry's interface ran on the web
   * view's JavaBridge thread; on the main thread the panel hung at its first command).
   */
  private val ipcThread = Executors.newSingleThreadExecutor { Thread(it, "iva-ipc") }

  /**
   * Tauri's IPC for the panel's own page only. wry offers it to every frame
   * (a JavaScript interface) and tells Rust the main page's URL whoever
   * calls, so another site's page in a GUI's web view could run any of the
   * panel's commands: close its sockets, open ports, erase the kept GUIs.
   * Instead: a message channel by the same name, offered to the panel's
   * origin and taken from its main frame only, to the same Rust call.
   */
  fun ownIpc(webView: WebView) {
    val view = webView as? RustWebView ?: return
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    view.removeJavascriptInterface("ipc")
    WebViewCompat.addWebMessageListener(view, "ipc", ORIGINS) { _, message, origin, isMainFrame, _ ->
      val data = message.data
      if (!isMainFrame || data == null) return@addWebMessageListener
      // (the page's own URL read here, on the main thread)
      val url = view.url ?: "$origin/"
      ipcThread.execute { Rust.ipc(view.id, url, data) }
    }
  }

  /**
   * wry's client, and the web view's renderer gone (a crash, or Android
   * took its memory): to [gone], handled - unhandled, Android ends the
   * whole app with it, and a panel on the wall stays dark. [loaded]: a page
   * finished loading.
   */
  fun watchRenderer(webView: WebView, gone: (WebView, Boolean) -> Unit, loaded: (WebView) -> Unit) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val wry = webView.webViewClient
    webView.webViewClient = Client(wry, gone, loaded)
  }

  /**
   * wry's client as it is - what wry 0.57's RustWebViewClient overrides goes
   * to it, the rest is WebViewClient's in both - and the renderer gone.
   */
  @RequiresApi(Build.VERSION_CODES.O)
  private class Client(
    private val wry: WebViewClient,
    private val gone: (WebView, Boolean) -> Unit,
    private val loaded: (WebView) -> Unit,
  ) : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
      wry.shouldInterceptRequest(view, request)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
      wry.shouldOverrideUrlLoading(view, request)

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) = wry.onPageStarted(view, url, favicon)

    override fun onPageFinished(view: WebView, url: String) {
      wry.onPageFinished(view, url)
      loaded(view)
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) =
      wry.onReceivedError(view, request, error)

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
      gone(view, detail.didCrash())
      return true
    }
  }
}
