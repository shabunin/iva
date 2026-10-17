import { ui, t, narrow } from '../ui.js';
import Shell, { enter } from '../components/Shell.jsx';

/**
 * Commissioning: the device's setup code (the 11 digits under the QR code, or the QR code's MT:... text),
 * its address where Bonjour can't find it (optional), Go, and what the controller says while it pairs (the
 * `matterStatus` join).
 */
const font = { font: t.font };
const m = narrow ? 14 : 28;

const L = ui.grid({ commission: [700, 360] }, [['commission']]);

export default (
  <Page name="Commission" bg={t.page} transition={enter}>
    <ui.ScrollArea>
      <ui.Card title="Commission a device" {...L.commission}>
        <Text x={m} y={52} w={L.commission.w - 2 * m} h={narrow ? 44 : 24} wrap valign="top" text="The setup code on the device (11 digits, or the QR code's MT: text). The device must be on this network, in pairing mode." color={t.muted} {...font} fontSize={narrow ? 13 : 15} />
        <ui.TextField x={m} y={narrow ? 104 : 90} w={L.commission.w - 2 * m - 110} h={48} join="setupCode" placeholder="34970112332" icon="key" />
        <ui.IconButton x={L.commission.w - m - 100} y={narrow ? 104 : 90} w={100} h={48} icon="play" text="Go" tone="accent" join="commission" feedback="momentary" />
        <ui.TextField x={m} y={narrow ? 164 : 150} w={L.commission.w - 2 * m} h={48} join="setupAddress" placeholder="Address, if Bonjour can't find it (192.168.2.40 or [fe80::1]:5540)" icon="location-dot" />
        <Text x={m} y={narrow ? 226 : 212} w={L.commission.w - 2 * m} h={L.commission.h - (narrow ? 226 : 212) - m} join={s('matterStatus')} text="Not started" wrap valign="top" {...font} fontSize={narrow ? 14 : 16} />
      </ui.Card>
    </ui.ScrollArea>
    <Shell section="Commission" />
  </Page>
);
