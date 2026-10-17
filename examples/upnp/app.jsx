import { ui, t, narrow } from './ui.js';
import { Upnp } from 'iva/drivers/upnp';

/**
 * A UPnP AV control point: the media servers and renderers on the network
 * (SSDP), a server's library browsed into a list, a track played on the
 * renderer picked - with the transport buttons, what plays and its art, a
 * position slider, the volume. The driver (iva/drivers/upnp) brings the
 * systems and the script; this file is the panel around it: three cards on a
 * tablet, three screens on a phone.
 */
const font = { font: t.font };

// what the driver puts in a row: s1 name / title, s2 model / artist - album / count, s3 icon or art, d1 selected / playing
const rows = (deviceW, browseW) => (
  <>
    <Subpage name="upnp_row_device" define w={deviceW} h={60}>
      <Button w={deviceW} h={54} join={1} feedback="none" radius={t.radius} bg={t.raised} active={{ bg: t.accent }}
              onPress={[js('IvaUpnp.rowDown(list)')]} onRelease={[js('IvaUpnp.tap(list, listIndex)')]} />
      <Image x={8} y={7} w={40} h={40} join={3} clickthrough />
      <Text x={60} y={5} w={deviceW - 72} h={26} join={1} {...font} fontSize={18} />
      <Text x={60} y={29} w={deviceW - 72} h={22} join={2} color={t.muted} {...font} fontSize={13} />
    </Subpage>
    <Subpage name="upnp_row_folder" define w={browseW} h={52}>
      <Button w={browseW} h={46} join={1} feedback="none" radius={t.radius} bg={t.raised} active={{ bg: t.accent }}
              onPress={[js('IvaUpnp.rowDown(list)')]} onRelease={[js('IvaUpnp.tap(list, listIndex)')]} />
      <Image x={8} y={7} w={32} h={32} join={3} clickthrough />
      <Text x={52} y={0} w={browseW - 140} h={46} join={1} {...font} fontSize={17} />
      <Text x={browseW - 88} y={0} w={80} h={46} join={2} align="right" color={t.muted} {...font} fontSize={13} />
    </Subpage>
    <Subpage name="upnp_row_track" define w={browseW} h={60}>
      <Button w={browseW} h={54} join={1} feedback="none" radius={t.radius} bg={t.raised} active={{ bg: t.accent }}
              onPress={[js('IvaUpnp.rowDown(list)')]} onRelease={[js('IvaUpnp.tap(list, listIndex)')]} />
      <Image x={8} y={7} w={40} h={40} join={3} clickthrough />
      <Text x={60} y={5} w={browseW - 72} h={26} join={1} {...font} fontSize={17} />
      <Text x={60} y={29} w={browseW - 72} h={22} join={2} color={t.muted} {...font} fontSize={13} />
    </Subpage>
  </>
);

/** the driver, wired to the lists and joins the cards use */
const driver = (
  <Upnp servers={{ list: l('servers'), selected: s('server'), row: 'upnp_row_device' }}
        renderers={{ list: l('renderers'), selected: s('renderer'), row: 'upnp_row_device' }}
        browse={{ list: l('browse'), path: s('path'), up: d('up'), refresh: d('refresh'), rows: { container: 'upnp_row_folder', item: 'upnp_row_track' },
                  icons: { container: 'folder.png', audio: 'musicTrack.png', video: 'videoItem.png' } }}
        transport={{ play: d('play'), pause: d('pause'), stop: d('stop'), next: d('next'), previous: d('previous'), state: s('state'),
                     title: s('title'), artist: s('artist'), album: s('album'), art: s('art'), position: a('position'), elapsed: s('elapsed'), duration: s('duration') }}
        volume={{ level: a('volume'), mute: d('mute') }} status={s('upnpStatus')} search={d('search')} />
);

const devices = (c, title) => {
  const m = 20;
  const top = title ? 56 : 12;
  const w = c.w - 2 * m;
  const half = Math.floor((c.h - top - m - 2 * 30 - 12) / 2);
  return (
    <ui.Card title={title} {...c}>
      <Text x={m} y={top} w={w} h={26} text="Media servers" color={t.muted} {...font} fontSize={15} />
      <List x={m} y={top + 30} w={w} h={half} join={l('servers')} item="upnp_row_device" />
      <Text x={m} y={top + 30 + half + 12} w={w} h={26} text="Renderers" color={t.muted} {...font} fontSize={15} />
      <List x={m} y={top + 30 + half + 42} w={w} h={half} join={l('renderers')} item="upnp_row_device" />
    </ui.Card>
  );
};

