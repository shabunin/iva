# iva — iViewer assistant

Write CommandFusion iViewer interfaces in JSX; iva compiles them into an
ordinary `.gui` (the format GUI Designer writes) and previews them live on
agapi's cf-runtime. The iViewer twin of [`ira`](../i3-web).

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
iva build      # -> dist/: the .gui, images, scripts, joins.json
iva designer   # build and open it in CommandFusion GUI Designer
```

(`iva` = `node bin/iva.mjs` from this folder, or `npm link` it.)

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
```

Open http://127.0.0.1:5180/. Saving any file in the project reloads the page.
Options: `--port`, `--host 0.0.0.0` (preview from a tablet on the LAN),
`--agapi <dir>`, `-v` (log sockets).

One Node process serves:

```
browser page                                   Node (iva dev)
──────────────────────────────                 ──────────────────────────────
@agapi/cf-runtime  (parser, Pixi, CF.*, systems)
   │ agapi.net / dgram / tls / dns / http
@agapi/stdlib
   │
agapi host-tauri classes  ── invoke/listen ──► /__iva/host (WebSocket)
 (@tauri-apps/* aliased to                      HostSession: node:net, dgram,
  src/preview/bridge/)                          tls, dns, http(s)
                                               /__iva/manifest, /__iva/files/…
```

- **Runtime**: agapi's `cf-runtime`, used from source (`../agapi`, or
  `--agapi` / `$IVA_AGAPI`). Nothing of agapi is copied or installed.
- **Backend**: `src/server/host/session.ts` implements agapi's host commands
  (`tcp_connect`, `udp_bind`, `tls_connect`, `dns_lookup`, …: the ones its
  Rust side serves) on Node sockets, plus `http_fetch` (no CORS, self-signed
  certs OK). agapi's own client classes run in the page unchanged: their
  `@tauri-apps/api/*` imports resolve to `src/preview/bridge/`, which sends
  them over the WebSocket. No Tauri anywhere.
- One backend session per page: a reload closes every socket it opened.

Not in the backend yet: hosting HTTP / WebSocket servers, mDNS, device APIs.

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
src/preview/           the preview page (+ bridge/ for agapi's host classes)
test/                  node:test
examples/hello/        a small JSX project
docs/components.md     the elements, their props and what they become
fixtures/local/        small hand-written .gui projects
fixtures/DemoUserInterfaces/   CommandFusion's demos (npm run fixtures; not committed)
```

`npm test` · `npm run lint`
