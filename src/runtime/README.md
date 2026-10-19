# src/runtime

The CommandFusion runtime iva's preview and the panel app run: the .gui parser, Pixi
rendering, the `CF.*` JavaScript API, systems (TCP / UDP / HTTP, feedback,
macros), and the sockets underneath. iva's own code; nothing outside iva is
needed.

```
cf/        the runtime: loadProject(), parser, renderer, components, CF.* (jsapi/), systems
stdlib/    sockets, UDP, HTTP, DNS, TLS as the runtime uses them (net, dgram, http, dns, tls)
host/      the page side of those: requests to the iva dev backend (src/server/host)
           over one WebSocket (bridge/); createIvaHost() puts them together
protocol.ts  the event payloads the backend sends back
```

## Where it comes from

A copy of [agapi](https://github.com/shabunin/agapi)'s `cf-runtime`,
`stdlib`, `host-protocol` and the socket / DNS / TLS / HTTP classes of
`host-tauri`, taken from branch `feat/cf-runtime-web-input` at
`9d0597c` (web views, input fields, list fixes; agapi PR #8). Changes since:

- imports are relative (no `@agapi/*` packages, no `@tauri-apps/*`: the host
  classes import `host/bridge/` directly);
- stdlib keeps what iViewer has (net, dgram, http, dns, tls); `installHost()`
  replaces `installStdlib()` and puts no `agapi` global in the page (panel
  scripts get the CF API only, as on a device);
- type errors fixed for iva's strict settings; an unused block in
  `renderer.createNode` removed.

The host commands (`tcp_connect`, `udp_bind`, ...) keep the names and
payloads of agapi's Tauri host, so the two stay comparable.
