import { ui, t, narrow } from '../ui.js';
import Shell from '../components/Shell.jsx';

const tiles = [
  ['couch', 'Living room', '2 lights on'], ['utensils', 'Kitchen', 'Off'], ['bed', 'Bedroom', '21.0 °C'],
  ['car', 'Garage', 'Closed'], ['shower', 'Bathroom', 'Heating'], ['tree', 'Garden', 'Sprinklers'],
];
const start = <OnStart js={'CF.setJoin(Joins.d.kitchenOn, 1); IvaUI.set(Joins.a.kitchenLevel, 70, 0, 100); IvaUI.set(Joins.a.blinds, 40, 0, 100);'} />;

// the cards, each laid out in its cell; on a phone's screen the tab names the one there (no title: the content goes up)
const dimmer = (c) => (
  <ui.Card title="Dimmer" {...c}>
    <ui.Dimmer x={28} y={64} w={c.w - 56} label="Kitchen" on="kitchenOn" level="kitchenLevel" />
  </ui.Card>
);
const blinds = (c) => (
  <ui.Card title="Blinds" {...c}>
    <ui.Blinds x={28} y={64} w={c.w - 56} label="Living room" position="blinds" />
  </ui.Card>
);
const color = (c, title) => {
  const top = title ? 64 : 24;
  return (
    <ui.Card title={title} {...c}>
      <ui.ColorPicker x={28} y={top} size={narrow ? 180 : 210} r="lampR" g="lampG" b="lampB" hex="lampHex" value="#FFB000"
                      onChange="CF.setJoin(Joins.s.lampRgb, 'r ' + r + '  g ' + g + '  b ' + b);" />
      <Text x={28} y={top + (narrow ? 252 : 296)} w={c.w - 56} h={30} join={s('lampRgb')} color={t.muted} font={t.font} fontSize={17} />
    </ui.Card>
  );
};
const web = (c, title) => {
  const top = title ? 60 : 20;
  return (
    <ui.Card title={title} {...c}>
      <Web x={28} y={top} w={c.w - 56} h={c.h - top - 28} url="web.html" />
    </ui.Card>
  );
};
const rooms = (c, title) => {
  const top = title ? 64 : 20;
  const cols = 2;
  const size = Math.floor((c.w - 56 - (cols - 1) * 16) / cols);
  return (
    <ui.Card title={title} {...c} h={Math.max(c.h, top + 3 * size + 2 * 16 + 20)}>
      {tiles.map(([icon, name, status], i) => (
        <ui.Tile x={28 + (i % cols) * (size + 16)} y={top + Math.floor(i / cols) * (size + 16)} w={size} h={size} icon={icon} title={name} status={status} join={`r${i + 1}`} />
      ))}
    </ui.Card>
  );
};

// two stacks and a card; the web view takes the height there is
const L = ui.grid({
  dimmer: [400, 200],
  blinds: [400, 260],
  color: [450, 420],
  web: { w: 450, h: 240, grow: true },
  rooms: [366, 572],
}, [[['dimmer', 'blinds'], ['color', 'web'], 'rooms']]);
// a phone's first screen: the two cards one under another (they scroll)
const P = ui.grid({ dimmer: [400, 200], blinds: [400, 260] }, [['dimmer'], ['blinds']], ui.screenArea);

// a phone: a screen each - the colour wheel is a subpage, which a list (a ScrollArea) doesn't show on the device
export default narrow ? (
  <ui.Screens name="Devices" shell={<Shell section="Devices" />} screens={[
    { title: 'Lights', content: <>{dimmer(P.dimmer)}{blinds(P.blinds)}{start}</> },
    { title: 'Colour', content: color(ui.screenArea) },
    { title: 'Web', content: web(ui.screenArea) },
    { title: 'Rooms', content: rooms(ui.screenArea) },
  ]} />
) : (
  <Page name="Devices" bg={t.page}>
    {dimmer(L.dimmer)}
    {blinds(L.blinds)}
    {color(L.color, 'ColorPicker')}
    {web(L.web, 'Web')}
    {rooms(L.rooms, 'Rooms')}
    {start}
    <Shell section="Devices" />
  </Page>
);
