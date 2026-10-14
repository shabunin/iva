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
node bin/iva.mjs dev examples/hello/app.jsx   # live preview, rebuilds on save
node bin/iva.mjs build examples/hello/app.jsx # -> examples/hello/dist/: .gui, images, scripts, joins.json
```

Every element and prop: [docs/components.md](docs/components.md).
Build errors point at the file and line, with "did you mean" for typos.

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
src/server/            dev server, project loader, host backend
src/preview/           the preview page (+ bridge/ for agapi's host classes)
test/                  node:test
examples/hello/        a small JSX project
docs/components.md     the elements, their props and what they become
fixtures/local/        small hand-written .gui projects
fixtures/DemoUserInterfaces/   CommandFusion's demos (npm run fixtures; not committed)
```

`npm test` · `npm run lint`
