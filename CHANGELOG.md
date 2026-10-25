# Changelog

## 0.1.2 (26 October 2026)

`iva serve` is now found on the network: the iva panel's settings list the
servers the device reaches and load one with a tap, so no address has to be
typed on the panel. 0.1.1 is withdrawn: use these downloads, which have its
fixes too. What iva is and does, and its known limits, are under 0.1.0 below.

### Added

- `iva serve` is advertised on the network while it runs (mDNS / DNS-SD): an
  `_iva._tcp` service named after the project, on each address it prints (a
  LAN, ZeroTier; with `--host`, that one), each network answered with its own
  address. The TXT record has the path to load, iva's version, the project's
  name, what is served (a project, a `.gui`, a folder), the sizes and the
  machine's name. A name someone else serves on the network becomes
  `Name (2)`, and goodbyes go out when it stops. `--no-mdns` turns it off.
- Panel: the settings list the `iva serve`s the device reaches under
  **Found on the network** (the project, the machine, address and port,
  sizes, iva's version); a tap loads one, as typing its address and Load
  would. The panel asks on each of the device's networks (Wi-Fi, a wired LAN,
  a VPN) and `iva serve` answers by unicast, so it works over the ZeroTier app
  on Android, which carries the panel's multicast query out but may bring
  none in. A network that doesn't carry multicast from the device to the
  computer (a Wi-Fi with client isolation, many guest networks, Tailscale)
  hides it: type the address there. Checked on Android over ZeroTier; not yet
  tried in the desktop builds.

### Fixed

- `CF.startLookup` with port 5353 taken by another program (the lookup then
  asks from a port of its own): the answers to such queries hold 10 s, and the
  lookup now asks every 4 s, so a service found no longer drops out and comes
  back between its queries.

### Downloads

The panel app; the CLI comes from the repository (below).

| System | File | Notes |
|---|---|---|
| Android 7 and newer | `iva-panel-0.1.2-android.apk` | Signed with the release key: installs over 0.1.1 and 0.1.0, their kept GUIs and settings kept. A panel signed with the development key (a CI or local build from before 0.1.0) has to be uninstalled first; its kept GUIs and settings go with it. Needs an up-to-date Android System WebView. |
| Linux x86_64 | `iva-panel-0.1.2-linux-x86_64.AppImage` | `chmod +x` and run. Built on Ubuntu 22.04: glibc 2.35 or newer. |
| Windows 10 and 11, x64 | `iva-panel-0.1.2-windows-x64.exe` | The app alone, nothing to install. Needs the WebView2 runtime (Windows 11 has it; Windows 10 with an up-to-date Edge does). Not code signed: SmartScreen may warn. |
| macOS, Apple silicon and Intel | `iva-panel-0.1.2-macos-universal.zip` | Not signed by a developer: the first open is refused. On macOS 15 and newer, allow it in System Settings, Privacy & Security, Open Anyway; before, right click the app, Open. |

iOS: not yet.

### Install the CLI

Node.js 22 or newer:

```bash
git clone https://github.com/shabunin/iva.git
cd iva
npm install
npm link        # puts `iva` on your PATH
```

Then `iva create my-panel --template demo`, `iva dev` in it, and http://127.0.0.1:5180/.

Updating a clone of 0.1.1 or 0.1.0: `git fetch --depth 1 origin tag v0.1.2` and `git checkout v0.1.2` (or `git pull` on main), then `iva types` in each project, which rewrites its `iva.d.ts` and the copied docs. A running `iva serve` is found on the network once it is started again with this version.

## 0.1.1 (25 October 2026)

Withdrawn: its downloads are no longer published - use 0.1.2's, which have
these fixes too. What follows still describes them.

A fix release. The iva panel could get stuck reloading a GUI from `iva serve`,
and `iva serve` built twice for drawings a project makes and could leave a
panel on an older build. 0.1.0 is withdrawn: use these downloads. What iva is
and does, and its known limits, are under 0.1.0 below.

