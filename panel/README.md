# iva panel

An app for the panel itself: a GUI (`.gui`) runs on iva's own runtime
(`../src/runtime`, the one `iva dev` previews with), full screen, instead of
in iViewer - and it browses GUIs the way a browser browses pages. Built with
Tauri 2 for Android (and the desktop); the systems' sockets - TCP clients and
servers, UDP, TLS, DNS, the HTTP server - are real, from the app's Rust side
(`src-tauri/src/plugins`: [agapi](https://github.com/shabunin/agapi)'s host, its mDNS and device plugins left out).

Why: iViewer for Android isn't maintained any more, and 5.0.7 crashes on
Android 16 once a page whose gestures were touched goes away - its
GestureRecognizer recycles a VelocityTracker in `finalize()` (seen in the
phone's crash log). Nothing in a .gui can avoid that.

```
panel/
  index.html, main.ts   the page: the GUI full screen, the address bar, the settings
  loader.ts             a GUI from a web server: .gui, zipped GUI, iva serve
  store.ts              the GUIs kept on the device (IndexedDB; in the app a zip is the app's)
  vite.config.ts        the runtime's host stand-ins -> the real Tauri APIs
  src-tauri/            the app: Rust host, Tauri config, Android project (gen/android)
```

## Using it

On first start it runs the demo (below); the settings ask for the GUI: `iva serve`'s address
(`http://192.168.1.10:8019`), a `.gui` on a web server, or a zipped GUI
(`.gui.zip`); `?page=Name` after it is the page to start on. Or **Demo**:
the iva/ui gallery, built into the app (`scripts/demo.mjs`, a zipped GUI
with every size: the one shaped like the screen runs) - no server needed. That is the
panel's default GUI: what it starts with, where `CF.loadGUI(null)` goes.
From `iva serve` it reloads on every rebuild, and its log (`CF.log`, errors,
page flips) goes to iva serve's console, as with iViewer.

The main window is the GUI and nothing else. Settings: three fingers on the
screen (held a moment), Ctrl+S or F1 on a keyboard (a phone's own, a desktop's), or a
finger held in the top-left corner for 3 s. Ctrl+R loads the GUI again from
its server, past the copy kept. The last errors are listed in the settings.

## A browser of GUIs

GUI links are followed the way a browser follows links: `CF.loadGUI(url)`
and `CF.openURL(url)` from a script, a button's `href="cf://..."`, relative
to the GUI they are in (`CF.loadGUI('../lights/Lights.gui?page=Kitchen')`).
`CF.openURL` with a GUI's URL (a `.gui`, a zipped GUI, an Upload Service's
root) loads it; a web page, `tel:` or `mailto:` opens in the device's own
app for it. `CF.loadGUI('')` is the GUI again, `CF.loadGUI(null)` the
default; of its settings, `startPage`, `reloadGUI` / `reloadAssets` (the
server's copy, not the one kept), `rememberLastGUI` (false: shown, not made
the next start's), `showPreloadStatus` and `disconnectOnSuspend` are
honoured.

The **address bar** (Settings, View: Address bar; Ctrl+L puts the cursor in
it) shows where the panel is - the GUI's URL with `?page=` the page shown,
following page flips - with back, forward and reload. Type an address to go
there: another page of this GUI flips to it, this GUI again reloads it from
its server, another GUI is loaded. Back and forward go through the GUIs
visited (not a GUI's own pages). The forms it takes: see
`../src/runtime/location.ts`. Off, the GUI has the whole screen.

Also in View: **Outline** (every element's bounds and joins, the preview's
outline mode), the **frame rate** in the corner, and whether the systems
disconnect while the panel sleeps.

`examples/browse` is three GUIs linking to one another, to try it with.

## Copies on the device

The GUI is kept on the device once it has loaded (the last four GUIs used):
a zipped GUI as it came, iva serve's whole build (`/__iva/gui.zip`: its web
pages and the assets scripts load too), or a `.gui` and the files it names.
The next start runs that copy at once and asks the server behind it whether
it has another version (`If-None-Match`, `If-Modified-Since`, else the bytes
compared); if it has, it's kept and runs at once, on the page shown. The same
when the app comes back to the front. Without its server the copy runs on.
`CF.loadGUI` with `reloadGUI` (iva serve's live reload) and Ctrl+R load the
server's. Nothing kept and no server: it tries again every 5 s.

In the app a zip - a zipped GUI, iva serve's `/__iva/gui.zip` - never
passes through the page. The app downloads it itself, straight to the GUI's
folder on the device (`src-tauri/src/unpack.rs`, `gui_fetch`; the loading
bar fills as it comes), and keeps it there as the copy: `kept.zip`, its
ETag and Last-Modified in `kept.json`, only a note of it in the page's
storage. The size the screen runs is unpacked from it, the other
orientation's from the same archive when the device turns; the page only
asks what's in it (its names, its `.gui`s to choose a size from). The check
for a newer version goes from the app too, with `If-None-Match` and
`If-Modified-Since`, and a download of the very bytes kept is no newer
version. A GUI with no copy kept has its archive let go once unpacked. A
copy an older panel kept in the page (the archive in IndexedDB) is replaced
by the app's own at its first check. In a browser (no app) the archive
itself is kept in IndexedDB.

The settings list the GUIs the panel knows - shown, the default, visited,
kept - each with its copy's state, and per GUI: whether a copy is kept at
all, one saved now (fetched from the server before its turn to run), one
cleared; and a button to clear every copy. `http://host:8019` and
`http://host:8019/` are one GUI, kept once.

A link that drops a file now and then (ZeroTier does) gets a script asked
for again, in rounds; one still missing is said on screen for a while, and a
whole copy kept runs rather than a load short of a script (Ctrl+R asks the
server again). A GUI without `iva-http.js` would have a web server nobody
answers: blank web views.

In the background the GUI sleeps, as in iViewer: `CF.GUISuspendedEvent`, its
systems disconnect ("Disconnect on Exit/Sleep" - `CF.loadGUI("",
{ disconnectOnSuspend: false })` or the settings keep them), page timers and
scripts' timers stop; on coming back `CF.GUIResumedEvent`, the systems
connect again, and `CF.NetworkStatusChangeEvent` if the network changed
meanwhile. Back puts the app in the background, as Home does.

## The device

The GUI's scripts have the phone as iViewer gives it to them, through a
message channel between the page and the app's activity (`window.ivaAndroid`,
offered to the panel's own page only - no web view in a GUI gets it; the
page's side is [device.ts](device.ts), the app's
[PanelDevice.kt](src-tauri/gen/android/app/src/main/java/tech/bobalus/iva/panel/PanelDevice.kt)):

- `CF.device.screenBrightness`, `soundOutputVolume` (the media volume),
  `batteryLevel` and `batteryChargeStatus` are the phone's, and
  `CF.DevicePropertyChangedEvent` tells of each change the phone makes: the
  user's brightness or volume, the battery, the bars shown or hidden.
- `CF.setDeviceProperty`: the brightness (this window's, not the system's
  setting; 0 is dim, not dark), the volume, the status bar (shown, hidden,
  its text white or black) and the navigation bar. A bar shown takes its
  room: the GUI fits beside it. A script's own change raises no event.
- `CF.interceptHardwareKey(keyCode, pressTime, mode, callback)`: Back, the
  volume keys or any other key (Android's key code; a phone's own keyboard
  too) let go after being held at least `pressTime` ms calls
  `callback(keyCode, held)`. `CF.KEYPRESS_INTERCEPT` keeps such a press from
  the system - a shorter one it gets after all - and `CF.KEYPRESS_OBSERVE`
  leaves the key its usual effect. Back's hold counts from the key's press or
  the swipe's start, as Android tells them.
- `CF.loadGUI`'s `autoLockDelay` (minutes, also in the settings: "Screen
  stays on"): the screen stays on for so long without a touch, then the
  device's own timeout turns it off. 0, the default: always on.

Each GUI starts with the panel's own: the system's brightness, both bars
hidden, no keys watched.

The page's channel to the app's Rust side (Tauri's IPC: sockets, HTTP, the
kept GUIs) is the panel's own page's too: wry offers it to every frame, so
[PanelWebView.kt](src-tauri/gen/android/app/src/main/java/tech/bobalus/iva/panel/PanelWebView.kt)
swaps it for a message channel of the same name taken from the panel's
origin and main frame only. Another site's page in a GUI's web view can't
run the app's commands.

## Sockets

A system's socket lives on the app's Rust side; the system in the page owns
exactly one, or none, at every moment:

- **Start.** The GUI's systems start once its scripts have run and its first
  page is drawn. A system started again while it runs (a script's
  `CF.setSystemProperties`, IvaHttp's own self-check) keeps the socket it has.
  A server switched off and on listens again once the host has let its old
  port go (a second at most), not on a port it still holds itself.
- **Connections.** An Always On client connects again 3 s after a drop, then
  half as long again each time up to 30 s (a little jitter), and at once as
  soon as a connection has held 5 s. Every client connection asks for no
  delay and TCP keepalive (TLS's too): a first probe after 10 s quiet, then
  10 a second apart, so a far end that went silent is found out in about 20 s;
  on Android (and Linux) a write it doesn't acknowledge fails as soon
  (TCP_USER_TIMEOUT), not after the OS's minutes of resends. A far end that
  stops reading holds up its own socket's writes only: other sockets go on,
  and a close (the system's, a reload's) lets go of what it never took.
- **First bytes.** A device that speaks first (a banner as it connects, a
  server's client that sends at once) is heard: what the host tells of a
  socket before the page has its connect's or listen's answer is kept for it
  (10 s, at most 64 events each for TCP, TLS and servers) and given after
  `connect`, or `connection` for a server's client.
- **Sleep.** Screen off or the app in the background: every system closes
  (iViewer's "Disconnect on Sleep"; the View setting keeps them). A system a
  script enables meanwhile opens nothing until the wake. Awake again, the same
  systems start, and the network is looked at.
- **Another network.** When the device's address changes (the page's online
  and offline events, a look every 15 s, the wake), clients connect anew at
  once, UDP sockets bind again, servers stay; scripts hear
  `CF.NetworkStatusChangeEvent`.
- **Reload and restart.** A reload (another GUI, Ctrl+R, a newer build) first
  stops the systems and waits for their ports; a page starting afresh closes
  whatever a page before left on the host and lists it in the settings'
  errors. An app restart loses every connection, by design: the GUI connects
  again on start. Only persisted tokens survive.
- **The web view's renderer gone.** When Android's web view loses its
  renderer (a crash, or Android takes its memory back), the panel makes a new
  web view and starts the page again - at once, or when the app is next in
  front - as a reload does: the page's start closes what the last one left,
  and the settings' errors say why. Without this Android would end the app.

`test/socket-lifecycle.test.ts` runs these through sleep and wake, a server
switched off and on, a link that keeps dropping, another network and a reload;
`test/host-early-events.test.ts` devices that speak first, and
`cargo test --lib plugins::net` (in `src-tauri`) the keepalive and a peer that
stops reading.

## Building

CI builds the Android APK on every push that touches `panel/` or the runtime
(`.github/workflows/panel.yml`; `gh run download -n iva-panel-apk`), arm64;
start the workflow by hand for `armv7` too. Locally (Android SDK, NDK, JDK 17
and Rust's Android targets):

```bash
npm run panel:android
```

The desktop app: `npx tauri dev` / `npx tauri build` in `panel/`.

The APK is signed with a development key kept in the repo
(`src-tauri/gen/android/keystore`), so every build installs over the last
one. A release for others needs a key of its own, out of the repo.

`node panel/scripts/icons.mjs` draws the icons (desktop and Android).
