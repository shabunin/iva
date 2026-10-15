import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, w, text) => <Text x={x} y={y} w={w} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

// the house's rooms (metres) and the joins of their lights
const rooms = [
  { label: 'Living', light: 'living', x: 0, z: 0, w: 6, d: 4.5, floor: '#a58e72' },
  { label: 'Kitchen', light: 'kitchen', x: 6, z: 0, w: 4, d: 4.5, floor: '#b7b2a8' },
  { label: 'Bedroom', light: 'bedroom', x: 0, z: 4.5, w: 5, d: 4, floor: '#9c8467' },
  { label: 'Bath', light: 'bath', x: 5, z: 4.5, w: 5, d: 4, floor: '#c9d3d8' },
];
const lights = { living: d('livingLight'), kitchen: d('kitchenLight'), bedroom: d('bedroomLight'), bath: d('bathLight') };

export default (
  <Page name="Charts" bg={t.page}>
    <Script src="../scripts/plant.js" />

    <ui.Card title="Trend · uPlot" x={16} y={88} w={824} h={340}>
      <ui.Trend x={16} y={44} w={792} h={282} title="Boiler circuit" ranges={[60, 300, 900]} min={0} max={100} rightMin={0} rightMax={20} curves={[
        { join: 'supplyT', label: 'Supply', unit: '°C', scale: [0, 100], color: '#E5484D' },
        { join: 'returnT', label: 'Return', unit: '°C', scale: [0, 100], color: '#2D8CF0' },
        { join: 'power', label: 'Power', unit: 'kW', scale: [0, 20], color: t.accent, side: 'right', width: 1.5 },
      ]} />
    </ui.Card>

    <ui.Card title="Doughnut · live joins" x={856} y={88} w={408} h={340}>
      <ui.Chart x={16} y={44} w={376} h={282} type="doughnut" unit="kW" labels={['Heating', 'Lights', 'Kitchen', 'Other']}
                datasets={[{ joins: ['pHeating', 'pLights', 'pKitchen', 'pOther'], scale: [0, 10], colors: ['#F07A22', '#FFB000', '#2D8CF0', '#8A949C'] }]} />
    </ui.Card>

    <ui.Card title="Bars · JSON in a serial join" x={16} y={444} w={500} h={340}>
      <ui.Chart x={16} y={44} w={468} h={226} type="bar" unit="kWh" source="energyWeek" labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
                datasets={[{ label: 'Energy', data: [0, 0, 0, 0, 0, 0, 0] }]} />
      <ui.IconButton x={16} y={280} w={200} h={44} icon="shuffle" text="Another week" js="galleryWeek()" />
      {note(232, 290, 252, 'a script sets the JSON')}
    </ui.Card>

    <ui.Card title="3D · three.js, served by the panel" x={532} y={444} w={732} h={340}>
      <WebApp x={16} y={44} w={500} h={282} entry="../web/house.js" name="house" bg={t.surface} joins={lights}
              options={{ rooms, theme: { bg: t.surface, muted: t.muted, font: t.font } }} />
      {rooms.map((r, i) => (
        <ui.Toggle x={532} y={56 + i * 48} w={184} h={40} label={r.label} join={lights[r.light]} />
      ))}
      {note(532, 260, 184, 'or tap a room')}
    </ui.Card>

    <Shell section="Charts & 3D" />
  </Page>
);
