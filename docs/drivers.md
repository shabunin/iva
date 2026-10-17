# iva drivers

Devices on the network as components: `import { Mqtt } from
'iva/drivers/mqtt'`. A driver is a JSX element that brings everything the
panel needs to talk to the device - its `<System>` (the socket iViewer
opens), a `<Feedback>` handing the bytes to a script, and the script itself,
shipped once and wired up with `<OnStart>` - so a page says what it wants in
joins and the rest happens on the panel, on CommandFusion iViewer and on
iva's own runtime alike.

```jsx
import { Mqtt } from 'iva/drivers/mqtt';

<Mqtt name="mqtt" host="192.168.1.10" port={1883} status={s('mqttStatus')}
      subscribe={{ 'home/lamp': d('lamp'), 'home/temp': { join: a('temp'), path: 'value', range: [0, 50] } }}
      publish={{ 'home/lamp/set': { join: d('lamp'), on: 'ON', off: 'OFF', retain: true } }} />
```

The whole of it in use: [examples/mqtt](../examples/mqtt) (`iva dev
examples/mqtt/app.jsx`, with a broker on this machine).

## The convention

What a driver is made of, so another can follow (`lib/drivers/<name>/`):

- **A component** in `lib/drivers/<name>/index.tsx`, resolved as
  `iva/drivers/<name>`; its panel script in `runtime.ts` as a template
  literal, shipped as one `<Script name="iva-<name>.js">` (the compiler
  keeps the same script once, however many elements bring it). Projects get
  its types in `iva.d.ts` (`iva types`).
- **The transport is a `<System>`** the component emits (lifted to the
  project, the same system once; [IVA.md](components.md#systems-and-logic)):
  TCP with no `eom`, so the script gets the bytes as they come, and a
  catch-all `<Feedback name="frame" regex="(?s)(.*)" />` matching each read
  whole. `CF.watch(CF.FeedbackMatchedEvent, system, 'frame', cb)` delivers
  it as a string a char a byte; `CF.send(system, bytes)` sends such a string
  back (`CF.BINARY`, the default). The connection comes and goes on
  `CF.watch(CF.ConnectionStatusChangeEvent, system, cb)` - one watch a
  system (iViewer takes no list of names there); the driver logs in when it
  comes and the system (`alwaysOn`) connects again by itself 3 s after it
  goes.
- **Text encoding:** a system with none hands iViewer's scripts the raw
  bytes (GUI Designer's words), but iva's runtime reads UTF-8 where it sees
  it - which a binary frame with UTF-8 text inside would be. `textEncoding=
  "ISO-8859-1"` is a byte a char on both, in and out: a driver sets it.
- **Joins** are named in JSX (`d('lamp')`) and numbered by the compiler; the
  script gets them as `Joins.d["lamp"]` in the `<OnStart>` line, listed in
  its `joins` so they get numbers even when no element carries them. What
  the driver writes to a join it remembers, so the join's change event (which
  iViewer fires for a script's own `CF.setJoin` too) isn't sent back to the
  device.
- **Tests:** the codec and the script against a stand-in `CF` recording
  `send` / `watch` / `setJoin` (test/mqtt.test.ts), the script on iva's
  runtime against the real thing where it can run on this machine
  (test/mqtt-broker.test.ts, mosquitto), and the compile output (one system,
  the feedback, the script once, the `OnStart` line).

## MQTT: `iva/drivers/mqtt`

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
