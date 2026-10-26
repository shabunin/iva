import { neu, t, phone, P, CW } from '../ui.js';
import Shell, { fade } from '../components/Shell.jsx';
import Stack from '../components/Stack.jsx';

const tiles = [
  { icon: 'lightbulb', title: 'Ceiling lights', sub: '4 lamps · 80%', join: 'home_lights', on: true },
  { icon: 'tv', title: 'Smart TV', sub: 'Living room', join: 'home_tv' },
  { icon: 'fan', title: 'Air purifier', sub: 'Auto · quiet', join: 'home_air', on: true },
  { icon: 'volume-high', title: 'Speaker', sub: 'Kitchen', join: 'home_speaker' },
];
const scenes = ['sun', 'moon', 'book-open', 'film'];

/** devices, two a row: a tap turns one on (pressed in, its icon lit) */
const deviceTiles = (x, y, w, th = 150, gap = 24) => {
  const tw = Math.floor((w - gap) / 2);
  return tiles.map((d, i) => (
    <neu.Tile x={x + (i % 2) * (tw + gap)} y={y + Math.floor(i / 2) * (th + gap)} w={tw} h={th} icon={d.icon} title={d.title} sub={d.sub} join={d.join} value={d.on} />
  ));
};

/** lighting: brightness, warmth, a scene */
const lighting = (w) => {
  const side = w - 2 * P >= 460; // the scenes beside their label
  return (
    <>
      <neu.Slider x={P} y={60} w={w - 2 * P} label="Brightness" join="home_bright" value={80} />
      <neu.Slider x={P} y={140} w={w - 2 * P} label="Warmth" join="home_warm" min={2200} max={6500} value={3000} unit=" K" />
      <neu.Text x={P} y={226} w={200} h={22} text="Scene" color={t.sub} fontSize={16} fontStyle="Medium" />
      <neu.ButtonGroup x={side ? w - P - 284 : P} y={side ? 218 : 258} size={56} gap={20} icons={scenes} join="home_scene" value={1} />
    </>
  );
};
const lightingH = (w) => (w - 2 * P >= 460 ? 324 : 344);

/** climate: what it is, what it's set to, the fan */
const climate = (w) => (
  <>
    <neu.Plate x={P} y={66} w={84} h={84} r={42} kind="convex" depth="md" />
    <neu.Icon x={P + 28} y={94} icon="temperature-half" size={28} color={t.accent} />
    <neu.Text x={P + 102} y={62} w={160} h={54} text="21.4°" fontSize={44} fontStyle="Demi Bold" />
    <neu.Text x={P + 104} y={116} w={160} h={22} text="Heating · eco" color={t.muted} fontSize={15} />
    {phone ? (
      <>
        <neu.Text x={P} y={178} w={120} h={60} text="Set to" color={t.sub} fontSize={16} fontStyle="Medium" />
        <neu.Stepper x={w - P - 200} y={172} w={200} join="home_set" value={22} min={16} max={28} step={0.5} decimals={1} unit="°" />
      </>
    ) : (
      <>
        <neu.Text x={w - P - 200} y={58} w={200} h={22} text="Set to" color={t.sub} fontSize={15} fontStyle="Medium" align="center" />
        <neu.Stepper x={w - P - 200} y={86} w={200} join="home_set" value={22} min={16} max={28} step={0.5} decimals={1} unit="°" />
      </>
    )}
    <neu.Segmented x={P} y={phone ? 256 : 170} w={w - 2 * P} h={42} options={['Low', 'Medium', 'High', 'Turbo']} join="home_fan" value={1} fontSize={14} />
  </>
);

/** music: a cover in a sunk well, the song, where it is, the transport */
const music = (w) => {
  const c = phone ? 104 : 136, tx = P + c + 26, tw = w - tx - P;
  const py = phone ? c + 84 : 124; // the progress: under the cover on a phone
  const px = phone ? P : tx, pw = phone ? w - 2 * P : tw;
  const mid = px + pw / 2;
  return (
    <>
      <neu.Plate x={P} y={64} w={c} h={c} r={c / 2} kind="inset" depth="md" />
      <neu.Plate x={P + c * 0.13} y={64 + c * 0.13} w={c * 0.74} h={c * 0.74} r={c * 0.37} kind="accent" depth="sm" />
      <neu.Icon x={P + c / 2 - 16} y={64 + c / 2 - 16} icon="music" size={32} color="#FFFFFF" />
      <neu.Text x={tx} y={phone ? 82 : 60} w={tw} h={30} text="Weightless" fontSize={22} fontStyle="Demi Bold" />
      <neu.Text x={tx} y={phone ? 112 : 90} w={tw} h={44} text="Marconi Union · Ambient Transmissions" wrap valign="top" color={t.muted} fontSize={15} />
      <neu.Progress x={px} y={py} w={pw} join="home_song" value={42} showValue={false} />
      <neu.Text x={px} y={py + 22} w={50} h={20} text="1:42" color={t.muted} fontSize={13} fontStyle="Medium" />
      <neu.Text x={px + pw - 50} y={py + 22} w={50} h={20} text="4:05" align="right" color={t.muted} fontSize={13} fontStyle="Medium" />
      <neu.RoundButton x={Math.round(mid - 30 - 30 - 48)} y={py + 26} size={48} icon="backward-step" kind="flat" depth="sm" color={t.sub} />
      <neu.RoundButton x={Math.round(mid - 30)} y={py + 20} size={60} icon="play" iconOn="pause" kind="accent" toggle join="home_play" value />
      <neu.RoundButton x={Math.round(mid + 30 + 30)} y={py + 26} size={48} icon="forward-step" kind="flat" depth="sm" color={t.sub} />
    </>
  );
};

export default (
  <Page name="Home" bg={t.base} transition={fade}>
    {phone ? (
      <Stack page="Home" items={[
        { h: 48, el: (x, y, w) => <neu.Segmented x={x} y={y} w={w} h={48} options={['Living', 'Kitchen', 'Bed', 'Office']} join="room" fontSize={15} /> },
        { h: 34, el: (x, y) => <><neu.Chip x={x} y={y} text="22.5° inside" dot={t.warn} /><neu.Chip x={x + 148} y={y} text="2 on" dot={t.ok} /></> },
        { h: 2 * 140 + 18, el: (x, y, w) => deviceTiles(x, y, w, 140, 18) },
        { title: 'Lighting', h: lightingH(CW), body: lighting(CW) },
        { title: 'Climate', h: 324, body: climate(CW) },
        { title: 'Now playing', h: 104 + 84 + 26 + 60 + 22, body: music(CW) },
      ]} />
    ) : (
      <>
        {/* the room shown, and how it is */}
        <neu.Segmented x={136} y={116} w={560} h={52} options={['Living room', 'Kitchen', 'Bedroom', 'Office']} join="room" />
        <neu.Chip x={940} y={125} text="22.5° inside" dot={t.warn} />
        <neu.Chip x={1090} y={125} text="2 devices on" dot={t.ok} />
        {deviceTiles(136, 200, 544)}
        <neu.Card title="Lighting" x={704} y={200} w={552} h={324}>{lighting(552)}</neu.Card>
        <neu.Card title="Climate" x={136} y={548} w={544} h={228}>{climate(544)}</neu.Card>
        <neu.Card title="Now playing" x={704} y={548} w={552} h={228}>{music(552)}</neu.Card>
      </>
    )}
    <Shell page="Home" title="Smart home" sub="Tiles sink in when on; scenes, light, climate and music" />
  </Page>
);
