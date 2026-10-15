import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

// laid out at 1280x800; a bigger panel: the cards grow, their content in the middle; a narrow one: one under
// another, laid out again where they need to be (a height for the width)
const L = ui.grid({
  buttons: [612, (w) => (w < 560 ? 372 : 300)],
  tiles: [612, (w) => (w < 612 ? 468 : 300)],
  badges: [612, (w) => (w < 560 ? 340 : 300)],
  stats: [612, (w) => (w < 612 ? 410 : 300)],
}, [['buttons', 'tiles'], ['badges', 'stats']]);

const note = (c, y, text) => <Text x={28} y={y} w={c.w - 56} h={26} text={text} color={t.muted} font={t.font} fontSize={16} />;
const tileCols = L.tiles.w < 612 ? 2 : 3;
const tilePitch = tileCols === 3 ? 188 : 196;
const badgesWrap = L.badges.w < 560;
const statsWrap = L.stats.w < 612;
const iconGap = Math.min(68, Math.floor((L.stats.w - 56 - 38) / 7));

export default (
  <Page name="Buttons" bg={t.page}>
    <ui.ScrollArea>
      <ui.Card title="IconButton" {...L.buttons}>
        {note(L.buttons, 56, 'icon + text · icon only · text only')}
        <ui.IconButton x={28} y={90} w={160} icon="play" text="Play" />
        <ui.IconButton x={204} y={90} icon="gear" />
        <ui.IconButton x={284} y={90} w={Math.min(150, L.buttons.w - 312)} text="Text only" />
        {note(L.buttons, 170, 'tones: accent, danger, flat')}
        <ui.IconButton x={28} y={204} w={160} icon="check" text="Accent" tone="accent" />
        <ui.IconButton x={204} y={204} w={160} icon="trash" text="Delete" tone="danger" />
        <ui.IconButton x={L.buttons.w < 560 ? 28 : 380} y={L.buttons.w < 560 ? 276 : 204} w={140} icon="star" text="Flat" tone="flat" />
      </ui.Card>

      <ui.Card title="Tile" {...L.tiles}>
        {[['utensils', 'Kitchen', '3 lights', 'kitchen'], ['tv', 'Living room', 'On / off', 'living'], ['bed', 'Bedroom', '22.4 °C', 'bedroom']].map(([icon, title, status, join], i) => (
          <ui.Tile x={28 + (i % tileCols) * tilePitch} y={64 + Math.floor(i / tileCols) * 196} w={180} h={180} icon={icon} title={title} status={status} join={join} />
        ))}
      </ui.Card>

      <ui.Card title="Badge" {...L.badges}>
        {note(L.badges, 56, 'tones · with a dot')}
        <ui.Badge x={28} y={92} text="New" />
        <ui.Badge x={100} y={92} text="Alarm" tone="danger" />
        <ui.Badge x={184} y={92} text="Idle" tone="muted" />
        <ui.Badge x={256} y={92} text="Online" dot />
        <ui.Badge x={badgesWrap ? 28 : 360} y={badgesWrap ? 132 : 92} text="Custom" tone="warning" />
        {note(L.badges, badgesWrap ? 190 : 150, 'bound to a join: on / off')}
        <ui.Badge x={28} y={badgesWrap ? 234 : 194} join="online" on="Online" off="Offline" dot />
        <ui.Toggle x={160} y={badgesWrap ? 224 : 184} w={L.badges.w - 188} label="Connected" join="online" />
      </ui.Card>

      <ui.Card title="Stat & Icon" {...L.stats}>
        <ui.Stat x={28} y={64} icon="temperature-half" value="22.4 °C" label="Inside" />
        <ui.Stat x={statsWrap ? 28 : 320} y={statsWrap ? 172 : 64} icon="droplet" value="46 %" label="Humidity" />
        {note(L.stats, statsWrap ? 290 : 186, 'Icon: any Font Awesome (free) name, size and colour')}
        {['house', 'lightbulb', 'temperature-half', 'lock', 'video', 'music', 'bell', 'wifi'].map((icon, i) => (
          <ui.Icon x={28 + i * iconGap} y={statsWrap ? 330 : 226} icon={icon} size={20 + (i % 4) * 6} color={i % 3 ? t.accent : t.text} />
        ))}
      </ui.Card>
    </ui.ScrollArea>
    <Shell section="Buttons & status" />
  </Page>
);
