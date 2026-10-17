# iva drivers

Network devices as components: `import { Upnp } from 'iva/drivers/upnp'`
and the panel talks UPnP. A driver is a JSX component that brings what it
needs with it - a `<System>` (the socket: TCP or UDP, the device's address
and port) with one catch-all `<Feedback>` (every packet goes to the script,
through `CF.FeedbackMatchedEvent`), its panel script (a `<Script>`, shipped
once however many times the component is used) and an `<OnStart>` line
wiring the script to the joins given in JSX (`IvaUpnp.start({ servers:
{ list: Joins.l["servers"] } })`). The script sends with `CF.send` (a string
whose characters are bytes when the system has no text encoding) and asks
HTTP with `CF.request`; lists are filled the CF way (`CF.listRemove`,
`CF.listAdd` with each row's `s` / `d` joins, `CF.listUpdate` to mark one).
What a driver makes runs on official iViewer and in iva's own runtime
alike; the drivers are tested against fake devices in Node, through a fake
CF object and through iva's runtime on real sockets.

Each driver resolves as `iva/drivers/<name>` (lib/drivers/<name>/index.tsx);
the build names them when a module isn't found.

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
