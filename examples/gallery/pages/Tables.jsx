import { ui, t, narrow } from '../ui.js';
import Shell from '../components/Shell.jsx';

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

// the cards, each laid out in its cell; on a phone's screen the tab names the one there (no title: the content goes up)
const table = (c, title) => {
  const top = title ? 56 : 14;
  return (
    <ui.Card title={title} {...c}>
      <ui.DataTable x={narrow ? 14 : 28} y={top} w={c.w - (narrow ? 28 : 56)} h={c.h - top - 14} rowH={38} data={plant} keyField="id" selected="equipment" toneKey="tone"
                    placeholder="Search equipment…" columns={narrow ? [
                      { key: 'id', title: 'ID', w: 64 },
                      { key: 'name', title: 'Name' },
                      { key: 'state', title: 'State', w: 128, badge: true },
                      { key: 'temp', title: '°C', w: 60, align: 'right', decimals: 1 },
                    ] : [
                      { key: 'id', title: 'ID', w: 110 },
                      { key: 'name', title: 'Name' },
                      { key: 'area', title: 'Area', w: 220 },
                      { key: 'state', title: 'State', w: 200, badge: true },
                      { key: 'temp', title: 'Temp °C', w: 150, align: 'right', decimals: 1 },
                    ]} />
    </ui.Card>
  );
};
// these alarms come from conditions on joins: the switches
const alarmTable = (x, y, w, h) => (
  <ui.AlarmTable x={x} y={y} w={w} h={h} rowH={36} name="plant" conditions={[
    { id: 'hot', text: 'Boiler supply above 90 °C', source: 'Boiler B1', join: d('overheat'), above: 0.5, severity: 'alarm' },
    { id: 'door', text: 'Plant room door open', source: 'Access', join: d('doorOpen'), above: 0.5, severity: 'warning' },
  ]} />
);

// the tables take the height there is
const L = ui.grid({
  table: { w: 1248, h: 330, grow: true },
  alarms: { w: 1248, h: 350, grow: true },
}, [['table'], ['alarms']]);
const A = ui.screenArea;

// a phone: a screen each - a list in a list (a ScrollArea) shows nothing on the device
export default narrow ? (
  <ui.Screens name="Tables" shell={<Shell section="Tables" />} screens={[
    { title: 'DataTable', content: table(A) },
    { title: 'Alarms', content: <ui.Card {...A}>{alarmTable(14, 14, A.w - 28, A.h - 28)}</ui.Card> },
    {
      title: 'Banner',
      content: (
        <ui.Card {...A}>
          <ui.AlarmBanner x={20} y={20} w={A.w - 40} h={48} alarms="plant" />
          <Text x={24} y={84} w={A.w - 48} h={48} wrap text="The alarms come from conditions on joins: flip these, see them in Alarms." color={t.muted} font={t.font} fontSize={16} />
          <ui.Toggle x={20} y={148} w={A.w - 40} h={36} label="Overheat" join="overheat" />
          <ui.Toggle x={20} y={196} w={A.w - 40} h={36} label="Door open" join="doorOpen" />
        </ui.Card>
      ),
    },
  ]} />
) : (
  <Page name="Tables" bg={t.page}>
    {table(L.table, 'DataTable')}
    <ui.Card title="AlarmTable · AlarmBanner" {...L.alarms}>
      <ui.AlarmBanner x={28} y={52} w={L.alarms.w - 388} h={48} alarms="plant" />
      <ui.Toggle x={L.alarms.w - 344} y={40} w={316} h={36} label="Overheat" join="overheat" />
      <ui.Toggle x={L.alarms.w - 344} y={80} w={316} h={36} label="Door open" join="doorOpen" />
      {alarmTable(28, 128, L.alarms.w - 56, L.alarms.h - 140)}
    </ui.Card>
    <Shell section="Tables" />
  </Page>
);