### Fixed

- Panel: a GUI from `iva serve` could reload every few seconds for good after
  a couple of rebuilds close together, running the copy kept before each time
  (the settings listing "being downloaded already" and "the copy kept is
  another now"). A download of a GUI now waits for the one going instead of
  failing, and a copy the app kept after a reload is the one the next start
  runs. Clear and Load in the settings is no longer needed to get out of it.
- `iva serve` / `iva dev`: a project that writes files while it builds (pictures
  it draws as it evaluates, read back as build inputs) no longer builds a second
  time for them - also when it is evaluated once a look (`<Project themes>`) and
  the files are seen while the build still runs. A save made during a build
  still builds again.
- `iva serve`: a rebuild between a panel's fetch of the `.gui` and of its
  scripts gave that `.gui` the newer build's live script, and the panel stayed
  on the older build until the next save (iViewer and the iva panel alike). The
  `.gui` now names its own build's live script (`iva-live-<version>.js`), so the
  panel sees the newer build and reloads.

### Downloads

The panel app; the CLI comes from the repository (below).

| System | File | Notes |
|---|---|---|
| Android 7 and newer | `iva-panel-0.1.1-android.apk` | Signed with the release key: installs over 0.1.0, its kept GUIs and settings kept. A panel signed with the development key (a CI or local build from before 0.1.0) has to be uninstalled first; its kept GUIs and settings go with it. Needs an up-to-date Android System WebView. |
| Linux x86_64 | `iva-panel-0.1.1-linux-x86_64.AppImage` | `chmod +x` and run. Built on Ubuntu 22.04: glibc 2.35 or newer. |
| Windows 10 and 11, x64 | `iva-panel-0.1.1-windows-x64.exe` | The app alone, nothing to install. Needs the WebView2 runtime (Windows 11 has it; Windows 10 with an up-to-date Edge does). Not code signed: SmartScreen may warn. |
| macOS, Apple silicon and Intel | `iva-panel-0.1.1-macos-universal.zip` | Not signed by a developer: the first open is refused. On macOS 15 and newer, allow it in System Settings, Privacy & Security, Open Anyway; before, right click the app, Open. |

iOS: not yet.

### Install the CLI

Node.js 22 or newer:

```bash
git clone https://github.com/shabunin/iva.git
cd iva
npm install
npm link        # puts `iva` on your PATH
```

Then `iva create my-panel --template demo`, `iva dev` in it, and http://127.0.0.1:5180/.

Updating a clone of 0.1.0: `git fetch --depth 1 origin tag v0.1.1` and `git checkout v0.1.1` (or `git pull` on main), then `iva types` in each project, which rewrites its `iva.d.ts` and the copied docs.

## 0.1.0 (25 October 2026)

Withdrawn: its panel could get stuck reloading a GUI from `iva serve` (fixed
in 0.1.1), and its downloads are no longer published - use 0.1.2's. What
follows still describes iva.

iva's first release: CommandFusion iViewer GUIs written as JSX, built into
`.gui` files that GUI Designer opens and iViewer runs, previewed live on iva's
own CommandFusion runtime, and run by the iva panel app on Android, Linux,
Windows and macOS.

### Downloads

The panel app; the CLI comes from the repository (below).

| System | File | Notes |
|---|---|---|
| Android 7 and newer | `iva-panel-0.1.0-android.apk` | Signed with the release key. A panel installed from an earlier build (signed with the development key) has to be uninstalled first; its kept GUIs and settings go with it. Needs an up-to-date Android System WebView. |
| Linux x86_64 | `iva-panel-0.1.0-linux-x86_64.AppImage` | `chmod +x` and run. Built on Ubuntu 22.04: glibc 2.35 or newer. |
| Windows 10 and 11, x64 | `iva-panel-0.1.0-windows-x64.exe` | The app alone, nothing to install. Needs the WebView2 runtime (Windows 11 has it; Windows 10 with an up-to-date Edge does). Not code signed: SmartScreen may warn. |
| macOS, Apple silicon and Intel | `iva-panel-0.1.0-macos-universal.zip` | Not signed by a developer: the first open is refused. On macOS 15 and newer, allow it in System Settings, Privacy & Security, Open Anyway; before, right click the app, Open. |

iOS: not yet.

### Install the CLI

Node.js 22 or newer:

```bash
git clone https://github.com/shabunin/iva.git
cd iva
npm install
npm link        # puts `iva` on your PATH
```

Then `iva create my-panel --template demo`, `iva dev` in it, and http://127.0.0.1:5180/.

### The CLI and the compiler

- `iva create my-panel` makes a project from the `blank` or `demo` template, or from an existing GUI with `--from Old.gui`. It writes `iva.d.ts` and `jsconfig.json`, so VS Code autocompletes every element and prop, shows docs on hover and underlines typos. It also copies iva's docs into the project (`IVA.md`, `IVA-UI.md`, `IVA-WEB.md`, `IVA-DRIVERS.md`) and adds `AGENTS.md` / `CLAUDE.md` for AI assistants. After you update iva, `iva types` rewrites `iva.d.ts` and the copied docs; it leaves your `jsconfig.json` alone.
- **33 JSX elements, no import needed.** Pages (landscape / portrait), subpages, buttons, text, images, sliders, gauges, lists, inputs, web views, video, gestures, sounds, and systems: TCP, UDP or HTTP, client or server, over SSL if needed, with commands, feedbacks, captures, macros, tokens, scripts and themes. Project files are plain JavaScript or TypeScript run at build time: components, loops, npm packages. `<Script entry>` bundles a module and its npm imports into one iViewer script. Every element and prop is listed in `docs/components.md`.
- **Style without hand-written themes.** Style props (`bg`, `font`, `bold`, `align`, ...) become the `.gui`'s CSS themes: one generated theme per distinct style. Fonts get the device's font name from GUI Designer's font list. The build draws what iViewer can't as PNG images, with `@2x` copies: rounded corners and borders, Font Awesome Free icons (`fa('lightbulb')`), slider tracks, arcs, knobs, ticks and colour wheels.
- **Named joins and actions.** `join="volume"` gets a number, starting at 1000 for each join type. The names are written to `dist/joins.json` and to a `Joins` object your scripts can use (`CF.setJoin(Joins.s.title, ...)`). Buttons can run commands, macros and JS, flip pages, repeat or hold, and open another GUI (`href="cf://..."`). `setProps()` animates elements through `CF.setProperties`, and `motion={...}` (on enter, while pressed, following a join) moves them without a script of your own.
- **Dark and light looks:** `<Project themes={['dark', 'light']}>` builds each look and merges them into one `.gui`. `IvaTheme.set()` / `IvaTheme.toggle()` switch looks on the panel, and the panel starts in the last look shown.
- **One project, several screens:** `<Project sizes={['1920x1080', '1400x1400@3x']}>` builds a GUI for each size from the same JSX, laid out from `screen()`. With `@3x`, a dense phone screen is laid out at a third of its size, iViewer scales it up, and iva draws its images at 3x. `--size` builds, previews or serves just one size.
- **`iva build`** writes `dist/`: the `.gui`, `assets/` (your files, iva's drawings in readable folders per component type, and the scripts in `assets/scripts/`) and `joins.json`. Each extra size goes in `dist/<W>w<H>h/`. `--zip` also writes one `.gui.zip` holding every size, and iViewer 4.1 or later loads the size named for its screen. Output is checked against GUI Designer: it opens there and runs in iViewer.
- **Errors you can act on.** Build errors give the file and line, with "did you mean" for misspelt elements, props, icons, subpages and devices. `iva check` runs TypeScript over the project with iva's types (what the editor underlines) and a test build at every size. It exits non-zero on problems, and first rewrites `iva.d.ts` if it came from another iva version.
- **`iva dev`** serves a live preview at http://127.0.0.1:5180/ on iva's own CommandFusion runtime, with real TCP, UDP, TLS and HTTP connections from your machine to the devices. Saving any file the project is built from rebuilds it and reloads the page. The preview also opens `.gui` files, folders of them (with a GUI picker), zipped GUIs and GUIs on a web server, and follows GUI links. `<Web>` shows the real page and `<Input>` is a real text field. The toolbar has orientation, outlines with element names, FPS, zoom, pan and fullscreen. `--host 0.0.0.0` lets you open it from a tablet on the LAN.
- **`iva serve`** gives the project to iViewer on a real device the way GUI Designer's Upload Service does (port 8019). It prints the address for each network (ZeroTier, Tailscale and other VPNs labelled) and a `cf://` QR code. Saving rebuilds the project and the panel reloads itself; if a build fails, the device keeps the last good one. The panel's `CF.log`, script errors, its servers' traffic and its web apps' errors appear in your terminal. It also serves a plain `.gui` (re-read when GUI Designer saves it) or a folder of GUIs that link to each other. `--no-live` serves the project without the reload script, so the panel's log doesn't come either.
- **`iva decompile Project.gui my-panel`** turns any `.gui` into JSX (app, themes, systems, pages, subpages, assets, scripts). It then compiles the result back and compares it element by element with the original. All 48 CommandFusion demo GUIs come back as the same `.gui`. Attributes and elements iva doesn't model are kept in `xml={{...}}` and `<Raw>`.
- **`iva designer`** builds the project and opens it in CommandFusion GUI Designer. It also opens a `.gui` as it is.

### The library

- **iva/ui, 46 components.** `import { createUi } from 'iva/ui'` for the set in your theme, or `import { Tile, Card } from 'iva/ui'` for the default look. Each compiles to ordinary iViewer elements. iva draws the rounded shapes and Font Awesome icons at build time. A small panel script (`iva-ui.js`) ships once, only when a component needs it. Every component is shown in `examples/gallery`.
- **Themes.** `createUi()` takes colours, a font and a corner radius. There is a dark look (`defaultTheme`) and a light one (`lightTheme`). With `<Project themes={['dark', 'light']}>` the panel switches between them at runtime (`themeToggle` on the Header).
- **Controls:** cards, tiles, icon buttons, badges, stats, toggles, sliders, steppers, segmented controls, scene bars, dimmers, blinds, check boxes, radio groups, select boxes, list rows, nav cards. Joins can be names or numbers. An analog join's 0..65535 maps to the `min`..`max` you give, and `IvaUI.set(join, value, min, max)` sets one from a script. Without a `value`, a Slider or a Stepper leaves its join as it is and shows what it holds.
- **Dials and pickers:** Knob, Thermostat (setpoint knob, room temperature, modes), ColorPicker (wheel, brightness, swatches, r/g/b joins), TimePicker and DatePicker (drums), NumberField (keypad with a range check), SearchSelect (filters as you type), TextField, PinPad, WeekDays (a day bitmask), AlarmCard. Pickers open as a sheet or as a dropdown.
- **Lists, tables, alarms:** DataList, ScrollBox, DataTable (search, sort on a header tap, row tones, badge columns, row selection; rows from props or from a JSON serial join), AlarmTable (conditions checked on the panel; All / Active / Unacked; Ack and Ack all) and AlarmBanner. Scripts can raise, clear and ack alarms with `IvaAlarms`.
- **Layout and navigation:** Header (title, breadcrumbs, clock), SideMenu (slides in; opens with a swipe from the left edge), Breadcrumbs, Pager, DragDrop, Loader, ConfirmDialog. `ui.grid()` places cards for whatever panel size is being built, `ui.ScrollArea` scrolls a page taller than the screen, and `ui.Screens` puts a section on one page as tabs (for phones).
- **Charts.** `ui.Trend` (uPlot) draws joins over time: range buttons, paging back through the past, Live, and a touch to read values. The panel records the joins itself, or a history handler you write supplies older data (from a database, say). `ui.Chart` (Chart.js) does bar, line, doughnut, pie, radar and polarArea charts, with data from props, live joins, or JSON in a serial join.
- **MQTT** (`iva/drivers/mqtt`, `<Mqtt>`): an MQTT 3.1.1 client running in the panel's JavaScript.
  - Connection: user and password, keepalive, QoS 0 and 1, retain, `+` / `#` topic filters, TLS (`ssl`). It reconnects and subscribes again by itself.
  - Topics to joins and back: a field of a JSON payload, number ranges, on/off payloads, payload templates. What a subscription set is not published back.
  - A status join and a message log join. `IvaMqtt.publish / subscribe / reconnect` from scripts. Several `<Mqtt system="...">` elements can put their topics on the one connection a `<Mqtt name="...">` brings. Example: `examples/mqtt`.
- **Matter** (`iva/drivers/matter`, `<Matter>`): matter.js 0.17 as a controller on the panel.
  - Finds devices with Bonjour, or by an address you give.
  - Commissions devices already on the network from their setup code (11 or 21 digits, or the QR code's `MT:` text).
  - Controls OnOff, LevelControl and ColorControl (hue, saturation) through joins. Device state comes back over a subscription.
  - The fabric is kept in persisted tokens. Found devices come as JSON rows for a DataTable.
  - `examples/matter` has a probe page and a virtual light (`virtual-light.mjs`) for trying it without hardware. Tested with a Nanoleaf light from the iva panel app.
- **UPnP AV** (`iva/drivers/upnp`, `<Upnp>`): a control point.
  - Finds media servers (MiniDLNA, Plex, a NAS) and renderers (Kodi, gmediarender, TVs) by SSDP, or by description URLs you list.
  - Browses a server's library into lists (folders, tracks, album art) and plays a track on the renderer you pick, queuing the next one (gapless where the renderer supports it).
  - Play, pause, stop, next and previous, seek, volume and mute. Title, artist, album, art, elapsed time and duration go to joins.
  - Example: `examples/upnp`. A fake server and renderer: `node --import tsx test/upnp-fake.ts`.
- **Web apps** (`<WebApp entry="./web/x.js">`): write a page as a JS or TS module. three.js, Chart.js and uPlot come with iva, and your own npm packages work too. iva bundles the page, and the panel's own web server serves it to a web view where the element sits. In the page, `panel` from `iva/web` reads and sets joins (`on`, `set`), calls panel functions (`call`), loads project files (`asset`, `url`) and reads recorded history. All apps share one port, and each address carries a key that is new every start. `<Web url="page.html">` loads a page of the project through the same server, `<Web url="panel:/path">` any path of it, and `IvaHttp.url(path)` gives a keyed address for a web view of your own.
- **`<HttpServer name port handler>`**: your own HTTP server on the panel, on its own port. A script handler answers with `res.json / html / text / bytes / asset`.

### The runtime and the panel

- **iva panel**: an app that runs a `.gui` on iva's own CommandFusion runtime, in place of iViewer: full screen on Android, in a window on a desktop. Downloads: Android (APK, arm64, Android 7 and newer), Linux (AppImage, x86_64), Windows (the `.exe` alone: nothing to install), macOS (the `.app` zipped, for Apple silicon and Intel).
- **The runtime**: the same one `iva dev` previews with. It covers the `.gui` parser, Pixi rendering, pages and subpages, themes, joins and tokens, buttons, sliders, gauges, lists, text fields, gestures, web views, and systems with their commands, feedback and macros. In the panel's settings, Graphics picks the renderer: automatic (WebGL), WebGL 2, WebGL 1, WebGPU or Canvas 2D. If the device lacks the one picked, the next one is used.
- **The CF JavaScript API**: everything documented exists on `CF`, so a script never hits "undefined is not a function". 37 of 44 functions and 19 of 25 events work as documented, among them joins, tokens, tags, properties and animations, lists, page flips, `CF.request`, `CF.send`, Bonjour lookup and publishing, CRC and hashes, and `CF.loadAsset`. Each member's status is in `docs/cf-api-compatibility.md`.
- **Real sockets, from the app**: TCP clients and servers, UDP (multicast and broadcast), TLS, DNS, and HTTP requests. An Always On client connects again after a drop (3 s, backing off to 30 s). A device that goes silent is reported disconnected in about 20 s. A device that speaks first, such as a banner on connect, is heard.
- **Where the GUI comes from**: `iva serve`'s address (the panel reloads on every rebuild, and `CF.log` and script errors go to iva serve's console), a `.gui` on a web server, or a zipped GUI (`.gui.zip`). Add `?page=Name` to start on that page. With nothing set it runs the iva/ui gallery, built into the app: no server needed.
- **A browser of GUIs**: `CF.loadGUI`, `CF.openURL` and `href="cf://..."` follow GUI links, relative to the GUI they are in. Web pages, `tel:` and `mailto:` open in the device's own app. An optional address bar (Settings, View; Ctrl+L to type in it) shows the GUI and the page, has back and forward through the GUIs visited and reload, and goes to an address you type.
- **Copies on the device**: the last four GUIs used are kept and start at once, with or without their server. The server is asked for a newer version in the background; a newer one replaces the copy and runs on the page shown. With no copy and no server, the panel tries again every 5 s. The settings list each GUI with its copy: keep one or not, save one now, clear one, or clear them all.
- **Several sizes, both orientations**: from a zipped GUI or an `iva serve` build with `<Project sizes>`, the size shaped like the screen runs, and the other orientation's when the device turns. On the desktop the window takes the GUI's size, when it fits on the screen.
- **Sleep and wake, as in iViewer**: when the app goes to the background or the screen turns off, the GUI gets `CF.GUISuspendedEvent`, systems disconnect and timers stop. Back in front: `CF.GUIResumedEvent`, systems connect again, and `CF.NetworkStatusChangeEvent` if the network changed. The disconnect can be turned off (the settings, or `disconnectOnSuspend: false`). When the device's address changes, clients reconnect at once.
- **The phone (Android)**: `CF.device` has the brightness, media volume, battery level and charge state, and `CF.DevicePropertyChangedEvent` reports each change. `CF.setDeviceProperty` sets the window's brightness, the volume, and the status and navigation bars. `CF.interceptHardwareKey` takes Back, the volume keys or any other key. The screen stays on while the panel shows; `autoLockDelay` (or the settings) lets it turn off after a set number of minutes without a touch. Back puts the app in the background, as Home does.
- **Settings**: opened by three fingers held on the screen, a finger held 3 s in the top-left corner, or Ctrl+S / F1. They hold the GUI's address (or the demo), the address bar, the outline (every element's bounds and joins), the frame rate, drawing only on change, disconnect on sleep, how long the screen stays on (Android), the renderer, the kept copies and the last errors. Ctrl+R loads the GUI again from its server, past the kept copy.
- **Stays up**: on Android 8 and newer, if the web view's renderer crashes or Android reclaims its memory, the panel starts the page again instead of being closed. On a link that drops files, missing scripts are asked for again, and a complete kept copy runs rather than a GUI short of a script.

### Known limits

**The CLI and the compiler**

- iva is not on npm, and the release files are only the panel app. Install iva from the repository (git clone, npm install, npm link); it needs Node.js 22 or newer. CI runs the tests on Linux only.
- `iva designer` needs GUI Designer installed: on Windows, or under Wine on Linux and macOS. If it isn't in the usual place, set $IVA_DESIGNER (and $IVA_WINEPREFIX).
- `iva designer` builds one size (the project's own, or the one `--size` names) into `dist/`, and that replaces a build of several sizes there.
- `iva create --device` applies only to the blank template; the demo template is always laid out for an iPad.
- `iva decompile` writes no editor types or docs. Use `iva create --from file.gui`, or run `iva types` in the folder afterwards.
- `iva check` type-checks what `jsconfig.json` includes. By default that leaves out `scripts/` (the panel's own JavaScript) and `web/`.
- The preview has no sound (`CF.playSound` and `<Sound>` play nothing), no video playback (`<Video>` shows a still image), no sensors, no WebSocket servers, no CF Main Control System and no iViewer 5 profiles. It keeps the brightness and volume a script sets, but they change nothing, and hardware keys never fire.
- In a `<Web>` showing another site's page, the preview leaves the title join empty, and back / forward only go through URLs the panel itself loaded.
- Dark and light looks must contain the same elements; only colours may differ. Three things are not switched between looks: a slider's thumb image, a page background from an image file, and lists that your own script fills with its default row.
- With `iva serve`, the device must reach your machine: same network, or same VPN (ZeroTier, for example).
- `iva serve` gives official iViewer one size at `/`: the project's own, or the one `--size` names. Only the iva panel gets the archive with every size.
- `iva serve dist/` (a folder of GUIs) serves the files as they are, without live reload.
- In a zipped GUI with several sizes, iViewer loads the first GUI in the archive if no size matches its screen.
- iViewer 5.0.7 for Android starts no system until each one is switched off and on. iva's start code does this, but only in projects that have start code (iva/ui, a web app, or an `<OnStart>`).
- iViewer 5.0.7 crashes on Android 16 when a page whose gestures were touched goes away. The bug is iViewer's; the iva panel app doesn't have it.
- `iva build` refuses an output folder that holds anything other than a previous build, and lists what is in the way.

**The library**

- Official iViewer 5.0.7 for Android has a bug that can crash it after you leave a page where you touched a component with gestures (Knob, Thermostat, ColorPicker, Pager, DragDrop, and the SideMenu's swipes and its tap on the dimmed page). A GUI cannot avoid it: use the iva panel app on Android.
- iViewer shows no list, subpage or gesture inside a list cell. So DataList, DataTable, AlarmTable, ScrollBox, Pager, ColorPicker, Knob, Thermostat and DragDrop stay empty or dead inside a ui.ScrollArea (the build warns). On phones, give them their own tab with ui.Screens.
- The SideMenu opens and closes with a swipe or a tap. It does not follow the finger.
- A Trend's own recording is kept in the panel's memory: it starts empty each time the GUI starts and holds about 1.5 times the longest range (1.5 hours with the default ranges). For anything older, give it a `history` handler.
- Matter commissioning works only for devices already on the network: no BLE, no Thread credentials. Only the OnOff, LevelControl and ColorControl (hue/saturation) clusters are covered. IPv6 is off unless you set `ipv6`.
- Matter does not work on official iViewer 5.0.7 for Android: in a test with a VPN on, its UDP systems sent to the phone itself and Bonjour found nothing. It works on the iva panel app and in iva's preview. iViewer on iOS has not been tried yet.
- Matter's panel script is about 2.2 MB. Nothing else in the GUI may look up `_matter._tcp.` or `_matterc._udp.`: iViewer allows one lookup per service type.
- MQTT has no QoS 2, will messages, MQTT 5 or WebSocket transport. QoS 0 messages published while disconnected are dropped. With `ssl`, iva's runtime accepts any certificate.
- MQTT: if you set a fixed `clientId`, every panel running the GUI uses it, and the broker keeps dropping one for another. Leave it unset unless only one panel runs the GUI.
- UPnP was built and tested against a fake server and renderer (`test/upnp-fake.ts`); no run with a real DLNA server or renderer is recorded yet.
- UPnP has no GENA eventing: the selected renderer is polled every second. It is not known whether official iViewer receives multicast NOTIFYs. Where multicast is blocked (a VPN, a filtering Wi-Fi), list the description URLs in `devices`.
- The panel's web server refuses addresses it did not give out. A `http://127.0.0.1:<port>/` URL typed by hand, or a plain link from one project page to another, shows 'not an address the panel gave'. Use `<Web url="page.html">`, `<Web url="panel:/path">` or `IvaHttp.url(path)`.
- In web apps, load files with `panel.asset()` or `panel.url()`, not `<img src>` or CSS `url()`. In your CSS, size from `window.innerHeight`, not `vh` (Android web views). three.js needs WebGL 2 (iOS 15 or later). A join named `r` or `k` cannot be set.
- The web server's key stops other devices from setting joins, calling handlers or reading files. It does not stop listening: anything connected to the panel's web server sees its answers (join values, app scripts). `<HttpServer>` has no key, and its answers reliably reach the client that asked only while that client is the only one connected.
- `<HttpServer>` reads only a request's head (method, path, query, headers): a request body, such as a POST's, does not reach the handler.
- A GUI loaded as a .zip must include the web apps' bundles (`apps/<name>.js` in the images folder). `iva build` writes them next to the .gui, and `iva build --zip` puts them in the zip.

**The runtime and the panel**

- No iOS or iPadOS build yet.
- Android 7.0 or newer. The release APK is arm64 only. This release has no APK for older 32-bit (armv7) phones; the panel workflow builds one when started by hand.
- On Android the panel runs in the phone's Android System WebView. A WebView never updated from the Play Store (older than about version 85) can't run it.
- An APK signed with the development key (a CI build from before this release, or a local build) will not update to the release APK. Uninstall it first; its settings and the GUIs it kept go with it.
- Windows: x64 only. The .exe is not code-signed, so SmartScreen may stop its first start (More info, Run anyway). It needs the WebView2 runtime, which Windows 10 and 11 already have. Nothing is installed, but its settings and kept GUIs go in the user's AppData, not next to the .exe.
- macOS: signed ad hoc, not by an Apple developer, so macOS refuses the first open. On macOS 14 and older: right click, Open. On macOS 15 and newer: try to open it once, then System Settings, Privacy & Security, Open Anyway.
- Linux: the AppImage is x86_64 and needs glibc 2.35 or newer (Ubuntu 22.04 and later).
- The device API (brightness, volume, battery, status and navigation bars, hardware keys, auto-lock) works only on Android. On the desktop the values a script sets are just kept, and no key is intercepted.
- No sound: CF.playSound and <sound> joins play nothing. A video element shows a still image, and none of the movie events fire.
- No sensors, beacons, push notifications or ApplicationCallbackEvent; CF.startMonitoring is a stub.
- No CommandFusion Main Control System (iva has no CF protocol client).
- CF.loadGUI ignores password, remoteDebugging, remoteDebuggingPort, preloadAllAssets, buttonPressSound, enableMultitasking and enableProximitySensor; profile: URLs are refused.
- CF.networkSSID and CF.device.pushid are empty. CF.MACaddress is a placeholder: 02:00:00:00:00:00 on Android (what Android gives apps), 00:00:00:00:00:00 on a desktop.
- Closing or restarting the app loses every connection; the GUI connects again on start.
- On Windows and macOS a write to a device that went silent can take the OS's own timeout (minutes) to fail; on Android and Linux it fails in about 20 s.
- A web view's title join, and back and forward through links followed inside its page, work only for pages from the panel's own origin. A GUI's own web pages (served from 127.0.0.1) and other sites' pages are from other origins. Back and forward through the URLs the GUI itself loaded always work.
- Animations play in full even when the device's reduced-motion setting is on.
