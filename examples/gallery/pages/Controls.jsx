import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, text) => <Text x={x} y={y} w={500} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

export default (
  <Page name="Controls" bg={t.page}>
    <ui.Card title="Toggle" x={16} y={88} w={392} h={260}>
      <ui.Toggle x={28} y={64} label="Light" join="light" />
      <ui.Toggle x={28} y={128} label="Fan" join="fan" />
    </ui.Card>

    <ui.Card title="Slider" x={424} y={88} w={408} h={260}>
      <ui.Slider x={28} y={64} w={352} label="with a label and a value" join="level" value={60} />
      <ui.Slider x={28} y={160} w={352} label="plain" join="plain" showValue={false} value={40} />
    </ui.Card>

    <ui.Card title="Stepper" x={848} y={88} w={416} h={260}>
      {note(28, 56, '16-30, step 0.5, one decimal')}
      <ui.Stepper x={28} y={86} w={360} join="setpoint" value={21.5} min={16} max={30} step={0.5} decimals={1} unit="°C" />
      {note(28, 160, '0-10, whole steps')}
      <ui.Stepper x={28} y={190} w={200} h={48} join="count" value={3} max={10} />
    </ui.Card>

    <ui.Card title="Segmented" x={16} y={364} w={1248} h={170}>
      {note(28, 56, '3 options')}
      <ui.Segmented x={28} y={88} w={360} options={['Heat', 'Cool', 'Auto']} join="mode" />
      {note(424, 56, '4 options, wider')}
      <ui.Segmented x={424} y={88} w={480} options={['Off', 'Low', 'Mid', 'High']} join="fanSpeed" value={1} />
    </ui.Card>

    <ui.Card title="SceneBar" x={16} y={550} w={1248} h={210}>
      <ui.SceneBar x={28} y={60} w={1192} join="scene" value={1}
                   scenes={[
                     { icon: 'sun', title: 'Morning' },
                     { icon: 'moon', title: 'Evening' },
                     { icon: 'film', title: 'Movie' },
                     { icon: 'music', title: 'Party' },
                     { icon: 'right-from-bracket', title: 'Away' },
                   ]} />
    </ui.Card>
    <OnStart js={'CF.setJoin(Joins.d.light, 1);'} />
    <Shell section="Controls" />
  </Page>
);
