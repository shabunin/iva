import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

const note = (x, y, w, text) => <Text x={x} y={y} w={w} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

// the house's rooms (metres) and the joins of their lights
const rooms = [
  { label: 'Living', light: 'living', x: 0, z: 0, w: 6, d: 4.5, floor: '#a58e72' },
  { label: 'Kitchen', light: 'kitchen', x: 6, z: 0, w: 4, d: 4.5, floor: '#b7b2a8' },
  { label: 'Bedroom', light: 'bedroom', x: 0, z: 4.5, w: 5, d: 4, floor: '#9c8467' },
  { label: 'Bath', light: 'bath', x: 5, z: 4.5, w: 5, d: 4, floor: '#c9d3d8' },
];
const lights = { living: d('livingLight'), kitchen: d('kitchenLight'), bedroom: d('bedroomLight'), bath: d('bathLight') };

// the cards, each laid out in its cell; on a phone's screen the tab names the one there (no title: the content goes up)
const trend = (c, title) => {
  const top = title ? 44 : 16;
  return (
    <ui.Card title={title} {...c}>
      <ui.Trend x={16} y={top} w={c.w - 32} h={c.h - top - 14} title="Boiler circuit" ranges={[60, 300, 900]} min={0} max={100} rightMin={0} rightMax={20} curves={[
        { join: 'supplyT', label: 'Supply', unit: '°C', scale: [0, 100], color: '#E5484D' },
        { join: 'returnT', label: 'Return', unit: '°C', scale: [0, 100], color: '#2D8CF0' },
        { join: 'power', label: 'Power', unit: 'kW', scale: [0, 20], color: t.accent, side: 'right', width: 1.5 },
      ]} />
    </ui.Card>
  );
};
const doughnut = (c, title) => {
  const top = title ? 44 : 16;
  return (
    <ui.Card title={title} {...c}>
      <ui.Chart x={16} y={top} w={c.w - 32} h={c.h - top - 14} type="doughnut" unit="kW" labels={['Heating', 'Lights', 'Kitchen', 'Other']}
                datasets={[{ joins: ['pHeating', 'pLights', 'pKitchen', 'pOther'], scale: [0, 10], colors: ['#F07A22', '#FFB000', '#2D8CF0', '#8A949C'] }]} />
    </ui.Card>
  );
};
const bars = (c, title) => {
  const top = title ? 44 : 16;
  return (
    <ui.Card title={title} {...c}>
      <ui.Chart x={16} y={top} w={c.w - 32} h={c.h - top - 70} type="bar" unit="kWh" source="energyWeek" labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
                datasets={[{ label: 'Energy', data: [0, 0, 0, 0, 0, 0, 0] }]} />
      <ui.IconButton x={16} y={c.h - 60} w={200} h={44} icon="shuffle" text="Another week" js="galleryWeek()" />
      {c.w >= 480 && note(232, c.h - 50, c.w - 248, 'a script sets the JSON')}
    </ui.Card>
  );
};
// the 3D view; narrow: the switches under it
const house = (c, title) => {
  const top = title ? 44 : 16;
  const stacked = c.w < 600;
  const half = Math.floor((c.w - 48) / 2);
  return (
    <ui.Card title={title} {...c}>
      <WebApp x={16} y={top} w={stacked ? c.w - 32 : c.w - 232} h={stacked ? c.h - top - 128 : c.h - top - 14} entry="../web/house.js" name="house" bg={t.surface} joins={lights}
              options={{ rooms, theme: { bg: t.surface, muted: t.muted, font: t.font } }} />
      {rooms.map((r, i) => (
        <ui.Toggle x={stacked ? 16 + (i % 2) * (half + 16) : c.w - 200} y={stacked ? c.h - 104 + Math.floor(i / 2) * 48 : 56 + i * 48}
                   w={stacked ? half : 184} h={40} label={r.label} join={lights[r.light]} />
      ))}
      {!stacked && note(c.w - 200, 260, 184, 'or tap a room')}
    </ui.Card>
  );
};

// the charts take the room there is
const L = ui.grid({
  trend: { w: 824, h: 340, grow: true },
  doughnut: { w: 408, h: 340, grow: true },
  bars: { w: 500, h: 340, grow: true },
  house: { w: 732, h: 340, grow: true },
}, [['trend', 'doughnut'], ['bars', 'house']]);
const A = ui.screenArea;
const plant = <Script src="../scripts/plant.js" />;

// a phone: a screen each, the charts as big as the screen
export default narrow ? (
  <ui.Screens name="Charts" transition={enter} tabTransition={tab} shell={<Shell section="Charts & 3D" />} screens={[
    { title: 'Trend', content: <>{trend(A)}{plant}</> },
    { title: 'Doughnut', content: doughnut(A) },
    { title: 'Bars', content: bars(A) },
    { title: '3D', content: house(A) },
  ]} />
) : (
  <Page name="Charts" bg={t.page} transition={enter}>
    {plant}
    {trend(L.trend, 'Trend · uPlot')}
    {doughnut(L.doughnut, 'Doughnut · live joins')}
    {bars(L.bars, 'Bars · JSON in a serial join')}
    {house(L.house, '3D · three.js, served by the panel')}
    <Shell section="Charts & 3D" />
  </Page>
);
