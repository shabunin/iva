import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

/**
 * The network as a script sees it (scripts/network.js): CF.request in each of its forms - to the gallery's
 * own API (scripts/net.js) and to httpbin.org; a TCP echo of the panel's own (a server, and a client to
 * it); CF.systems; Bonjour, publishing the panel's web server and looking up what's around.
 */
const font = { font: t.font };

const requests = (c, title, compact) => {
  const m = compact ? 14 : 24;
  const top = title ? 56 : 14;
  const gap = 8;
  const bw = Math.floor((c.w - 2 * m - 2 * gap) / 3);
  const bh = 40;
  const button = (i, icon, text, js) => (
    <ui.IconButton x={m + (i % 3) * (bw + gap)} y={top + Math.floor(i / 3) * (bh + gap)} w={bw} h={bh} icon={icon} text={text} js={js} />
  );
  const y = top + 2 * bh + gap + 12;
  return (
    <ui.Card title={title} {...c}>
      {button(0, 'cloud-arrow-down', 'GET', 'GalleryNetwork.get()')}
      {button(1, 'tags', 'Headers', 'GalleryNetwork.headers()')}
      {button(2, 'heading', 'HEAD', 'GalleryNetwork.head()')}
      {button(3, 'paper-plane', compact ? 'POST' : 'POST form', 'GalleryNetwork.post()')}
      {button(4, 'pen', compact ? 'PUT' : 'PUT text', 'GalleryNetwork.put()')}
      {button(5, 'ban', 'Refused', 'GalleryNetwork.refused()')}
      <Text x={m} y={y} w={c.w - 2 * m} h={24} join={s('reqLine')} text="Tap a request." {...font} fontSize={compact ? 16 : 17} />
      <Text x={m} y={y + 24} w={c.w - 2 * m} h={22} join={s('reqStatus')} color={t.accent} {...font} fontSize={15} />
      <Text x={m} y={y + 48} w={c.w - 2 * m} h={64} join={s('reqHeaders')} wrap valign="top" color={t.muted} {...font} fontSize={13} />
      <Box x={m} y={y + 116} w={c.w - 2 * m} h={c.h - y - 116 - m} radius={t.radius} bg={t.page} />
      <Text x={m + 10} y={y + 122} w={c.w - 2 * m - 20} h={c.h - y - 128 - m} join={s('reqBody')} wrap valign="top" {...font} fontSize={13} />
    </ui.Card>
  );
};

const echo = (c, title, compact) => {
  const m = compact ? 14 : 24;
  const top = title ? 56 : 14;
  const half = Math.floor((c.w - 2 * m - 8) / 2);
  return (
    <ui.Card title={title} {...c}>
      <ui.Badge x={m} y={top} join={d('echoUp')} on="EchoClient connected" off="EchoClient not connected" dot />
      <ui.TextField x={m} y={top + 34} w={c.w - 2 * m - 128} h={44} join="echoText" placeholder="Say something" cmd="EchoSay" />
      <ui.IconButton x={c.w - m - 120} y={top + 34} w={120} h={44} icon="paper-plane" text="Send" tone="accent" js="GalleryNetwork.echo()" />
      <Text x={m} y={top + 86} w={70} h={26} text="Reply" color={t.muted} {...font} fontSize={15} />
      <Text x={m + 70} y={top + 86} w={c.w - 2 * m - 70} h={26} join={s('echoReply')} {...font} fontSize={16} />
      <ui.IconButton x={m} y={top + 118} w={half} h={40} icon="power-off" text="Client on / off" js="GalleryNetwork.toggle()" />
      <ui.IconButton x={m + half + 8} y={top + 118} w={half} h={40} icon="shuffle" text="Port 8897 / 8896" js="GalleryNetwork.port()" />
      <Text x={m} y={top + 168} w={c.w - 2 * m} h={c.h - top - 168 - m} join={s('sysLog')} wrap valign="top" color={t.muted} {...font} fontSize={13} />
    </ui.Card>
  );
};

