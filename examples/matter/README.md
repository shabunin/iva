# iva matter

Matter devices from the panel: matter.js over a pool of ten UDP systems
(`<Matter>` from `iva/drivers/matter`, [docs/drivers.md](../../docs/drivers.md)).
Runs in official iViewer and in iva's own runtime (the preview, the iva
panel app).

```bash
iva serve examples/matter/app.jsx      # to a device: GUI File URL http://<this machine>:8019
iva dev examples/matter/app.jsx        # the preview in a browser
```

Pages:

- **Probe**: what this panel can do for a Matter controller - its
  JavaScript engine, Web Crypto, UDP systems carrying every byte value,
  persisted tokens, a 1.5 MB script. Runs at start and on "Run again"; the
  lines go to `iva serve`'s console too. Load it twice: the second load
  tells whether the persisted tokens were kept.
- **Devices**: what Bonjour finds - operational nodes and commissionable
  devices - with the slot (UDP system) the driver gave each. The phone must
  be on the Wi-Fi with no VPN for Bonjour (load the GUI first).
- **Commission**: the device's setup code (the 11 digits, or the QR code's
  `MT:` text), its address where Bonjour can't find it (optional:
  `192.168.2.40`, `192.168.2.40:5540`, `[fe80::1]:5540`), Go, the
  controller's status. A commissioned device gets the lowest free node id
  from 1, so `app.jsx`'s `devices` (node `1`) are bound as soon as the first
  one is commissioned; "Commissioned: node N" tells which id a later one got.
- **Control**: the devices of `app.jsx` - an on/off lamp on a Toggle, a
  dimmer on a Slider, a colour lamp on a colour picker (hue and saturation
  go to the driver's joins).

For the rest to work the Probe page must show, on the panel it runs on:
`crypto.subtle: Yes` with ECDH, ECDSA, AES-CTR, AES-CBC, SHA-256 and HKDF
`Yes`; the UDP lines `Bytes 0x00-0xFF`, `Bytes that read as UTF-8` (or the
`iso-8859-1` line), `1232 bytes`, `Four packets at once` and `Retarget a
system` all `Yes`; the three token sizes `written and read back`; and the
1.5 MB script `Yes`. IPv6 and the JSON-verbatim line may say No (the driver
doesn't rely on them).

## Without a device: a virtual light

```bash
node examples/matter/virtual-light.mjs          # --clear starts it over (the panel's tokens must go too)
```

A matter.js extended colour light on this machine (OnOff, LevelControl,
ColorControl on endpoint 1), commissionable with the placeholder code
`34970112332`. The Devices page finds it (Bonjour on this machine: `iva
dev` in a browser, or the phone on the same network), Go commissions it,
the Control page drives it - each change is printed. Its fabric is kept in
`examples/matter/.virtual-light`.
