# Drivers: a component bringing its systems and script

A driver talks to devices from the panel itself: no server in between, the
protocol in the GUI's own JavaScript. In iva a driver is a component, placed
like any other, that brings what it needs - its `<System>`s, `<Token>`s,
its `<Script>` and the `<OnStart>` that starts it - and iva lifts them to
the project, each once (place the component on every page that uses it, or
once in `<Project>`). The same convention `iva/ui` uses for its runtime
(`iva-ui.js`), and the panel's web server (`iva-http.js`).

```jsx
import { Matter } from 'iva/drivers/matter';

<Matter slots={10} devices={{ lamp: { node: '1', cluster: 'OnOff', join: d('lamp') } }}
        commission={{ code: s('setupCode'), go: d('commission'), status: s('matterStatus') }}
        found={s('matterFound')} />

import { Mqtt } from 'iva/drivers/mqtt';

<Mqtt name="mqtt" host="192.168.1.10" port={1883} status={s('mqttStatus')}
      subscribe={{ 'home/lamp': d('lamp'), 'home/temp': { join: a('temp'), path: 'value', range: [0, 50] } }}
      publish={{ 'home/lamp/set': { join: d('lamp'), on: 'ON', off: 'OFF', retain: true } }} />
```

What the convention rests on, all of it iViewer's own API (so a driver runs
in official iViewer as well as in iva's runtime and the iva panel):

