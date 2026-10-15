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
  vite.config.ts        the runtime's host stand-ins -> the real Tauri APIs
  src-tauri/            the app: Rust host, Tauri config, Android project (gen/android)
```

## Using it

On first start it asks for the GUI: `iva serve`'s address
(`http://192.168.1.10:8019`), a `.gui` on a web server, or a zipped GUI
(`.gui.zip`). From `iva serve` it reloads on every rebuild, and its log
(`CF.log`, errors, page flips) goes to iva serve's console, as with iViewer.
If the server isn't there it tries again every 5 s.

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
