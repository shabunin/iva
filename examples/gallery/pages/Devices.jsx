import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

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

/**
 * A camera's picture a second: an image of a URL - the gallery's own server's (<HttpServer>, scripts/net.js)
 * - loaded again every second (refresh), never from a cache (noCache); another camera clears it at once
 * (clearOnURLChange) and a spinner shows till its first picture comes (downloadIndicator). Below: an HTTP
 * system - a command is a GET of its path, the answer's body goes to its feedback.
 */
const camUrl = (n) => `http://127.0.0.1:8898/camera/${n}`;
const camera = (c, compact) => {
  const m = compact ? 16 : 28;
  const top = compact ? 8 : 52;
  const iw = compact ? 268 : 256;
  const ih = Math.round((iw * 9) / 16);
  const bx = m + iw + 14;
  const bw = c.w - bx - m;
  const bh = 44;
  const below = top + ih + (compact ? 10 : 10);
  return (
    <ui.Card title={compact ? undefined : 'Camera & HTTP'} {...c}>
      <Box x={m} y={top} w={iw} h={ih} radius={t.radius} bg={t.page} />
      <Image x={m} y={top} w={iw} h={ih} join={s('camUrl')} src={camUrl(1)} refresh={1000} noCache downloadIndicator clearOnURLChange />
      <ui.IconButton x={bx} y={top} w={bw} h={bh} icon="video" text="Cam 1" js={`CF.setJoin(Joins.s.camUrl, '${camUrl(1)}')`} />
      <ui.IconButton x={bx} y={top + bh + 8} w={bw} h={bh} icon="video" text="Cam 2" js={`CF.setJoin(Joins.s.camUrl, '${camUrl(2)}')`} />
      <ui.IconButton x={bx} y={top + 2 * (bh + 8)} w={bw} h={bh} icon="cloud-arrow-down" text="GET" cmd="GalleryNow" />
      <Text x={m} y={below} w={150} h={24} text="HTTP GET /now:" color={t.muted} font={t.font} fontSize={compact ? 14 : 15} />
      <Text x={m + 150} y={below} w={c.w - 2 * m - 150} h={24} join={s('apiNow')} text="(press GET)" font={t.font} fontSize={compact ? 14 : 15} />
      <Text x={m} y={below + 26} w={c.w - 2 * m} h={compact ? 34 : 18} wrap valign="top" color={t.muted} font={t.font} fontSize={12}
            text={compact ? 'The picture: refresh 1 s, no cache; another camera clears it, a spinner till it comes.' : 'Refresh 1 s, no cache; a new camera: cleared, a spinner.'} />
      <System name="GalleryApi" protocol="http" host="127.0.0.1" port={8899} connectJoin={d('apiUp')}>
        <Command name="GalleryNow" send="/now" />
        <Feedback name="apiNow" regex="now=(.*)"><Capture join={s('apiNow')} /></Feedback>
      </System>
      <HttpServer name="galleryCams" port={8898} handler="galleryCamera" />
      <HttpServer name="galleryApiServer" port={8899} handler="galleryApi" />
      <Script src="../scripts/net.js" />
    </ui.Card>
  );
};

// three stacks: the web view takes the height there is
const L = ui.grid({
  dimmer: [400, 200],
  blinds: [400, 260],
  web: { w: 400, h: 204, grow: true },
  color: [450, 420],
  camera: [450, 260],
  rooms: [366, 572],
}, [[['dimmer', 'blinds', 'web'], ['color', 'camera'], 'rooms']]);
// a phone's first screen: the two cards one under another (they scroll)
const P = ui.grid({ dimmer: [400, 200], blinds: [400, 260] }, [['dimmer'], ['blinds']], ui.screenArea);

// a phone: a screen each - the colour wheel is a subpage, which a list (a ScrollArea) doesn't show on the device
export default narrow ? (
  <ui.Screens name="Devices" transition={enter} tabTransition={tab} shell={<Shell section="Devices" />} screens={[
    { title: 'Lights', content: <>{dimmer(P.dimmer)}{blinds(P.blinds)}{start}</> },
    { title: 'Colour', content: color(ui.screenArea) },
    { title: 'Web', content: web(ui.screenArea) },
    { title: 'Rooms', content: rooms(ui.screenArea) },
    { title: 'Camera', content: camera(ui.screenArea, true) },
  ]} />
) : (
  <Page name="Devices" bg={t.page} transition={enter}>
    {dimmer(L.dimmer)}
    {blinds(L.blinds)}
    {color(L.color, 'ColorPicker')}
    {web(L.web, 'Web')}
    {rooms(L.rooms, 'Rooms')}
    {camera(L.camera)}
    {start}
    <Shell section="Devices" />
  </Page>
);
