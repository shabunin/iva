# iva panel

An app for the panel itself: a GUI (`.gui`) runs on iva's own runtime
(`../src/runtime`, the one `iva dev` previews with), full screen, instead of
in iViewer - and it browses GUIs the way a browser browses pages. Built with
Tauri 2 for Android (and the desktop); the systems' sockets - TCP clients and
servers, UDP, TLS, DNS, the HTTP server - are real, from the app's Rust side
(`src-tauri/src/plugins`: agapi's host, its mDNS and device plugins left out).

Why: iViewer for Android isn't maintained any more, and 5.0.7 crashes on
Android 16 once a page whose gestures were touched goes away - its
GestureRecognizer recycles a VelocityTracker in `finalize()` (seen in the
phone's crash log). Nothing in a .gui can avoid that.

```
panel/
  index.html, main.ts   the page: the GUI full screen, the address bar, the settings
  loader.ts             a GUI from a web server: .gui, zipped GUI, iva serve
  store.ts              the GUIs kept on the device (IndexedDB)
  vite.config.ts        the runtime's host stand-ins -> the real Tauri APIs
  src-tauri/            the app: Rust host, Tauri config, Android project (gen/android)
```

## Using it

On first start it asks for the GUI: `iva serve`'s address
(`http://192.168.1.10:8019`), a `.gui` on a web server, or a zipped GUI
(`.gui.zip`); `?page=Name` after it is the page to start on. That is the
panel's default GUI: what it starts with, where `CF.loadGUI(null)` goes.
From `iva serve` it reloads on every rebuild, and its log (`CF.log`, errors,
page flips) goes to iva serve's console, as with iViewer.

The main window is the GUI and nothing else. Settings: three fingers on the
screen (held a moment), Ctrl+S or F1 on a keyboard (the Titan 2's), or a
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
