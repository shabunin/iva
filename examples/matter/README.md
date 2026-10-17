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
  `MT:` text), Go, the controller's status. "Commissioned: node N" gives the
  node id to put in `app.jsx`'s `devices`.
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
