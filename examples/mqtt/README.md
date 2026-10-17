# iva mqtt: an MQTT broker on a panel

A page on `iva/drivers/mqtt`: a toggle, a slider and a text bound to topics,
a field that publishes, the connection's status and a log of the last
messages. The driver is a `<Mqtt>` element bringing its own `<System>` and
script ([docs/drivers.md](../../docs/drivers.md)).

## Run it

A broker on this machine, port 1883 (`-v` shows every packet; a mosquitto
service already running, `systemctl status mosquitto`, does as well):

```bash
mosquitto -v
```

The preview, on this machine (the page connects to `::1`, this machine by a
real connection - 127.0.0.1 would be a loopback system inside the panel):

```bash
node bin/iva.mjs dev examples/mqtt/app.jsx
```

Or to iViewer on a device (a port of its own if 8019 is serving something
else; the device sets its GUI File URL to the address printed):

```bash
node bin/iva.mjs serve examples/mqtt/app.jsx -p 8022
```

A plain `mosquitto` listens on this machine only: for a device, the broker
needs a listener on every address and to take anyone -
[mosquitto.conf](mosquitto.conf), two lines. On Ubuntu, AppArmor lets
mosquitto read a config under /etc/mosquitto only, so put it there (the
service includes conf.d):

```bash
sudo cp examples/mqtt/mosquitto.conf /etc/mosquitto/conf.d/iva.conf && sudo systemctl restart mosquitto
```

On the device, type this machine's address in the Host field and tap
Connect: the status says Connecting, then Connected.

## Try it

Watch everything the panel publishes:

```bash
mosquitto_sub -v -t 'home/#'
```

Tap the Lamp toggle: `home/lamp/set ON` (retained, QoS 1). Move the slider:
`home/dim/set 42`. Type in the field and tap Publish: `home/say hello`.

Set the panel from the other side:

```bash
mosquitto_pub -t home/lamp -m ON
```

```bash
mosquitto_pub -t home/dim -m 75
```

```bash
mosquitto_pub -t home/text -m 'Hello from the broker'
```

The toggle turns on, the slider goes to 75 %, the text shows; each message
appears in the log (`<` in, `>` out). What a subscription sets isn't
published back: `home/lamp ON` doesn't make a `home/lamp/set ON`.

Refused credentials, a broker gone: the status says so (`Refused (code 5)`,
`Disconnected`); the system connects again by itself (3 s), the driver
subscribes again.
