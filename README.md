# iva — iViewer assistant

Write CommandFusion iViewer interfaces in JSX; iva compiles them into an
ordinary `.gui` (the format GUI Designer writes) and previews them live in a
CommandFusion runtime of its own (`src/runtime`). The iViewer twin of
[`ira`](../i3-web).

```jsx
// app.jsx
export default (
  <Project name="Demo" width={1024} height={768}>
    <Page name="Home" bg="#16191e">
      <Button x={40} y={40} w={200} h={100} join="lights" feedback="toggle" text="Lights"
              bg="#2a313b" active={{ bg: '#2f6fd6' }} />
      <Slider x={40} y={180} w={600} h={40} join="volume" bg="#333a44" fill="#2f6fd6" thumbColor="#fff" />
    </Page>
    <System name="Amp" host="192.168.0.10" port={23} eom="\x0D">
      <Command name="VolUp" send="VOL+\x0D" />
    </System>
  </Project>
);
```

```bash
iva create my-panel --template demo   # or blank; --device "iPhone X"; --from Old.gui
cd my-panel
iva dev        # live preview, rebuilds on save; real TCP/UDP/HTTP to the devices
iva check      # what the editor underlines + a test build
iva build      # -> dist/: the .gui, images, scripts, joins.json (--zip: also one .gui.zip)
iva serve      # to iViewer on a real device (GUI File URL http://<this machine>:8019)
iva designer   # build and open it in CommandFusion GUI Designer
```

(`iva` = `node bin/iva.mjs` from this folder, or `npm link` it.)

`iva build` lays the project out as GUI Designer does with an image folder:

```
dist/
  my-panel.gui          <imagefolder>images</imagefolder>
  images/               the project's images and files (assets/), and iva's own:
    backgrounds/          drawn cards, buttons, rows
    icons/                Font Awesome icons
    controls/             dial, knob, slider frames
    apps/                 web apps (<WebApp>)
    sounds/
  scripts/              <script name="scripts/main.js">, iva's scripts
  joins.json
```

`<Project folders={false}>` puts everything beside the .gui instead (a
decompiled .gui keeps its own layout this way). `iva build --zip` also writes
`dist/my-panel.gui.zip`: the same files in one archive, a zipped GUI iViewer
loads from a URL.

Every element and prop: [docs/components.md](docs/components.md).
Build errors point at the file and line, with "did you mean" for typos.

## A project

`iva create` gives a folder with `app.jsx` (the entry), `assets/` (images,
found by bare name as iViewer finds them), `scripts/` (iViewer JavaScript),
`IVA.md` (the element reference), `AGENTS.md` / `CLAUDE.md` (for AI
assistants), and `iva.d.ts` + `jsconfig.json`: open the folder in VS Code
and elements, props and their values autocomplete, with docs on hover and
mistakes underlined as you type (`fontSise` → "Did you mean 'fontSize'?").
Your own components' untyped props are optional; give them JSDoc types to
have them checked too. The types are generated from the compiler itself
(`iva types` rewrites them).

What iva writes is checked against GUI Designer: themes are laid out the
way Designer writes them (a button's background colour shows in Designer
only with its opacity triple, for one), `font="Helvetica Neue" bold` gets
the device's font name (`HelveticaNeue-Bold`, from Designer's font list),
systems take Designer's defaults per protocol, and `device="iPad Pro 11"`
uses Designer's device sizes.

## iva/ui and the gallery

`import { createUi } from 'iva/ui'`: cards, tiles, icon buttons, badges,
stats, toggles, sliders, steppers, segmented controls, scene bars, dimmers,
blinds, dials and a thermostat, a colour picker, radio buttons, checkboxes,
select boxes, text and search fields, time / date / number pickers, lists,
week days, alarms, a PIN pad, a header with breadcrumbs and a clock, a side
menu, dialogs, tables, trends and charts - in a theme, dark and light switched
on the panel at runtime (`<Project themes={['dark', 'light']}>`)
([docs/ui.md](docs/ui.md)). Every one of them, with its variations:

```bash
iva dev examples/gallery/app.jsx
```

