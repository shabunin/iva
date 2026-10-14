import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (y, text) => <Text x={28} y={y} w={540} h={26} text={text} color={t.muted} font={t.font} fontSize={16} />;

export default (
  <Page name="Buttons" bg={t.page}>
    <ui.Card title="IconButton" x={16} y={88} w={612} h={300}>
      {note(56, 'icon + text · icon only · text only')}
      <ui.IconButton x={28} y={90} w={160} icon="play" text="Play" />
      <ui.IconButton x={204} y={90} icon="gear" />
      <ui.IconButton x={284} y={90} w={150} text="Text only" />
      {note(170, 'tones: accent, danger, flat')}
      <ui.IconButton x={28} y={204} w={160} icon="check" text="Accent" tone="accent" />
      <ui.IconButton x={204} y={204} w={160} icon="trash" text="Delete" tone="danger" />
      <ui.IconButton x={380} y={204} w={140} icon="star" text="Flat" tone="flat" />
    </ui.Card>

    <ui.Card title="Tile" x={652} y={88} w={612} h={300}>
      <ui.Tile x={28} y={64} icon="utensils" title="Kitchen" status="3 lights" join="kitchen" />
      <ui.Tile x={216} y={64} icon="tv" title="Living room" status="On / off" join="living" />
      <ui.Tile x={404} y={64} icon="bed" title="Bedroom" status="22.4 °C" join="bedroom" />
    </ui.Card>

    <ui.Card title="Badge" x={16} y={404} w={612} h={300}>
      {note(56, 'tones · with a dot')}
      <ui.Badge x={28} y={92} text="New" />
      <ui.Badge x={100} y={92} text="Alarm" tone="danger" />
      <ui.Badge x={184} y={92} text="Idle" tone="muted" />
      <ui.Badge x={256} y={92} text="Online" dot />
      <ui.Badge x={360} y={92} text="Custom" tone="warning" />
      {note(150, 'bound to a join: on / off')}
      <ui.Badge x={28} y={194} join="online" on="Online" off="Offline" dot />
      <ui.Toggle x={160} y={184} w={420} label="Connected" join="online" />
    </ui.Card>

    <ui.Card title="Stat & Icon" x={652} y={404} w={612} h={300}>
      <ui.Stat x={28} y={64} icon="temperature-half" value="22.4 °C" label="Inside" />
      <ui.Stat x={320} y={64} icon="droplet" value="46 %" label="Humidity" />
      {note(186, 'Icon: any Font Awesome (free) name, size and colour')}
      {['house', 'lightbulb', 'temperature-half', 'lock', 'video', 'music', 'bell', 'wifi'].map((icon, i) => (
        <ui.Icon x={28 + i * 68} y={226} icon={icon} size={20 + (i % 4) * 6} color={i % 3 ? t.accent : t.text} />
      ))}
    </ui.Card>
    <Shell section="Buttons & status" />
  </Page>
);
