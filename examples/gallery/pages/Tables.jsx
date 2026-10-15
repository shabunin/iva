import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, w, text) => <Text x={x} y={y} w={w} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

// rows written here; on a panel they often come from a serial join (source=..., JSON) a script or a feedback fills
const plant = [
  { id: 'P1', name: 'Pump P1', area: 'Boiler room', state: 'Running', temp: 41.5, tone: 'running' },
  { id: 'P2', name: 'Pump P2', area: 'Boiler room', state: 'Stopped', temp: 22.1, tone: 'muted' },
  { id: 'B1', name: 'Boiler B1', area: 'Boiler room', state: 'Overheat', temp: 96.4, tone: 'alarm' },
  { id: 'AHU1', name: 'Air handler 1', area: 'Roof', state: 'Filter dirty', temp: 18.9, tone: 'warning' },
  { id: 'AHU2', name: 'Air handler 2', area: 'Roof', state: 'Running', temp: 19.4, tone: 'running' },
  { id: 'CH1', name: 'Chiller', area: 'Basement', state: 'Cooling', temp: 7.2, tone: 'cooling' },
  { id: 'HX1', name: 'Heat exchanger', area: 'Basement', state: 'Heating', temp: 63, tone: 'heating' },
  { id: 'L3', name: 'Lift 3', area: 'Core', state: 'Offline', temp: 0, tone: 'offline' },
  { id: 'FC2', name: 'Fan coil 2.14', area: 'Floor 2', state: 'OK', temp: 21.6, tone: 'ok' },
];

export default (
  <Page name="Tables" bg={t.page}>
    <ui.Card title="DataTable" x={16} y={88} w={1248} h={330}>
      <ui.DataTable x={28} y={56} w={1192} h={260} rowH={38} data={plant} keyField="id" selected="equipment" toneKey="tone"
                    placeholder="Search equipment…" columns={[
                      { key: 'id', title: 'ID', w: 110 },
                      { key: 'name', title: 'Name' },
                      { key: 'area', title: 'Area', w: 220 },
                      { key: 'state', title: 'State', w: 200, badge: true },
                      { key: 'temp', title: 'Temp °C', w: 150, align: 'right', decimals: 1 },
                    ]} />
    </ui.Card>

    <ui.Card title="AlarmTable · AlarmBanner" x={16} y={434} w={1248} h={350}>
      <ui.AlarmBanner x={28} y={52} w={860} h={48} alarms="plant" />
      {/* these alarms come from conditions on joins: flip the switches */}
      <ui.Toggle x={904} y={40} w={316} h={36} label="Overheat" join="overheat" />
      <ui.Toggle x={904} y={80} w={316} h={36} label="Door open" join="doorOpen" />
      <ui.AlarmTable x={28} y={128} w={1192} h={210} rowH={36} name="plant" conditions={[
        { id: 'hot', text: 'Boiler supply above 90 °C', source: 'Boiler B1', join: d('overheat'), above: 0.5, severity: 'alarm' },
        { id: 'door', text: 'Plant room door open', source: 'Access', join: d('doorOpen'), above: 0.5, severity: 'warning' },
      ]} />
    </ui.Card>
    <Shell section="Tables" />
  </Page>
);