Charts and 3D are web apps the panel serves itself: `<WebApp entry="./web/house.js">`
bundles your module (three.js, Chart.js, uPlot come with iva; `iva/web` talks
to the panel's joins) and the panel's own web server - one port for every
app - sends it to a web view ([docs/web.md](docs/web.md)); `<HttpServer>` is
a server of your own, on its own port.

## `iva serve`: on a real device

```bash
iva serve            # app.jsx; or: iva serve Project.gui
```

Serves the project the way GUI Designer's Upload Service does (port 8019,
`/` is the .gui, other files flat by name, Designer's headers), so iViewer
loads it like a project uploaded from Designer: in iViewer's settings, set
the GUI File URL to the address it prints (or scan its `cf://` QR code). The
device has to reach that address - the same network, or the same VPN /
ZeroTier network.

Saving rebuilds the project, and the panel on the device reloads itself: the
served .gui carries one extra script (`iva-live.js`, only while served by
iva) that waits for the next build and calls `CF.loadGUI`. A `.gui` is
re-read when it changes, so a project saved from GUI Designer reloads too.
`--no-live` serves it untouched. Every request is logged, unknown ones in
full (iViewer's cache-complete and debugger callbacks aren't documented).

## `iva decompile`

An existing project (from GUI Designer, or anywhere) into JSX:

```bash
node bin/iva.mjs decompile "path/to/Project.gui" my-panel
```

`my-panel/` gets `app.jsx`, `themes.jsx`, `systems.jsx`, `pages/*.jsx`,
`subpages/*.jsx`, and the project's images and sounds (`assets/`) and scripts
(`scripts/`). It is checked before it's handed over: decompile compiles it
back and compares with the original element by element, and fixes what comes
out different. All 48 CommandFusion demos come back as the same `.gui`
(`node --import tsx tools/roundtrip.ts fixtures/DemoUserInterfaces`).
Attributes iva doesn't model are kept in `xml={{ ... }}`, elements it doesn't
model (`<timer>`) as `<Raw xml={...} />`.

## `iva dev`

Previews a JSX project, or existing `.gui` files:

```bash
npm install
node bin/iva.mjs dev path/to/project.gui      # or a folder: every .gui in it, with a picker
node bin/iva.mjs dev fixtures/DemoUserInterfaces   # after `npm run fixtures`
node bin/iva.mjs dev http://192.168.0.10:8019/my.gui   # a .gui on a web server
node bin/iva.mjs dev path/to/my.gui.zip           # a zipped GUI (a .zip with a .gui in it)
```

Open http://127.0.0.1:5180/. Saving a file the project is built from (its .jsx
files and the components it imports, wherever they are, its scripts and
assets) rebuilds it and reloads the page; other files (logs, dist/) don't.
Options: `--port`, `--host 0.0.0.0` (preview from a tablet on the LAN),
`-v` (log sockets).

The toolbar over the panel: reload, landscape / portrait (greyed out when
the GUI has no such layout), outline (element bounds, names on hover), an
FPS box, zoom (−, the zoom: a tap goes between fit and 100 %, +; also
Ctrl+wheel, ⌘/Ctrl +, −, 0) and the hand (drag the view; H, or hold Space;
the middle button drags too), fullscreen. Outline and FPS stay on across
reloads. Ctrl+M hides it.

One Node process serves:

```
browser page                                   Node (iva dev)
──────────────────────────────                 ──────────────────────────────
src/runtime/cf      (parser, Pixi, CF.*, systems)
   │ net / dgram / tls / dns / http
src/runtime/stdlib
   │
src/runtime/host    ── invoke/listen ──────► /__iva/host (WebSocket)
 (sockets, TLS, DNS, HTTP;                      HostSession: node:net, dgram,
  bridge/: the WebSocket)                       tls, dns, http(s)
                                               /__iva/manifest, /__iva/files/…
                                               /__iva/loop/<port>/… (the panel's own servers)
                                               /__iva/remote/… (GUIs on web servers)
```

- **Runtime**: `src/runtime`, iva's own: the CF runtime (`cf/`: the .gui
  parser, Pixi rendering, the `CF.*` API, systems), sockets / UDP / HTTP /
  DNS / TLS (`stdlib/`, `host/`). It started as a copy of
  [agapi](https://github.com/shabunin/agapi)'s cf-runtime (see
  `src/runtime/README.md`); nothing outside iva is needed.
- **Backend**: `src/server/host/session.ts` serves the host commands the
  page's sockets send (`tcp_connect`, `udp_bind`, `tls_connect`,
  `dns_lookup`, …) on Node sockets, plus `http_fetch` (no CORS, self-signed
  certs OK), over one WebSocket (`src/runtime/host/bridge/`).
- One backend session per page: a reload closes every socket it opened.

- GUI links (`href="cf://…"`, `CF.loadGUI`) open the GUI they name: the
  project's own `.gui` (or `.zip`) of that name, else the URL
  ([docs/components.md](docs/components.md#gui-linking)). Zipped GUIs load
  from their archive, on disk or over HTTP; a folder's `.zip` files with a
  `.gui` in them are in the picker too.

Not in the backend yet: WebSocket servers, mDNS, device APIs.

## Layout

```
bin/iva.mjs            CLI entry (runs the TypeScript through tsx)
src/cli/               commands
src/compiler/          JSX -> .gui: runtime, components, build, themes, joins, images
src/decompiler/        .gui -> JSX, and the .gui comparison it checks itself with
src/create.ts, check.ts, types.ts, designer.ts   the other commands
templates/             iva create's templates (blank, demo) and the files every project gets
tools/roundtrip.ts     decompile + compile + compare every .gui under a folder
tools/gen-fonts.ts     src/compiler/fonts.json from GUI Designer's fontlist.xml
src/server/            dev server, project loader, host backend
src/runtime/           the CommandFusion runtime the preview runs (cf/, stdlib/, host/)
src/preview/           the preview page
test/                  node:test
examples/hello/        a small JSX project
docs/components.md     the elements, their props and what they become
docs/ui.md             iva/ui: the components
docs/web.md            web apps the panel serves (<WebApp>, <HttpServer>, iva/web)
lib/ui/                iva/ui: the components and their panel script
lib/web/               iva/web (a web app's side) and the built-in apps (trend, chart)
examples/gallery/      every iva/ui component (and examples/elements: shapes, icons)
fixtures/local/        small hand-written .gui projects
fixtures/DemoUserInterfaces/   CommandFusion's demos (npm run fixtures; not committed)
```

`npm test` · `npm run lint`
