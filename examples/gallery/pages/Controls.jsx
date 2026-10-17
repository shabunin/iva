import { ui, t, narrow } from '../ui.js';
import Shell, { enter } from '../components/Shell.jsx';

const L = ui.grid({
  toggle: [392, 260],
  slider: [408, 260],
  stepper: [416, 260],
  // narrow: the two one under the other
  segmented: [1248, (w) => (w < 900 ? 280 : 170)],
  scenes: [1248, 184],
}, [['toggle', 'slider', 'stepper'], ['segmented'], ['scenes']]);

const note = (c, x, y, text) => <Text x={x} y={y} w={Math.min(500, c.w - x - 28)} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
const stacked = L.segmented.w < 900;
const scenes = [
  { icon: 'sun', title: 'Morning' },
  { icon: 'moon', title: 'Evening' },
  { icon: 'film', title: 'Movie' },
  { icon: 'music', title: 'Party' },
  { icon: 'right-from-bracket', title: 'Away' },
];

export default (
  <Page name="Controls" bg={t.page} transition={enter}>
    <ui.ScrollArea>
      <ui.Card title="Toggle" {...L.toggle}>
        <ui.Toggle x={28} y={64} label="Light" join="light" />
        <ui.Toggle x={28} y={128} label="Fan" join="fan" />
      </ui.Card>

      <ui.Card title="Slider" {...L.slider}>
        <ui.Slider x={28} y={64} w={L.slider.w - 56} label="with a label and a value" join="level" value={60} />
        <ui.Slider x={28} y={160} w={L.slider.w - 56} label="plain" join="plain" showValue={false} value={40} />
      </ui.Card>

      <ui.Card title="Stepper" {...L.stepper}>
        {note(L.stepper, 28, 56, '16-30, step 0.5, one decimal')}
        <ui.Stepper x={28} y={86} w={L.stepper.w - 56} join="setpoint" value={21.5} min={16} max={30} step={0.5} decimals={1} unit="°C" />
        {note(L.stepper, 28, 160, '0-10, whole steps')}
        <ui.Stepper x={28} y={190} w={200} h={48} join="count" value={3} max={10} />
      </ui.Card>

      <ui.Card title="Segmented" {...L.segmented}>
        {note(L.segmented, 28, 56, '3 options')}
        <ui.Segmented x={28} y={88} w={Math.min(360, L.segmented.w - 56)} options={['Heat', 'Cool', 'Auto']} join="mode" />
        {note(L.segmented, stacked ? 28 : 424, stacked ? 152 : 56, '4 options, wider')}
        <ui.Segmented x={stacked ? 28 : 424} y={stacked ? 184 : 88} w={Math.min(480, L.segmented.w - 56)} options={['Off', 'Low', 'Mid', 'High']} join="fanSpeed" value={1} />
      </ui.Card>

      <ui.Card title="SceneBar" {...L.scenes}>
        {/* a phone: three, each wide enough for its name */}
        <ui.SceneBar x={28} y={60} w={L.scenes.w - 56} join="scene" value={1} scenes={narrow ? scenes.slice(0, 3) : scenes} />
      </ui.Card>
    </ui.ScrollArea>
    <OnStart js={'CF.setJoin(Joins.d.light, 1);'} />
    <Shell section="Controls" />
  </Page>
);
