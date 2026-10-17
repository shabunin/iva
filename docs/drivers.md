# Drivers: a component bringing its systems and script

A driver talks to devices from the panel itself: no server in between, the
protocol in the GUI's own JavaScript. In iva a driver is a component, placed
like any other, that brings what it needs - its `<System>`s, `<Token>`s,
its `<Script>` and the `<OnStart>` that starts it - and iva lifts them to
the project, each once (place the component on every page that uses it, or
once in `<Project>`). The same convention `iva/ui` uses for its runtime
(`iva-ui.js`), and the panel's web server (`iva-http.js`). The drivers:
[Matter](#matter-matter-ivadriversmatter) (`iva/drivers/matter`),
[MQTT](#mqtt-mqtt-ivadriversmqtt) (`iva/drivers/mqtt`) and
[UPnP](#upnp-upnp-ivadriversupnp) (`iva/drivers/upnp`); each resolves as
`iva/drivers/<name>` (lib/drivers/<name>/index.tsx), and the build names
them when a module isn't found.

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
  feedbacks. To retarget it: `CF.setSystemProperties(name, { enabled: false })`,
  then `{ address, port, localPort }`, then `{ enabled: true }` - iViewer
  keeps the old address when only `address` and `port` change - and wait for
  its `ConnectionStatusChangeEvent` before sending (up to 1.5 s;
  `offlineQueue` keeps what's sent meanwhile). A pool of systems (`matter0`
  ... `matter9`) is a pool of peers.
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
the page and in `iva serve`'s console (`iva serve examples/matter/app.jsx`).
Run on 2026-10-17/18 on the user's Unihertz Titan 2 (Android 16): official
iViewer 5.0.7 and the iva panel app (its APK of 2026-10-17 19:21, so with
the runtime before this driver's codec fix), and iva's preview in a browser.

| Check | iViewer 5.0.7 Android | iva panel app, Android | iva runtime (preview) |
|---|---|---|---|
| `crypto.subtle`, secure context (the page: `file://`, `http://tauri.localhost`) | Yes | Yes | Yes |
| SHA-256, ECDH P-256 (one agreement), ECDSA, AES-CTR, AES-CBC, HKDF, HMAC | Yes; ECDH 1 ms | Yes; ECDH 1-2 ms | Yes; ECDH 5 ms |
| PBKDF2, 1000 rounds (a PASE: up to 100000) | 5 ms (about 0.4 s) | 21-23 ms (about 2.2 s) | 41 ms (about 4 s) |
| UDP: bytes 0x00-0xFF through an echo peer, in order | Yes | Yes | Yes |
| UDP: bytes that read as UTF-8, no encoding set | Yes | No: read as text (the fix is in the runtime since, the APK not yet) | No: read as text |
| UDP: 1232 bytes in one packet | Yes | Yes | Yes |
| UDP: four packets at once, four frames | Yes | Yes | Yes |
| UDP: `textEncoding="iso-8859-1"`, a byte a char | Yes | No: windows-1252 (fixed in the runtime since) | Yes (since the fix) |
| UDP: a system to `::1` (IPv6) | Yes | No (a v6 socket for a v6 address in the runtime since; the APK not yet) | Yes (since 2026-10-18) |
| UDP: retarget with `CF.setSystemProperties({ address, port })` alone | No: keeps sending to the old address | Yes (after its connection event; 300 ms was too soon) | Yes |
| UDP: rebind (`localPort` too) | Yes | Yes | Yes |
| Tokens: 4, 16, 64 KB written and read back | Yes | Yes | Yes |
| Tokens: kept to the next load | Not seen in two loads a minute apart (open: were they app restarts?) | pending (the card was hidden) | Yes |
| Tokens: a JSON value verbatim | No: `{{1+1}}` and `[@s1]` substituted | No (the same) | No (the same) |
| A 1.5 MB script | Yes | Yes | Yes |
| Bonjour (`_matter._tcp.`) | not exercised (VPN on) | not exercised | works (the gallery's page) |

What the driver does with it: the pool retargets a slot as iViewer takes
it - the system off, `address`, `port` and its own `localPort` set, on
again - and holds what's sent until the system's connection event (1.5 s at
most). IPv6 stays off unless `<Matter ipv6>`. The storage is base64 (the
JSON line). One more thing both runtimes do: a text join's value with
`[name]` in it shows the token's value in its place - the probe's first
"Token names seen" line showed 64 KB of token (a black texture on the
panel, seven garbled lines on iViewer); names in text go without brackets.

The panel app needs a new APK (CI, on push) for the two encoding lines and
IPv6; on the current one the driver's bytes would be read as text. The
runtime's text fitting (a value too long for a texture, cut to its box) and
bracket-less token names came the same day. On official
iViewer the driver's needs are all met, if persisted tokens turn out to be
kept across app restarts (the probe's "At start" line tells).

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
IvaMqtt.reconnect('mqtt', host, port);   // another broker (the example's Host / Port fields): off, the address, on
IvaMqtt.encode.publish('t', IvaMqtt.utf8('hi'));   // the codec: encode, decode, parse, matches, utf8, text
```

Not in it: QoS 2, will messages, MQTT 5, WebSocket transport.

## UPnP: `<Upnp>` (iva/drivers/upnp)

A UPnP AV control point: the media servers (DLNA: MiniDLNA, Plex, a NAS)
and renderers (gmediarender, Kodi, TVs, speakers) on the network, a server's
library browsed into a list, a track played on the renderer picked, its
transport driven and its state shown. A modern take on
[cf-upnp-cp](https://github.com/shabunin/cf-upnp-cp) (2013, iViewer 4).
The whole panel: [examples/upnp](../examples/upnp).

```jsx
import { Upnp } from 'iva/drivers/upnp';

<Upnp devices={['http://192.168.1.20:8200/rootDesc.xml']}
      servers={{ list: l('servers'), selected: s('server'), row: 'upnp_row_device' }}
      renderers={{ list: l('renderers'), selected: s('renderer'), row: 'upnp_row_device' }}
      browse={{ list: l('browse'), path: s('path'), up: d('up'), refresh: d('refresh'),
                rows: { container: 'upnp_row_folder', item: 'upnp_row_track' },
                icons: { container: 'folder.png', audio: 'musicTrack.png', video: 'videoItem.png' } }}
      transport={{ play: d('play'), pause: d('pause'), stop: d('stop'), next: d('next'), previous: d('previous'),
                   state: s('state'), title: s('title'), artist: s('artist'), album: s('album'), art: s('art'),
                   position: a('position'), elapsed: s('elapsed'), duration: s('duration') }}
      volume={{ level: a('volume'), mute: d('mute') }}
      status={s('upnpStatus')} search={d('search')} />
```

What it brings: `<System name="upnp_ssdp" protocol="udp" host="239.255.255.250"
port={1900} localPort={4023} acceptBroadcasts>` with `<Feedback name="ssdp"
regex="(.*)">`, a second system `upnp_notify` the same but on local port
1900, `iva-upnp.js` and the start line. `name` (default `upnp`) names the
systems.

### Discovery

At the start (and again a second later: UDP), on the `search` join and
every `searchEvery` seconds (default 300, 0: never by itself) the script
sends an SSDP `M-SEARCH` for `urn:schemas-upnp-org:device:MediaServer:1`
and `MediaRenderer:1` (`searchAll`: `ssdp:all`, filtered here). Replies and
`NOTIFY`s (`ssdp:alive` / `ssdp:byebye`) are parsed as HTTP heads
(`LOCATION`, `ST` / `NT`, `USN`, `CACHE-CONTROL: max-age`), a device table
keeps each device by its UDN till its max-age is up or its byebye comes (a
sweep every 10 s), and each new device's `LOCATION` is fetched with
`CF.request` for its description: `friendlyName`, `manufacturer`,
`modelName`, `UDN`, the icons (the biggest PNG / JPEG), the services
(`serviceType`, `controlURL`, `eventSubURL`, `SCPDURL`, resolved against
`URLBase` or the location), embedded devices' services included. A device
with a ContentDirectory service is a server, one with AVTransport a
renderer (a TV can be both). `devices` are description URLs fetched
outright, for networks where multicast doesn't get through (a VPN, a Wi-Fi
that filters it); they're kept as long as they answer.

The two UDP systems, and what is known about them: iva's runtime binds a
UDP system to `localPort` (0: the remote's port; -1: any), joins the
multicast group when the host is a multicast address, and sets the broadcast
flag with `acceptBroadcasts`; what comes in goes to the feedback (a `(.*)`
regex is taken as "the whole packet"). So `upnp_ssdp` on its own port 4023
sends the M-SEARCH and gets the unicast replies back on that port, and
`upnp_notify`, bound to 1900 and in the group, hears the NOTIFYs devices
multicast - alive (a device that came up, listed at once) and byebye (gone
at once). Official iViewer: the 2013 project had exactly the first system
(`origin="4023" accept="1" acceptBroadcasts="1"`, the feedback `(.*?)`) and
got M-SEARCH replies on iViewer 4 on iPad and Android, with the whole packet
delivered to the script; whether it joins the multicast group for a system
bound to 1900 isn't known - the second system costs nothing if it doesn't,
and discovery doesn't depend on it (devices are searched for again every
`searchEvery` seconds and dropped when their max-age runs out).
`ssdp={{ localPort: 4023, notify: false }}` leaves the second system out;
`ssdp={{ host, port }}` points at something else (a test's fake device).

### Lists and rows

The lists are yours (`<List join={l('servers')} item="upnp_row_device">`);
the driver fills them with `CF.listRemove` / `CF.listAdd`, each row an
object `{ subpage, s1, s2, s3, d1 }` - the `row` subpage named in JSX (or
the list's own item subpage when none): `s1` the name / title, `s2` the
model (devices), "artist - album" or the duration (tracks), the count
(folders), `s3` the icon URL (devices), the album art or the `icons` file
for its kind (`container`, `audio`, `video`, `image`, `other` - image files
in `assets/`, or URLs), `d1` 1 on the device selected / the track playing.
Taps come from the row's button:

```jsx
<Subpage name="upnp_row_track" define w={400} h={60}>
  <Button w={400} h={54} join={1} feedback="none" bg="#2B3137" active={{ bg: '#00BC97' }}
          onPress={[js('IvaUpnp.rowDown(list)')]} onRelease={[js('IvaUpnp.tap(list, listIndex)')]} />
  <Image x={8} y={7} w={40} h={40} join={3} clickthrough />
  <Text x={60} y={5} w={328} h={26} join={1} />
  <Text x={60} y={29} w={328} h={22} join={2} color="#8A949C" fontSize={13} />
</Subpage>
```

(pressed and let go with no scroll between: a tap). A server tapped is
selected (`servers.selected` gets its name) and its root browsed; a folder
tapped is browsed into (`browse.path`: "Server / Music / Albums"; `up`
goes a level up, `refresh` browses the folder again); a track tapped plays
on the renderer selected. A renderer tapped is selected and polled.

### ContentDirectory, AVTransport, RenderingControl, ConnectionManager

Actions are SOAP: a `POST` to the service's `controlURL` with
`SOAPACTION: "urn:schemas-upnp-org:service:AVTransport:1#Play"`, the
envelope built by hand, the response's arguments read back; a `UPnPError`
(`errorCode`, `errorDescription`, as `s:Fault` with HTTP 500) goes to the
`status` join ("Browse failed: 701 No such object"), as does an HTTP
failure.

- `Browse` (`BrowseDirectChildren`, `Filter *`, `RequestedCount`
  `browse.pageSize` (100) and `StartingIndex` on till `TotalMatches` are in,
  the rows added as each page comes); `IvaUpnp.find('dc:title contains
  "blue"')` is a `Search` on the server selected (where it has one).
  `BrowseMetadata` is there as `IvaUpnp.action(device, IvaUpnp.SVC.cd,
  'Browse', { ObjectID, BrowseFlag: 'BrowseMetadata', ... }, cb)`.
- A track: `SetAVTransportURI` with the item's `res` URL and its DIDL-Lite
  metadata (written again from what Browse gave: title, class, artist,
  album, albumArtURI, res with protocolInfo and duration), then `Play`
  (Speed 1), then `SetNextAVTransportURI` with the next playable item of the
  listing (gapless on renderers that do it). When the renderer goes on to
  that one by itself (its `TrackURI` seen in the poll), the one after is
  queued.
- The `transport` joins: `play` / `pause` / `stop` / `next` / `previous`
  (a button's digital join: the action on its rising edge - `IvaUpnp.play()`
  ... from a script); `position` (0..65535 over the track; dragged, a `Seek`
  `REL_TIME` once it rests 300 ms); `state`, `title`, `artist`, `album`,
  `art` (a URL: `<Image join={s('art')}>`), `elapsed` / `duration` (m:ss).
- `volume.level` (0..65535 for 0..100: `SetVolume` once it rests 150 ms),
  `volume.mute` (a toggle: `SetMute`).
- `GetProtocolInfo` is asked of a renderer selected (its sink protocols:
  `IvaUpnp.state.protocolInfo`).

### State

Polled while a renderer is selected, every `pollEvery` ms (1000):
`GetTransportInfo` (the state: Playing, Paused, Stopped, Loading, No media;
Unreachable when the renderer doesn't answer) and `GetPositionInfo`
(elapsed, duration, the position slider, what plays from its
`TrackMetaData`), `GetVolume` and `GetMute` every other poll. The joins
are set without a change event, so a poll never seeks or sets the volume
back; while a finger has the slider, the poll leaves it alone for a moment.

GENA eventing (a `SUBSCRIBE` to the service's `eventSubURL`, with the
renderer sending `NOTIFY`s to a callback URL) would spare the polling; it
needs an HTTP server on the panel (`<HttpServer>` has one). The hook is
`IvaUpnp.eventing`: set it to `{ subscribe: function (device, service, cb)
{...} }` and the poll could go; it isn't implemented yet.

### XML

No DOM is assumed: the script parses XML by hand (elements, attributes,
text, entities, CDATA, comments; names by their local part, so
`dc:title` is `title` and namespaces don't matter) when there is no
`DOMParser`, and with `DOMParser` where the panel has one (iViewer's WebView,
iva's panel), the same tree either way (`IvaUpnp.xml.parse`). DIDL-Lite
items come out as `{ id, parentId, kind, title, class, artist, album,
albumArtURI, url, protocolInfo, duration, size, childCount }`
(`IvaUpnp.didl.parse`, `.metadata(item)`); SOAP as `{ action, values }` or
`{ error: { code, description } }` (`IvaUpnp.soap.parse`, `.build`).

### Trying it

[examples/upnp](../examples/upnp): `iva dev examples/upnp/app.jsx`, or
`iva serve examples/upnp/app.jsx --port 8022` to a device. Without a
device: `node --import tsx test/upnp-fake.ts` is a fake MediaServer and
MediaRenderer on the LAN (SSDP and all), with a library of silent tracks.
