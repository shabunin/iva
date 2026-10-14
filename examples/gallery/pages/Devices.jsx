import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

export default (
  <Page name="Devices" bg={t.page}>
    <ui.Card title="Dimmer" x={16} y={88} w={400} h={200}>
      <ui.Dimmer x={28} y={64} w={344} label="Kitchen" on="kitchenOn" level="kitchenLevel" />
    </ui.Card>
    <ui.Card title="Blinds" x={16} y={304} w={400} h={260}>
      <ui.Blinds x={28} y={64} w={344} label="Living room" position="blinds" />
    </ui.Card>
    <ui.Card title="Rooms" x={432} y={88} w={832} h={476}>
      <ui.Tile x={28} y={64} w={180} icon="couch" title="Living room" status="2 lights on" join="r1" />
      <ui.Tile x={224} y={64} w={180} icon="utensils" title="Kitchen" status="Off" join="r2" />
      <ui.Tile x={420} y={64} w={180} icon="bed" title="Bedroom" status="21.0 °C" join="r3" />
      <ui.Tile x={616} y={64} w={180} icon="car" title="Garage" status="Closed" join="r4" />
      <ui.Tile x={28} y={260} w={180} icon="shower" title="Bathroom" status="Heating" join="r5" />
      <ui.Tile x={224} y={260} w={180} icon="tree" title="Garden" status="Sprinklers" join="r6" />
    </ui.Card>
    <OnStart js={'CF.setJoin(Joins.d.kitchenOn, 1); IvaUI.set(Joins.a.kitchenLevel, 70, 0, 100); IvaUI.set(Joins.a.blinds, 40, 0, 100);'} />
    <Shell section="Devices" />
  </Page>
);
