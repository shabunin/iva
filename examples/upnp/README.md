# UPnP control point

A panel that finds the media servers and renderers on the network (SSDP),
browses a server's library and plays tracks on a renderer, with the
transport buttons, what plays and its art, a position slider and the
volume. The driver is `iva/drivers/upnp` ([docs/drivers.md](../../docs/drivers.md));
this folder is the panel around it: three cards on a tablet (1280x800), three
screens on a phone (`1400x1400@3x`).

## Run it

```bash
node bin/iva.mjs dev examples/upnp/app.jsx              # the live preview (real UDP and HTTP from the preview's backend)
node bin/iva.mjs serve examples/upnp/app.jsx --port 8022 # to iViewer on a device: GUI File URL http://<this machine>:8022
```

(8019, 8020 and 8021 may be taken by other sessions' servers; `--port`
picks another.)

On the device the panel searches the network as it starts and lists what
answers. Tap a server to browse its root, a folder to go in, a renderer to
pick it, a track to play it there - the next track is queued on the renderer
as well. Search again with the button at the bottom of the Now playing card.

## Without a real device

A fake MediaServer and MediaRenderer, on the LAN, found by SSDP like real
ones (the tracks are seconds of silence a real renderer can play):

```bash
node --import tsx test/upnp-fake.ts --port 8300
```

It answers M-SEARCH on 239.255.255.250:1900 and sends alive NOTIFYs every
minute; Ctrl-C sends its byebyes. The panel lists "iva fake server" and
"iva fake renderer".

## With a DLNA server

Any UPnP AV MediaServer works: MiniDLNA (`sudo apt install minidlna`, point
`media_dir` in `/etc/minidlna.conf` at some music, `sudo systemctl restart
minidlna`), Plex, Jellyfin's DLNA, a NAS. Renderers: gmediarender,
Kodi (UPnP renderer on in its services), many TVs and speakers.

Multicast not getting through (a Wi-Fi that blocks it, a VPN)? Give the
driver the description URLs: `<Upnp devices={['http://192.168.1.20:8200/rootDesc.xml']} />`
(MiniDLNA's is at `http://<host>:8200/rootDesc.xml`).

## Files

- `app.jsx`: the panel; `ui.js`: the theme (`createUi()`).
- `assets/`: `folder.png`, `musicTrack.png`, `videoItem.png` - the row icons
  (from the 2013 cf-upnp-cp project this is a modern take on).