const browse = (c, title) => {
  const m = 20;
  const top = title ? 56 : 12;
  const w = c.w - 2 * m;
  return (
    <ui.Card title={title} {...c}>
      <ui.IconButton x={m} y={top} w={88} h={40} icon="arrow-up" text="Up" join={d('up')} />
      <ui.IconButton x={m + 96} y={top} w={48} h={40} icon="rotate" join={d('refresh')} />
      <Text x={m + 156} y={top} w={w - 156} h={40} join={s('path')} text="Pick a server" color={t.muted} {...font} fontSize={14} />
      <List x={m} y={top + 52} w={w} h={c.h - top - 52 - m} join={l('browse')} item="upnp_row_track" />
    </ui.Card>
  );
};

const playing = (c, title) => {
  const m = 20;
  const top = title ? 56 : 12;
  const w = c.w - 2 * m;
  const art = Math.min(120, Math.round(w / 3));
  const bw = Math.floor((w - 4 * 8) / 5);
  const buttons = top + art + 76;
  const volume = buttons + 64;
  return (
    <ui.Card title={title} {...c}>
      <Box x={m} y={top} w={art} h={art} radius={t.radius} bg={t.raised} />
      <Image x={m} y={top} w={art} h={art} join={s('art')} />
      <Text x={m + art + 16} y={top} w={w - art - 16} h={30} join={s('title')} text="Nothing playing" {...font} fontSize={20} />
      <Text x={m + art + 16} y={top + 32} w={w - art - 16} h={24} join={s('artist')} color={t.muted} {...font} fontSize={15} />
      <Text x={m + art + 16} y={top + 56} w={w - art - 16} h={24} join={s('album')} color={t.muted} {...font} fontSize={15} />
      <Text x={m + art + 16} y={top + 88} w={w - art - 16} h={24} join={s('state')} color={t.accent} {...font} fontSize={15} />
      <Text x={m} y={top + art + 16} w={56} h={24} join={s('elapsed')} {...font} fontSize={13} />
      <Slider x={m + 60} y={top + art + 16} w={w - 120} h={24} join={a('position')} bg={t.raised} fill={t.accent} thumbColor={t.text} />
      <Text x={m + w - 56} y={top + art + 16} w={56} h={24} join={s('duration')} align="right" {...font} fontSize={13} />
      <ui.IconButton x={m} y={buttons} w={bw} h={48} icon="backward-step" join={d('previous')} />
      <ui.IconButton x={m + bw + 8} y={buttons} w={bw} h={48} icon="play" tone="accent" join={d('play')} />
      <ui.IconButton x={m + 2 * (bw + 8)} y={buttons} w={bw} h={48} icon="pause" join={d('pause')} />
      <ui.IconButton x={m + 3 * (bw + 8)} y={buttons} w={bw} h={48} icon="stop" join={d('stop')} />
      <ui.IconButton x={m + 4 * (bw + 8)} y={buttons} w={bw} h={48} icon="forward-step" join={d('next')} />
      <ui.Slider x={m} y={volume} w={w} h={52} label="Volume" join="volume" />
      <ui.Toggle x={m} y={volume + 60} w={w} h={44} label="Mute" join="mute" />
      <Text x={m} y={volume + 116} w={w} h={24} join={s('renderer')} text="No renderer picked" color={t.muted} {...font} fontSize={14} />
      <ui.IconButton x={m} y={c.h - m - 40 - 32} w={w} h={40} icon="magnifying-glass" text="Search the network again" join={d('search')} />
      <Text x={m} y={c.h - m - 24} w={w} h={24} join={s('upnpStatus')} color={t.muted} {...font} fontSize={13} />
    </ui.Card>
  );
};

const L = ui.grid({
  devices: { w: 380, h: 700, grow: true },
  browse: { w: 480, h: 700, grow: true },
  playing: [380, 700],
}, [['devices', 'browse', 'playing']]);
const A = ui.screenArea;

export default (
  <Project name="UPnP control point" width={1280} height={800} sizes={['1400x1400@3x']}>
    {narrow ? (
      <ui.Screens name="UPnP" shell={<ui.Header title="UPnP" menu={false} />} screens={[
        { title: 'Devices', content: <>{devices(A)}{driver}{rows(A.w - 40, A.w - 40)}</> },
        { title: 'Browse', content: browse(A) },
        { title: 'Playing', content: playing(A) },
      ]} />
    ) : (
      <Page name="UPnP" bg={t.page}>
        <ui.Header title="UPnP control point" menu={false} />
        {devices(L.devices, 'Devices')}
        {browse(L.browse, 'Browse')}
        {playing(L.playing, 'Now playing')}
        {driver}
        {rows(L.devices.w - 40, L.browse.w - 40)}
      </Page>
    )}
  </Project>
);
