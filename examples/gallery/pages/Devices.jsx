import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const tiles = [
  ['couch', 'Living room', '2 lights on'], ['utensils', 'Kitchen', 'Off'], ['bed', 'Bedroom', '21.0 °C'],
  ['car', 'Garage', 'Closed'], ['shower', 'Bathroom', 'Heating'], ['tree', 'Garden', 'Sprinklers'],
];

export default (
  <Page name="Devices" bg={t.page}>
    <ui.Card title="Dimmer" x={16} y={88} w={400} h={200}>
      <ui.Dimmer x={28} y={64} w={344} label="Kitchen" on="kitchenOn" level="kitchenLevel" />
    </ui.Card>
    <ui.Card title="Blinds" x={16} y={304} w={400} h={260}>
      <ui.Blinds x={28} y={64} w={344} label="Living room" position="blinds" />
    </ui.Card>

    <ui.Card title="ColorPicker" x={432} y={88} w={450} h={420}>
      <ui.ColorPicker x={28} y={64} r="lampR" g="lampG" b="lampB" hex="lampHex" value="#FFB000"
                      onChange="CF.setJoin(Joins.s.lampRgb, 'r ' + r + '  g ' + g + '  b ' + b);" />
      <Text x={28} y={360} w={394} h={30} join={s('lampRgb')} color={t.muted} font={t.font} fontSize={17} />
    </ui.Card>
    <ui.Card title="Web" x={432} y={524} w={450} h={240}>
      <Web x={28} y={60} w={394} h={152} url="web.html" />
    </ui.Card>

    <ui.Card title="Rooms" x={898} y={88} w={366} h={572}>
      {tiles.map(([icon, title, status], i) => (
        <ui.Tile x={28 + (i % 2) * 163} y={64 + Math.floor(i / 2) * 163} w={147} h={147} icon={icon} title={title} status={status} join={`r${i + 1}`} />
      ))}
    </ui.Card>
    <OnStart js={'CF.setJoin(Joins.d.kitchenOn, 1); IvaUI.set(Joins.a.kitchenLevel, 70, 0, 100); IvaUI.set(Joins.a.blinds, 40, 0, 100);'} />
    <Shell section="Devices" />
  </Page>
);