const systems = (c, title, compact) => {
  const m = compact ? 14 : 24;
  const top = title ? 52 : 14;
  return (
    <ui.Card title={title} {...c}>
      <ui.DataTable x={m} y={top} w={c.w - 2 * m} h={c.h - top - m} rowH={30} fontSize={14} source={s('sysTable')} keyField="name" toneKey="tone" search={false}
                    words={{ rows: 'systems', empty: 'No systems' }} columns={[
                      { key: 'name', title: 'Name' },
                      { key: 'type', title: 'Type', w: compact ? 62 : 70 },
                      { key: 'where', title: 'Address', w: compact ? 124 : 190 },
                      { key: 'state', title: 'State', w: compact ? 100 : 128, badge: true },
                    ]} />
    </ui.Card>
  );
};

const bonjour = (c, title, compact) => {
  const m = compact ? 14 : 24;
  const top = title ? 52 : 14;
  const tableTop = top + 92;
  const detailH = 44;
  return (
    <ui.Card title={title} {...c}>
      <ui.Toggle x={m} y={top} w={c.w - 2 * m} h={36} label={compact ? 'Publish this panel' : 'Publish this panel (_http._tcp., port 8900)'} join="bjPublish" />
      <Text x={m} y={top + 38} w={c.w - 2 * m} h={20} join={s('bjStatus')} text="Not published" color={t.muted} {...font} fontSize={13} />
      <ui.Segmented x={m} y={top + 60} w={c.w - 2 * m} h={28} options={['Web', 'Cast', 'AirPlay', 'Printers']} join="bjType" />
      <ui.DataTable x={m} y={tableTop + 4} w={c.w - 2 * m} h={c.h - tableTop - 4 - detailH - m} rowH={34} fontSize={14} source={s('bjFound')} keyField="name" search={false}
                    onSelect="GalleryNetwork.detail(row)" words={{ rows: 'found', empty: 'Looking…' }} columns={[
                      { key: 'name', title: 'Service' },
                      { key: 'where', title: 'Where', w: compact ? 150 : 200 },
                    ]} />
      <Text x={m} y={c.h - m - detailH} w={c.w - 2 * m} h={detailH} join={s('bjDetail')} wrap valign="top" color={t.muted} {...font} fontSize={13} />
    </ui.Card>
  );
};

/** the echo's systems, the API it asks, the script: once */
const setup = (
  <>
    <System name="EchoServer" host="0.0.0.0" port={8897} localPort={8897} accept>
      <Feedback name="line" regex="([^\r\n]+)\r?\n" />
    </System>
    {/* 127.0.0.2: the device itself, by a real connection (127.0.0.1 would be a loopback system) */}
    <System name="EchoClient" host="127.0.0.2" port={8897} connectJoin={d('echoUp')}>
      <Command name="EchoSay" send="[inputval]\x0D\x0A" />
      <Feedback name="reply" regex="ECHO ([^\r\n]*)"><Capture join={s('echoReply')} /></Feedback>
    </System>
    <Script src="../scripts/network.js" />
    <OnStart js="GalleryNetwork.start();" joins={[s('reqLine'), s('reqStatus'), s('reqHeaders'), s('reqBody'), s('sysLog'), s('sysTable'), s('bjFound'), s('bjStatus'), s('bjDetail')]} />
  </>
);

const L = ui.grid({
  request: [560, 360],
  echo: [520, 360],
  systems: [560, 260],
  bonjour: [520, 300],
}, [['request', 'echo'], ['systems', 'bonjour']]);
const A = ui.screenArea;

export default narrow ? (
  <ui.Screens name="Network" transition={enter} tabTransition={tab} shell={<Shell section="Network" />} screens={[
    { title: 'Request', content: <>{requests(A, undefined, true)}{setup}</> },
    { title: 'Echo', content: echo(A, undefined, true) },
    { title: 'Systems', content: systems(A, undefined, true) },
    { title: 'Bonjour', content: bonjour(A, undefined, true) },
  ]} />
) : (
  <Page name="Network" bg={t.page} transition={enter}>
    {requests(L.request, 'CF.request')}
    {echo(L.echo, 'Systems: a TCP echo')}
    {systems(L.systems, 'CF.systems')}
    {bonjour(L.bonjour, 'Bonjour')}
    {setup}
    <Shell section="Network" />
  </Page>
);
