package tech.bobalus.iva.panel

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Resources
import android.database.ContentObserver
import android.graphics.Color
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * The phone as a GUI's scripts have it: CF.device's brightness, volume and
 * battery, the system bars, CF.setDeviceProperty, CF.interceptHardwareKey,
 * and CF.loadGUI's autoLockDelay - over window.ivaAndroid, a message channel
 * offered to the panel's own page only (a web view in a GUI, another site,
 * gets none). The page's side: panel/device.ts.
 *
 * From the page: hello (a page starting: it hears the whole state; the keys
 * are forgotten, the brightness and the bars are the panel's own again),
 * set, keys, autoLock, shown (it has drawn). To it: state (what changed since
 * it was last told; quiet: what its own set made of the device) and key (one
 * let go).
 *
 * Till the page first draws, the web view is see-through: the window's
 * background - the app's icon on black, the splash (res/drawable/splash.xml)
 * - shows instead of an empty black web view, and the page's loading screen,
 * the same icon in the same place, takes over from it. Then (shown, or
 * SPLASH_MS at most) it's opaque again, and the view around it black: a
 * see-through web view costs a full-screen blend every frame.
 */
class PanelDevice(private val activity: ComponentActivity) {
  private val main = Handler(Looper.getMainLooper())
  private val window get() = activity.window
  private val content: View get() = window.decorView.findViewById(android.R.id.content)
  private val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /** the page's end of the channel: none till it says hello */
  private var page: JavaScriptReplyProxy? = null
  /** what the page was last told: only what changed goes */
  private var told = JSONObject()

  // the bars as the GUI wants them (hidden: the panel's own way), and as Android says they are
  private var statusBarShown = false
  private var navigationBarShown = false
  private var statusBarWhiteText = true
  private var statusVisible = false
  private var navigationVisible = false

  /** the brightness the GUI set (0 to 1), -1: the system's */
  private var brightness = -1.0

  /** the system's brightness setting at its brightest */
  private val brightnessMax: Int by lazy {
    val id = Resources.getSystem().getIdentifier("config_screenBrightnessSettingMaximum", "integer", "android")
    val max = if (id != 0) Resources.getSystem().getInteger(id) else 255
    if (max > 0) max else 255
  }

  /** the web view, see-through till the page has drawn */
  private var view: WebView? = null
  /** the page drawn: the web view and what's around it (beside the bars a GUI shows) black, the splash no longer showing through */
  private val opaque = Runnable {
    content.setBackgroundColor(Color.BLACK)
    view?.setBackgroundColor(Color.BLACK)
  }

  fun attach(webView: WebView) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    view = webView
    webView.setBackgroundColor(Color.TRANSPARENT)
    WebViewCompat.addWebMessageListener(webView, "ivaAndroid", ORIGINS) { _, message, _, isMainFrame, reply ->
      val data = message.data
      if (isMainFrame && data != null) {
        try {
          received(JSONObject(data), reply)
        } catch (e: Exception) {
          e.printStackTrace()
        }
      }
    }
  }

  private fun received(m: JSONObject, reply: JavaScriptReplyProxy) {
    when (m.optString("type")) {
      "hello" -> {
        page = reply
        keys = emptyList()
        keptDown.clear()
        statusBarShown = false
        navigationBarShown = false
        statusBarWhiteText = true
        statusVisible = false
        navigationVisible = false
        setBrightness(-1.0)
        applyBars()
        told = JSONObject()
        report(true)
      }
      "set" -> {
        val c = m.optJSONObject("change") ?: return
        if (c.has("screenBrightness")) setBrightness(c.optDouble("screenBrightness").coerceIn(0.0, 1.0))
        if (c.has("soundOutputVolume")) setVolume(c.optDouble("soundOutputVolume").coerceIn(0.0, 1.0))
        if (c.has("statusBar")) statusBarShown = c.optString("statusBar") == "visible"
        if (c.has("navigationBar")) navigationBarShown = c.optString("navigationBar") == "visible"
        if (c.has("statusBarText")) statusBarWhiteText = c.optString("statusBarText") != "black"
        if (c.has("statusBar") || c.has("navigationBar") || c.has("statusBarText")) {
          // as the GUI wants them, at once: what Android says after is only news if it differs
          statusVisible = statusBarShown
          navigationVisible = navigationBarShown
          applyBars()
        }
        report(true)
      }
      "keys" -> {
        val list = m.optJSONArray("keys") ?: JSONArray()
        keys = (0 until list.length()).mapNotNull { i ->
          list.optJSONObject(i)?.let { Key(it.optInt("keyCode", -1), it.optLong("pressTime", 0), it.optBoolean("intercept")) }
        }.filter { it.code >= 0 }
      }
      "autoLock" -> autoLock(m.optInt("minutes", 0))
      "shown" -> {
        main.removeCallbacks(opaque)
        opaque.run()
      }
    }
  }

  private fun send(m: JSONObject) {
    try {
      page?.postMessage(m.toString())
    } catch (e: Exception) {
      // the page gone (a reload): its successor says hello
      page = null
    }
  }

  // ── the state ─────────────────────────────────────────────────

  private fun round(v: Double) = (v * 10000).roundToInt() / 10000.0

  private fun state(): JSONObject {
    val s = JSONObject()
    s.put("screenBrightness", round(currentBrightness()))
    val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    if (max > 0) s.put("soundOutputVolume", round(audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max))
    // the battery: the last news of it Android keeps
    val b = ContextCompat.registerReceiver(activity, null, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
    if (b != null) {
      val level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
      val scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
      val status = b.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
      val plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
      if (level >= 0 && scale > 0) s.put("batteryLevel", round(level.toDouble() / scale))
      s.put("batteryChargeStatus", when {
        status == BatteryManager.BATTERY_STATUS_FULL -> "full"
        plugged -> if (level >= scale && scale > 0) "full" else "charging"
        status == BatteryManager.BATTERY_STATUS_UNKNOWN -> "unknown"
        else -> "unplugged"
      })
    }
    s.put("statusBar", if (statusVisible) "visible" else "hidden")
    s.put("navigationBar", if (navigationVisible) "visible" else "hidden")
    return s
  }

  /** What changed since the page was last told, to it (quiet: its own doing). */
  private fun report(quiet: Boolean) {
    if (page == null) return
    val now = state()
    val changed = JSONObject()
    for (k in now.keys()) if (told.opt(k)?.toString() != now.get(k).toString()) changed.put(k, now.get(k))
    told = now
    if (changed.length() > 0) send(JSONObject().put("type", "state").put("properties", changed).put("quiet", quiet))
  }

  private fun currentBrightness(): Double {
    if (brightness >= 0) return brightness
    return try {
      (Settings.System.getInt(activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS).toDouble() / brightnessMax).coerceIn(0.0, 1.0)
    } catch (e: Exception) {
      1.0
    }
  }

  /** this window's brightness (not the system's setting): 0 dim but not dark, as iViewer's; -1 the system's again */
  private fun setBrightness(v: Double) {
    brightness = v
    val lp = window.attributes
    lp.screenBrightness = if (v < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else v.coerceAtLeast(0.01).toFloat()
    window.attributes = lp
  }

  private fun setVolume(v: Double) {
    try {
      val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, (v * max).roundToInt(), 0)
    } catch (e: Exception) {
      // do not disturb, a fixed volume
      e.printStackTrace()
    }
  }

  // ── the bars ──────────────────────────────────────────────────

  /**
   * The bars as the GUI wants them: hidden (a swipe from the edge shows
   * them for a while, over the GUI), or shown - the GUI then fits beside
   * them. Again whenever the window gets the focus back (Android shows them
   * on its own on the way).
   */
  fun applyBars() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).let {
      if (statusBarShown) it.show(WindowInsetsCompat.Type.statusBars()) else it.hide(WindowInsetsCompat.Type.statusBars())
      if (navigationBarShown) it.show(WindowInsetsCompat.Type.navigationBars()) else it.hide(WindowInsetsCompat.Type.navigationBars())
      it.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      // light status bars: dark text
      it.isAppearanceLightStatusBars = !statusBarWhiteText
    }
    ViewCompat.requestApplyInsets(content)
  }

  // ── watching the device ───────────────────────────────────────

  private val battery = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = report(false)
  }
  private val volume = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = report(false)
  }
  private val settings = object : ContentObserver(main) {
    override fun onChange(selfChange: Boolean) = report(false)
  }

  fun start() {
    ContextCompat.registerReceiver(activity, battery, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
    // (the system's own broadcast; whoever sends it, the volume is read anew)
    ContextCompat.registerReceiver(activity, volume, IntentFilter("android.media.VOLUME_CHANGED_ACTION"), ContextCompat.RECEIVER_EXPORTED)
    activity.contentResolver.registerContentObserver(Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS), false, settings)
    // black once the page has drawn (opaque); till then the splash, behind it, shows
    main.postDelayed(opaque, SPLASH_MS)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      // room for the bars the GUI shows; a hidden one swiped out lies over the GUI
      val status = if (statusBarShown) insets.getInsets(WindowInsetsCompat.Type.statusBars()) else Insets.NONE
      val nav = if (navigationBarShown) insets.getInsets(WindowInsetsCompat.Type.navigationBars()) else Insets.NONE
      v.setPadding(nav.left, status.top, nav.right, nav.bottom)
      val s = insets.isVisible(WindowInsetsCompat.Type.statusBars())
      val n = insets.isVisible(WindowInsetsCompat.Type.navigationBars())
      if (s != statusVisible || n != navigationVisible) {
        statusVisible = s
        navigationVisible = n
        report(false)
      }
      insets
    }
  }

  fun stop() {
    try {
      activity.unregisterReceiver(battery)
      activity.unregisterReceiver(volume)
      activity.contentResolver.unregisterContentObserver(settings)
    } catch (e: Exception) {
      e.printStackTrace()
    }
    main.removeCallbacks(letLock)
  }

  // ── hardware keys ─────────────────────────────────────────────

  private data class Key(val code: Int, val pressTime: Long, val intercept: Boolean)
  private var keys = listOf<Key>()
  /** the keys down now, and whether each went down kept from the system */
  private val keptDown = HashMap<Int, Boolean>()

  /** a key let go after `held` ms, to the page */
  private fun heard(code: Int, held: Long) =
    send(JSONObject().put("type", "key").put("keyCode", code).put("held", held))

  /**
   * A key event (Back aside: Android hands it to the back callback): a
   * watched key's release to the page; one an intercept watches kept from
   * the system - unless let go before its press time: then the system gets
   * that press after all. `pass`: the activity's own dispatch.
   */
  fun keyEvent(event: KeyEvent, pass: (KeyEvent) -> Boolean): Boolean {
    val code = event.keyCode
    if (code == KeyEvent.KEYCODE_BACK) {
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) backDownAt = event.downTime
      return pass(event)
    }
    val mine = keys.filter { it.code == code }
    if (mine.isEmpty() && !keptDown.containsKey(code)) return pass(event)
    return when (event.action) {
      KeyEvent.ACTION_DOWN -> {
        if (event.repeatCount == 0) keptDown[code] = mine.any { it.intercept }
        if (keptDown[code] == true) true else pass(event)
      }
      KeyEvent.ACTION_UP -> {
        val kept = keptDown.remove(code) ?: false
        val held = event.eventTime - event.downTime
        if (mine.isNotEmpty()) heard(code, held)
        when {
          !kept -> pass(event)
          mine.any { it.intercept && it.pressTime <= held } -> true
          // too short to be kept: the system's own effect after all - a volume key's done by Android
          // outside the activity's dispatch (a key passed on again would change nothing), so here
          code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_MUTE -> {
            val direction = when (code) {
              KeyEvent.KEYCODE_VOLUME_UP -> AudioManager.ADJUST_RAISE
              KeyEvent.KEYCODE_VOLUME_DOWN -> AudioManager.ADJUST_LOWER
              else -> AudioManager.ADJUST_TOGGLE_MUTE
            }
            audio.adjustSuggestedStreamVolume(direction, AudioManager.USE_DEFAULT_STREAM_TYPE, AudioManager.FLAG_SHOW_UI)
            true
          }
          else -> {
            pass(KeyEvent.changeAction(event, KeyEvent.ACTION_DOWN))
            pass(event)
          }
        }
      }
      else -> if (keptDown[code] == true) true else pass(event)
    }
  }

  // Back: Android's back callback (a key, a swipe); held from the swipe's start or the key's press
  private var backStartedAt = 0L
  private var backDownAt = 0L

  fun backStarted() {
    backStartedAt = SystemClock.uptimeMillis()
  }

  fun backCancelled() {
    backStartedAt = 0
  }

  /** Back: to the page if watched; whether a watch keeps it from the panel (which goes to the back) */
  fun backPressed(): Boolean {
    val now = SystemClock.uptimeMillis()
    val from = if (backStartedAt > 0) backStartedAt else if (backDownAt > 0) backDownAt else now
    backStartedAt = 0
    backDownAt = 0
    val mine = keys.filter { it.code == KeyEvent.KEYCODE_BACK }
    if (mine.isEmpty()) return false
    val held = now - from
    heard(KeyEvent.KEYCODE_BACK, held)
    return mine.any { it.intercept && it.pressTime <= held }
  }

  // ── the auto-lock ─────────────────────────────────────────────

  /** minutes without a touch the screen stays on; 0: always (a panel on the wall) */
  private var lockMinutes = 0
  private val letLock = Runnable { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }

  private fun autoLock(minutes: Int) {
    lockMinutes = minutes.coerceAtLeast(0)
    touched()
  }

  /**
   * A touch, a key, the panel in front again: the screen stays on - for
   * lockMinutes more, if there's a delay; then it's the device's own timeout
   * that turns it off.
   */
  fun touched() {
    main.removeCallbacks(letLock)
    if (window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON == 0) {
      window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    if (lockMinutes > 0) main.postDelayed(letLock, lockMinutes * 60_000L)
  }

  companion object {
    /** the panel's own page (Tauri's origin on Android) */
    private val ORIGINS = setOf("http://tauri.localhost", "https://tauri.localhost")

    /** the web view opaque again by then, whether or not the page said it has drawn */
    private const val SPLASH_MS = 5000L
  }
}
