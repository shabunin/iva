import { createUi } from 'iva/ui';
import { Mqtt } from 'iva/drivers/mqtt';

// the components in this project's theme; the panel's size: the one being built (1280x800, or the phone's)
const ui = createUi();
const t = ui.theme;
const font = { font: t.font };

// the broker: this machine, for the preview - by a real connection (127.0.0.1 would be a loopback system, inside
// the panel); on a device, type the machine's address in the Host field and tap Connect
const BROKER = '::1';

const L = ui.grid({
  broker: [400, 350],
  controls: [832, 350],
  messages: { w: 1248, h: 220, grow: true },
}, [['broker', 'controls'], ['messages']]);

const label = (x, y, w, text) => <Text x={x} y={y} w={w} h={24} text={text} color={t.muted} {...font} fontSize={15} />;

export default (
  <Project name="iva mqtt" width={1280} height={800} sizes={['1400x1400@3x']}>
    <Page name="Main" bg={t.page}>
      <ui.Header title="MQTT" menu={false} />
      <ui.ScrollArea>
        <ui.Card title="Broker" {...L.broker}>
          <ui.TextField x={28} y={56} w={L.broker.w - 56} label="Host" join="host" value={BROKER} icon="server" />
          <ui.TextField x={28} y={148} w={L.broker.w - 56} label="Port" join="port" value="1883" icon="plug" />
          <ui.IconButton x={28} y={240} w={140} h={44} icon="right-to-bracket" text="Connect" tone="accent" js="MqttExample.connect()" />
          {label(28, 298, 60, 'Status')}
          <Text x={92} y={298} w={L.broker.w - 120} h={24} join={s('mqttStatus')} color={t.accent} {...font} fontSize={17} />
        </ui.Card>

        <ui.Card title="Topics in and out of joins" {...L.controls}>
          {/* home/lamp in, home/lamp/set out: one digital join */}
          <ui.Toggle x={28} y={56} w={Math.min(360, L.controls.w - 56)} label="Lamp" join="lamp" />
          {label(28, 110, 400, 'home/lamp sets it; a tap publishes ON / OFF to home/lamp/set')}
          {/* home/dim in, home/dim/set out: 0..100 on an analog join */}
          <ui.Slider x={28} y={148} w={L.controls.w - 56} label="Dimmer (home/dim, home/dim/set)" join="dim" value={30} />
          {label(28, 220, 200, 'home/text says')}
          <Text x={28} y={244} w={L.controls.w - 56} h={28} join={s('text')} text="(nothing yet)" color={t.text} {...font} fontSize={18} />
          <ui.TextField x={28} y={288} w={L.controls.w - 56 - 152} join="say" placeholder="Say something on home/say" icon="comment" />
          <ui.IconButton x={L.controls.w - 28 - 140} y={288} w={140} h={48} icon="paper-plane" text="Publish" js="MqttExample.say()" />
        </ui.Card>

        <ui.Card title="The last messages (< in, > out)" {...L.messages}>
          <Text x={28} y={52} w={L.messages.w - 56} h={L.messages.h - 68} join={s('mqttLog')} wrap valign="top" color={t.text} {...font} fontSize={15} />
        </ui.Card>
      </ui.ScrollArea>

      {/* the broker: its system, its feedback, its script - once; the topics bound to joins */}
      <Mqtt name="mqtt" host={BROKER} port={1883} keepalive={30} status={s('mqttStatus')} log={s('mqttLog')} logLines={10}
            subscribe={{ 'home/lamp': d('lamp'), 'home/dim': { join: a('dim'), range: [0, 100] }, 'home/text': s('text') }}
            publish={{ 'home/lamp/set': { join: d('lamp'), on: 'ON', off: 'OFF', retain: true, qos: 1 }, 'home/dim/set': { join: a('dim'), range: [0, 100] } }} />
      <Script src="./scripts/example.js" />
    </Page>
  </Project>
);