- **A system a peer.** `<System protocol="udp" host port localPort accept>`
  is a socket: what `CF.send(name, data)` sends goes to `host:port` from
  `localPort`; what comes in (from anyone, with `accept`) goes through its
  feedbacks. `CF.setSystemProperties(name, { address, port })` retargets it
  (the socket is bound again: wait for its `ConnectionStatusChangeEvent`
  before sending, up to 1.5 s - `offlineQueue` keeps what's sent meanwhile).
  A pool of systems (`matter0` ... `matter9`) is a pool of peers.
- **Bytes.** `CF.send`'s string is sent a char a byte; a feedback's match
  comes a char a byte. The systems take `textEncoding="iso-8859-1"` (GUI
  Designer's own option) so nothing is read as UTF-8 either way - iva's
  runtime does the same for it (`latin1`, `binary` too); with no encoding it
  reads bytes that happen to be UTF-8 as text.
- **A catch-all feedback.** `<Feedback name="frame" regex="(?s)(.+)" />` matches
  each packet whole (`(?s)`: newlines too); a script gets it with
  `CF.watch(CF.FeedbackMatchedEvent, system, 'frame', function (fb, data) {...})`.
  Packets arriving together come as separate frames (the probe checks).
- **DNS-SD.** `CF.startLookup(type, '', callback(added, removed, error))`
  finds services of a type (`_matter._tcp.`) with their addresses, port and
  TXT data; `CF.stopLookup(type, '')` ends it. No multicast socket needed.
- **Storage.** `<Token name persist />`: a global token kept between runs,
  `CF.setToken(CF.GlobalTokensJoin, '[name]', value)` /
  `CF.getJoin(CF.GlobalTokensJoin, function (j, v, tokens) {...})`. A value
  goes through iViewer's token and math substitution (`[x]`, `{{1+1}}`): keep
  binary or JSON as base64. 64 KB a token is fine (the probe checks).
- **The script.** `<Script name="iva-matter.js" entry="./runtime/main.ts" />`:
  a module bundled by iva with the npm packages it imports (the project's
  node_modules, else iva's) into one panel script, minified - matter.js and
  its adapter are 2.2 MB, and iViewer loads that (the probe checks 1.5 MB).
  The panel's JavaScript engine is a system WebView: modern JavaScript, Web
  Crypto (`crypto.subtle`), TextEncoder, BigInt.
- **The start.** `<OnStart js="IvaMatter.start({...})" joins={[...]} />`
  with the joins as `Joins.*` references (`jsJoin` in `lib/ui`), listed in
  `joins` so they exist for scripts even where no element has them.
- **A stream too.** A TCP `<System>` with no `eom` ([IVA.md](components.md#systems-and-logic))
  hands the bytes over as they come, in reads that split or merge the
  protocol's frames: the script puts them back together (the MQTT driver's
  `parse`). `alwaysOn` connects again by itself 3 s after a drop; the driver
  logs in again on `CF.watch(CF.ConnectionStatusChangeEvent, system, cb)` -
  one watch a system (iViewer takes no list of names there).
- **No echo.** iViewer fires a join's change event for a script's own
  `CF.setJoin` too: a driver remembers what it last wrote to each join and
  swallows that one event, so what a device reported isn't sent back to it.
- **Where it lives.** `lib/drivers/<name>/index.tsx` is `iva/drivers/<name>`
  (the compiler resolves any folder there; `iva types` declares each in a
  project's `iva.d.ts`); the panel script beside it (`runtime.ts` as a
  template literal, or a bundled `runtime/main.ts`).

## The probe (examples/matter, Probe page)

What `examples/matter` checks first on the panel it runs on, each a line on
the page and in `iva serve`'s console (`iva serve examples/matter/app.jsx`):

| Check | iva runtime (preview, 2026-10-17) | iva panel app, Android (Titan 2, 2026-10-17) | iViewer 5.0.7 Android |
|---|---|---|---|
| `crypto.subtle`, secure context | Yes | Yes | pending |
| SHA-256, ECDH P-256 (one agreement), ECDSA, AES-CTR, AES-CBC, HKDF, HMAC | Yes; ECDH 5 ms | Yes; ECDH 1 ms | pending |
| PBKDF2 (a PASE: up to 100000 rounds) | 1000 rounds 41 ms | 1000 rounds 5 ms | pending |
| UDP: bytes 0x00-0xFF through an echo peer, in order | Yes | Yes | pending |
| UDP: bytes that read as UTF-8 (no encoding) | No: read as text (fixed since: `iso-8859-1`) | Yes | pending |
| UDP: 1232 bytes in one packet | Yes | Yes | pending |
| UDP: four packets at once, four frames | Yes | Yes | pending |
| UDP: `textEncoding="iso-8859-1"`, a byte a char | Yes (since 2026-10-17) | Yes | pending |
| UDP: a system to `::1` (IPv6) | No (IPv4 socket) | Yes | pending |
| UDP: retarget (address, port) with `CF.setSystemProperties` | Yes | Yes, once the connection event is waited for (300 ms was too soon) | pending |
| UDP: rebind (localPort) | Yes | Yes | pending |
| Tokens: 4, 16, 64 KB written, read back, kept to the next run | Yes | Yes (kept: pending a second load) | pending |
| Tokens: a JSON value verbatim | No: `{{ }}` and `[@..]` substituted (so: base64) | No (the same) | pending |
| A 1.5 MB script | Yes | Yes | pending |

The driver needs the Web Crypto lines, the first four UDP lines, retarget
and the tokens. IPv6 is off in the driver unless `<Matter ipv6>`; the
panel's JSON value line is why the storage is base64.

## Matter: `<Matter>` (iva/drivers/matter)

[matter.js](https://github.com/project-chip/matter.js) (0.17, pinned) as a
controller on the panel: it commissions devices into a fabric of its own
and controls them over Matter's UDP protocol. matter.js's platform seams
are filled from CF (`lib/drivers/matter/runtime`):

- `Network`: one virtual UDP socket (two, as matter.js opens one for IPv6
  and one for IPv4) over the pool of systems - a peer a slot, assigned on
  the first packet to it (free, else the longest unused), its frames the
  peer's. No multicast.
- DNS-SD: what `CF.startLookup` finds (`_matter._tcp.` operational nodes,
  `_matterc._udp.` commissionable devices) becomes the DNS records a
  responder sends (PTR with the subtypes, SRV, TXT, A; AAAA with `ipv6`),
  fed to matter.js's own name cache, so its scanners work unchanged; a query
  matter.js sends starts the lookup of that type. A device given an
  `address` is announced as found.
- Storage: matter.js's whole store (certificate authority, fabric, nodes) as
  one JSON, base64, in chunks over persisted tokens (`store`: prefix,
  chunks, size - default 8 x 32 KB), written a second after a change.
- Crypto and time: matter.js's own `StandardCrypto` (Web Crypto plus its
  AES-CCM) and `StandardTime`, with `Symbol.dispose` polyfilled.
- Its log goes to `CF.log` (`log`: the level).

Props:

| Prop | |
|---|---|
| `slots` | UDP systems in the pool, a peer each (default 10: `matter0` ... `matter9`) |
| `port` | the first slot's local port, the next ones following (default 5550) |
| `devices` | by name: `{ node, cluster, join }` - `node` the id the controller gave the device when commissioning (the status join shows it), `endpoint` (default 1), `cluster` `OnOff` (`join` digital, both ways), `LevelControl` (`join` analog: 0..65535 for 0..254, `moveToLevelWithOnOff`) or `ColorControl` (`hue` and `saturation` analog, 0..65535 for 0..254, `moveToHueAndSaturation`); `address` + `port` where Bonjour can't find the node |
| `commission` | `{ code, go, status }`: the setup code (serial: 11 digits, 21, or the QR code's `MT:` text), Go (digital, a momentary button), what the controller says (serial) - "Commissioned: node N" tells the id for `devices` |
| `found` | serial join: the devices Bonjour finds, JSON rows `{ name, kind, where, info, slot }` for a `ui.DataTable source` (`kind`: operational, node of ours, commissionable) |
| `label` | the controller's name in the devices' fabrics (default `iva`) |
| `ipv6` | IPv6 addresses too (default false) |
| `log` | matter.js's log level in CF.log: debug, info (default), notice, warn, error |
| `store` | `{ prefix, chunks, size }` of the persisted tokens (default `matter_store_`, 8, 32768) |
| `textEncoding` | the systems' (default `iso-8859-1`; `''` for none) |

What it emits: the systems (`host="127.0.0.2" port={5540}` till assigned,
`localPort` the slot's, `accept`, `offlineQueue`, the `frame` feedback), the
tokens, `iva-matter.js` (once), and one `OnStart` line
`IvaMatter.start({...})` with the devices' joins as `Joins.*` references.
On the panel: `IvaMatter.driver` (the `MatterDriver`), `IvaMatter.commission(code)`.

Commissioning is on-network only (the device already on the Wi-Fi, in pairing
mode; no BLE, no Thread credentials). A subscription sets a device's joins;
a join's change (not the driver's own echo) sends the command.

Tests without a device: `test/matter.test.ts` (the pool, the Network, the
DNS-SD source through matter.js's own scanner, the storage, the compile
output). The example: `examples/matter` (`iva serve examples/matter/app.jsx`).

## MQTT: `<Mqtt>` (iva/drivers/mqtt)

An MQTT 3.1.1 client written by hand (no npm package on the panel): CONNECT
with client id, user, password, keepalive and clean session; CONNACK and its
return code; PUBLISH at QoS 0 and 1 (PUBACK, packet ids); SUBSCRIBE /
SUBACK, UNSUBSCRIBE; PINGREQ / PINGRESP on the keepalive; DISCONNECT; topic
filters with `+` and `#`; packets split or merged across TCP reads put back
together.

| Prop | What it is |
|---|---|
| `name` | the broker's system: this `<Mqtt>` brings the `<System>` of that name (host, port, credentials here) |
| `system` | topics on a broker another `<Mqtt name>` brings - several elements, one connection (no host, port or credentials here) |
| `host`, `port` | the broker (port: 1883, 8883 with `ssl`) |
| `ssl` | MQTT over TLS, where the runtime has it (iva's: any certificate, as a system's Enable SSL) |
| `clientId`, `user`, `password`, `keepalive`, `cleanSession` | the CONNECT: `iva`, none, none, 60 s (0: no pings), true |
| `status` | serial join: `Connecting`, `Connected`, `Disconnected`, `Refused (code N)` |
| `log`, `logLines` | serial join with the last messages, a line each: `< topic: payload` in, `> topic: payload` out (8 lines) |
| `subscribe` | `{ 'home/lamp': d('lamp'), 'home/temp': { join: a('temp'), path: 'value', range: [0, 50], qos: 1 } }`: a topic filter (`+` a level, `#` the rest) into a join |
| `publish` | `{ 'home/lamp/set': { join: d('lamp'), on: 'ON', off: 'OFF', retain: true, qos: 1 }, 'home/dim/set': { join: a('dim'), range: [0, 100], decimals: 1, template: '{"level": {value}}' } }`: a join's changes to a topic |

A join is `d('lamp')`, `a(12)`, `s('text')` (or `'d:lamp'`, `'a12'`): its
type says how the payload is read and written.

**Payload to join** (a message on a subscribed topic): digital from `1` /
`0`, `true` / `false`, `on` / `off` in any case (another number: on unless
0); analog a number mapped from `range` (default 0..65535) onto 0..65535,
clamped (`21.5 C` reads as 21.5); serial the text (an object: its JSON).
`path` reads a field of a JSON payload, dotted (`value`, `state.on`,
`readings.0.t`); a payload without it leaves the join alone, as does one the
join can't take (`maybe` for a digital).

**Join to payload** (the join changed on the panel): digital `on` / `off`
(default `1` / `0`); analog back through `range`, a whole number unless
`decimals`; serial as it is; then `template` with `{value}` in it. What a
subscription just set isn't published back, so one join can take `home/lamp`
in and give `home/lamp/set` out. QoS 1 publishes wait for their PUBACK and
go again (DUP) on the next connect if none came, while the connection is
down too; QoS 0 ones while down are dropped (the log says).

**The connection:** CONNECT when the system connects; SUBSCRIBE to every
filter on CONNACK, so a reconnect subscribes again; PINGREQ every
`keepalive` seconds, and when a PINGRESP hasn't come by the next, the system
is started over (`CF.setSystemProperties` enabled off, then on) and connects
afresh. A refused CONNACK shows its code in the status (4: bad user name or
password, 5: not authorised, 2: identifier rejected); the broker closes the
connection and the system tries again in 3 s.

**From a script** (iva-mqtt.js, `IvaMqtt`):

```js
IvaMqtt.publish('mqtt', 'home/say', 'hello', { qos: 1, retain: true });
IvaMqtt.subscribe('mqtt', 'sensors/#', function (topic, payload) { CF.log(topic + ': ' + payload); });
IvaMqtt.reconnect('mqtt', host, port);   // another broker (the example's Host / Port fields)
IvaMqtt.encode.publish('t', IvaMqtt.utf8('hi'));   // the codec: encode, decode, parse, matches, utf8, text
```

Not in it: QoS 2, will messages, MQTT 5, WebSocket transport.
