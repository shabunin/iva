import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

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

/**
 * A list a script changes (scripts/lists.js): an item comes in at the top - opening in the middle, the
 * others sliding down - and goes off to the left (insertTransition / deleteTransition); a swipe left on
 * one shows Delete. Title items use the list's title subpage; an item's toggle stays with it.
 */
const liveCard = (c, compact) => {
  const m = compact ? 16 : 28;
  const top = compact ? 8 : 48;
  const bh = compact ? 40 : 48;
  const by = top + (compact ? 38 : 50);
  const listY = by + bh + 10;
  const lw = c.w - 2 * m;
  const bw = Math.floor((lw - 16) / 3);
  const row = (
    <Subpage name="gallery_live_row" w={lw} h={56}>
      <Box x={0} y={3} w={lw} h={50} radius={t.radius} bg={t.raised} />
      <Text x={16} y={6} w={lw - 140} h={24} join={1} font={t.font} fontSize={18} />
      <Text x={16} y={29} w={lw - 140} h={20} join={2} color={t.muted} font={t.font} fontSize={13} />
      <ui.Toggle x={lw - 112} y={4} w={104} h={48} join={3} />
    </Subpage>
  );
  const title = (
    <Subpage name="gallery_live_title" w={lw} h={40}>
      <Text x={8} y={8} w={lw - 16} h={28} join={1} color={t.accent} font={t.font} fontSize={15} bold />
    </Subpage>
  );
  return (
    <ui.Card title={compact ? undefined : 'Live list'} {...c}>
      <Text x={m} y={top} w={lw} h={compact ? 34 : 44} wrap valign="top" color={t.muted} font={t.font} fontSize={compact ? 13 : 15}
            text="Items come in (opening) and go (to the left) as a script adds and removes them; swipe one left to delete it." />
      <ui.IconButton x={m} y={by} w={bw} h={bh} icon="plus" text="Add" js="GalleryList.add()" />
      <ui.IconButton x={m + bw + 8} y={by} w={bw} h={bh} icon="heading" text="Title" js="GalleryList.title()" />
      <ui.IconButton x={m + 2 * (bw + 8)} y={by} w={bw} h={bh} icon="minus" text="Last" js="GalleryList.remove()" />
      <List x={m} y={listY} w={lw} h={c.h - listY - 16} join="liveRooms" item={row} title={title}
            swipeDelete insertTransition="middle" deleteTransition="left" />
      <Script src="../scripts/lists.js" />
      <OnStart js="GalleryList.fill();" />
    </ui.Card>
  );
};

// the list and the scroll box take the height there is
const L = ui.grid({
  list: { w: 400, h: 696, grow: true },
  rows: [416, 340],
  scroll: { w: 416, h: 340, grow: true },
  live: { w: 400, h: 696, grow: true },
}, [['list', ['rows', 'scroll'], 'live']]);

// a phone: a screen each - a list in a list (a ScrollArea) shows nothing on the device
export default narrow ? (
  <ui.Screens name="Lists" transition={enter} tabTransition={tab} shell={<Shell section="Lists" />} screens={[
    { title: 'DataList', content: dataList(ui.screenArea) },
    { title: 'ListRow', content: listRows(ui.screenArea) },
    { title: 'ScrollBox', content: scrollBox(ui.screenArea) },
    { title: 'Live', content: liveCard(ui.screenArea, true) },
  ]} />
) : (
  <Page name="Lists" bg={t.page} transition={enter}>
    {dataList(L.list, 'DataList')}
    {listRows(L.rows, 'ListRow')}
    {scrollBox(L.scroll, 'ScrollBox')}
    {liveCard(L.live)}
    <Shell section="Lists" />
  </Page>
);
