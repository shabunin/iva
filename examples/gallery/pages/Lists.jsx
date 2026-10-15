import { ui, t, narrow } from '../ui.js';
import Shell from '../components/Shell.jsx';

/** @type {import('iva/ui').DataListItem[]} */
const devices = [
  { header: 'Living room' },
  { icon: 'lightbulb', title: 'Ceiling light', subtitle: 'Dimmer', value: '70 %' },
  { icon: 'tv', title: 'TV', subtitle: 'Samsung', value: 'On' },
  { icon: 'triangle-exclamation', title: 'Window open', subtitle: 'Since 14:20', alert: true },
  { spacer: true },
  { header: 'Kitchen' },
  { icon: 'lightbulb', title: 'Spots', subtitle: 'Relay', value: 'Off' },
  { icon: 'snowflake', title: 'Fridge', subtitle: 'Sensor', value: '4 °C' },
  { icon: 'droplet', title: 'Dishwasher', subtitle: 'Running', value: '25 min' },
  { spacer: true },
  { header: 'Outside' },
  { icon: 'temperature-half', title: 'Garden', subtitle: 'Sensor', value: '12 °C' },
  { icon: 'car', title: 'Garage door', subtitle: 'Motor', value: 'Closed' },
];

// the cards, each laid out in its cell; on a phone's screen the tab names it (no title: the content goes up)
const dataList = (c, title) => {
  const top = title ? 50 : 16;
  return (
    <ui.Card title={title} {...c}>
      <Text x={28} y={top} w={c.w - 60} h={24} text="headers, rows, an alert, a spacer - filled at start" color={t.muted} font={t.font} fontSize={16} />
      <ui.DataList x={20} y={top + 34} w={c.w - 40} h={c.h - top - 50} join="devices" items={devices} />
    </ui.Card>
  );
};

const listRows = (c, title) => {
  const top = title ? 56 : 20;
  return (
    <ui.Card title={title} {...c}>
      <ui.ListRow x={28} y={top} w={c.w - 56} icon="moon" title="Night mode" subtitle="with a toggle" toggle="night" />
      <ui.ListRow x={28} y={top + 64} w={c.w - 56} icon="temperature-half" title="Temperature" subtitle="with a value" value="22.4 °C" />
      <ui.ListRow x={28} y={top + 128} w={c.w - 56} icon="gear" title="Settings" subtitle="tappable: a chevron" chevron page="Overview" />
      <ui.ListRow x={28} y={top + 192} w={c.w - 56} title="Plain row" subtitle="no icon, no divider" divider={false} />
    </ui.Card>
  );
};

const scrollBox = (c, title) => {
  const top = title ? 56 : 20;
  return (
    <ui.Card title={title} {...c}>
      <ui.ScrollBox x={28} y={top} w={c.w - 56} h={c.h - top - 24} join="lines" lines={Array.from({ length: 12 }, (_, i) => `Line ${i + 1} - drag to scroll`)} />
    </ui.Card>
  );
};

// the list and the scroll box take the height there is
const L = ui.grid({
  list: { w: 600, h: 696, grow: true },
  rows: [632, 340],
  scroll: { w: 632, h: 340, grow: true },
}, [['list', ['rows', 'scroll']]]);

// a phone: a screen each - a list in a list (a ScrollArea) shows nothing on the device
export default narrow ? (
  <ui.Screens name="Lists" shell={<Shell section="Lists" />} screens={[
    { title: 'DataList', content: dataList(ui.screenArea) },
    { title: 'ListRow', content: listRows(ui.screenArea) },
    { title: 'ScrollBox', content: scrollBox(ui.screenArea) },
  ]} />
) : (
  <Page name="Lists" bg={t.page}>
    {dataList(L.list, 'DataList')}
    {listRows(L.rows, 'ListRow')}
    {scrollBox(L.scroll, 'ScrollBox')}
    <Shell section="Lists" />
  </Page>
);
