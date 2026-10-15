# iva panel

An app for the panel itself: a GUI (`.gui`) runs on iva's own runtime
(`../src/runtime`, the one `iva dev` previews with), full screen, instead of
in iViewer. Built with Tauri 2 for Android (and the desktop); the systems'
sockets - TCP clients and servers, UDP, TLS, DNS, the HTTP server - are real,
from the app's Rust side (`src-tauri/src/plugins`: agapi's host, its mDNS
and device plugins left out).

Why: iViewer for Android isn't maintained any more, and 5.0.7 crashes on
Android 16 once a page whose gestures were touched goes away - its
GestureRecognizer recycles a VelocityTracker in `finalize()` (seen in the
phone's crash log). Nothing in a .gui can avoid that.

```
panel/
  index.html, main.ts   the page: settings (the GUI's URL), the GUI full screen
  loader.ts             a GUI from a web server: .gui, zipped GUI, iva serve
  store.ts              the GUIs kept on the device (IndexedDB)
  vite.config.ts        the runtime's host stand-ins -> the real Tauri APIs
  src-tauri/            the app: Rust host, Tauri config, Android project (gen/android)
```

## Using it

On first start it asks for the GUI: `iva serve`'s address
(`http://192.168.1.10:8019`), a `.gui` on a web server, or a zipped GUI
(`.gui.zip`). From `iva serve` it reloads on every rebuild, and its log
(`CF.log`, errors, page flips) goes to iva serve's console, as with iViewer.

The GUI is kept on the device once it has loaded (the last four GUIs used):
a zipped GUI as it came, iva serve's whole build (`/__iva/gui.zip`: its web
pages and the assets scripts load too), or a `.gui` and the files it names.
The next start runs that copy at once and asks the server behind it whether
it has another version (`If-None-Match`, `If-Modified-Since`, else the bytes
compared); if it has, it's kept and runs at once, on the page shown. The same
when the app comes back to the front. Without its server the copy runs on.
`CF.loadGUI` with `reloadGUI` (iva serve's live reload) loads the server's.
Nothing kept and no server: it tries again every 5 s. The settings page tells
whether the GUI is kept (and can forget it).

In the background the GUI sleeps, as in iViewer: `CF.GUISuspendedEvent`, its
systems disconnect ("Disconnect on Exit/Sleep" - `CF.loadGUI("",
{ disconnectOnSuspend: false })` keeps them), page timers and scripts' timers
stop; on coming back `CF.GUIResumedEvent`, the systems connect again, and
`CF.NetworkStatusChangeEvent` if the network changed meanwhile. Back puts
the app in the background, as Home does.

Settings again: hold three fingers on the screen (1.5 s), or one finger in
the top-left corner (3 s), or F1 on a keyboard. The last errors are listed
there too.

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
