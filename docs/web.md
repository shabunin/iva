# Web apps: pages the panel serves itself

iViewer can't draw a chart, a 3D scene or anything a script computes. A web
view can — if something gives it a page. CommandFusion's own demos
(DynamicHTML, ColorPicker2) do it from the GUI: a TCP system that accepts
connections is an HTTP server, a script answers the requests, and a web view
loads `http://127.0.0.1:<port>/`. iva turns that into two elements:

- **`<WebApp entry="./web/house.js">`**: your page, written as a JavaScript /
  TypeScript module that imports what it needs (npm packages: `three`,
  `chart.js` and `uplot` come with iva; `iva/web` to talk to the panel). iva
  bundles it into one script that ships with the `.gui`, and the panel serves
  it in a page to a web view placed where the element is.
- **`<HttpServer name port handler>`**: a server of your own, on a port of its
  own (other clients than iva's pages talk to it), answering whatever you
  like (`IvaHttp.serve`).

`iva/ui` builds on `<WebApp>`: `Trend` (uPlot) and `Chart` (Chart.js).

```jsx
<WebApp entry="./web/house.js" x={20} y={100} w={520} h={300}
        joins={{ living: d('livingLight'), kitchen: d('kitchenLight') }}
        options={{ rooms }} />
```

```js
// web/house.js - runs in the web view
import * as THREE from 'three';
import { panel } from 'iva/web';

panel.on('living', (on) => (lamp.visible = !!on));      // the join, now and as it changes
canvas.onclick = () => panel.set('living', 1);           // set it
const rooms = panel.options.rooms;                       // the options, as JSON
```

## How it works

```
web view http://127.0.0.1:8900/house/
   ──GET /house/──────────────▶ the panel's web server (iva-http.js): the boot page
   ──GET iva/boot─────────────▶ the app's settings and script (the boot page runs it)
   ──GET iva/poll?v=N─────────▶ held until one of its joins changes, then the values
   ──GET iva/set?k=v──────────▶ CF.setJoin
   ──GET iva/call?fn=f────────▶ a panel function's answer
   ──GET iva/asset/x.glb──────▶ a project file (CF.loadAsset), as base64
```

- **One port for everything.** The panel has one web server (a TCP system,
  `IvaWeb`, on `<Project httpPort>` - default the first port free from 8900):
  every `<WebApp>` at `/<name>/`, the ColorPicker's swatches at
  `/iva-color/RRGGBB`, any `<Web url="panel:/path">`.
- **An answer can be another's.** iViewer sends what a server system sends
  to *every* client it has (CF.send: "the string will be sent to each
  connected system") and doesn't say which client asked. So every answer of
  the web server is the same page - the boot page - with the answer's data in
  it: a web view that gets another's answer as its page still gets the boot
  page, which knows from its own URL what to show (a swatch its colour, an app
  asks for its script). Every request of `iva/web` carries a number the
  answer repeats (`X-Iva-Req`); another's answer is noticed and the request
  goes again. Each answer closes its connection (`Connection: close`).
- **One request at a time per page.** `iva/web` queues them: a poll waiting
  for news gives way to a set or a call (a new request of an app ends its poll
  held). A poll that gets another app's answer simply asks again.
- **Files through `panel.asset(name)` / `panel.url(name)`**, not `<img src>`
  / CSS urls: a file the browser fetches itself can't check its answer.
- **Relative URLs.** `iva/web` asks `iva/poll`, not `/iva/poll`: an app is at
  `/<name>/` (the preview serves it under `/__iva/loop/<port>/<name>/`).
- **The panel side** (`iva-http.js`, added once) watches the app's joins
  (`CF.watch`), keeps their values, answers polls when they change (20 ms
  together), records them if asked (`record={{ every: 1, keep: 3600 }}`: a row
  per second, the last hour - `panel.history(from, to)`), and runs the
  `handlers` you name (`handlers={{ history: 'plantHistory' }}`: a function in
  your scripts, `fn(...args, reply)` - return the answer or reply later; it
  may run twice, if its answer reached another page first).
- **Runtime themes.** With `<Project themes>`, an app's `options` and `bg` are
  kept per look; a switch reloads each app's page in the new look's.

## `iva/web`

| | |
|---|---|
| `panel.options` | the WebApp's `options` (the look shown) |
| `panel.values`, `panel.names` | the joins' values now, by name |
| `panel.on(name, cb)` | `cb(value)` now and on each change; returns a stop function |
| `panel.onChange(cb)` | `cb(values)` on any change |
| `panel.set(name, value)` | set a join: digital 0 / 1, analog 0..65535, serial text |
| `panel.call(fn, ...args)` | a panel function's answer (Promise) |
| `panel.history(from, to)` / `panel.onSample(cb)` | with `record`: the rows (`[ms, value per name]`) and each new one |
| `panel.asset(name)` / `panel.url(name, type)` | a project file: an ArrayBuffer / a blob: URL |

Values are what the panel has: analog joins 0..65535 (scale them to what they
stand for), serial joins text.

## `IvaHttp` (panel side)

```jsx
<HttpServer name="api" port={8899} handler="api" />
```

```js
// scripts/api.js
function api(req, res) {          // req: method, path, query, headers
  if (req.path === '/rooms') return res.json(rooms);
  res.notFound();
}
```

`res.json(v)`, `res.html(text)`, `res.text(text, status)`,
`res.bytes(type, bytes)`, `res.asset(name)` (a project file) - now or later,
once. An `<HttpServer>` has its own port: answers are only sure to reach the
client that asked while it is the only one connected.

## Bundling

`entry` is bundled with esbuild: modules, npm packages (the project's
`node_modules`, then iva's: `three`, `chart.js`, `uplot`), CSS they import
(added as a `<style>`). Target: Safari 15 / Chrome 90 (iViewer shows web views
in the system WebView; three.js needs WebGL 2: iOS 15). The bundle is a
project file, `iva_app_<name>.js`, read with `CF.loadAsset` - a GUI loaded as
a `.zip` must include it (`iva build` writes it next to the `.gui`).

Editors: `iva types` writes `iva-web.d.ts` and `web/jsconfig.json` (the
browser's globals) when the project has a `web/` folder; the JSX side leaves
`web/` out (the DOM's `Text` and `Image` aren't iva's).

## In the preview

`iva dev` runs the panel's servers in its backend; a web view's
`http://127.0.0.1:<port>/` goes through `/__iva/loop/<port>/`, so the page
loads from wherever the preview is opened. The page is same-origin then:
`window.__ivaErrors` doesn't include its errors, but the browser console does.
