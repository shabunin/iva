import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, text) => <Text x={x} y={y} w={340} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

export default (
  <Page name="Dials" bg={t.page}>
    <ui.Card title="Dial" x={16} y={88} w={608} h={360}>
      {note(28, 52, 'touch or drag the ring')}
      <ui.Dial x={28} y={92} size={240} join="level" value={65} label="Level" />
      <ui.Dial x={316} y={60} size={130} join="amber" value={65} unit="" color={t.warning} />
      <ui.Dial x={316} y={206} size={130} join="white" value={65} unit="" color="#FFFFFF" thickness={5} />
      {note(460, 120, 'size, colour,')}
      {note(460, 146, 'thickness')}
    </ui.Card>

    <ui.Card title="Knob" x={640} y={88} w={624} h={360}>
      {note(28, 52, "GUI Designer's Dial demo, as a component")}
      <ui.Knob x={40} y={84} size={196} join="volume" value={40} label="Volume" />
      <ui.Knob x={330} y={104} size={150} join="bass" value={2} min={-10} max={10} step={1} unit="dB" label="Bass" color="#3a4048" pointer={t.warning} />
    </ui.Card>

    <ui.Card title="Thermostat" x={16} y={464} w={1248} h={320}>
      {note(28, 52, 'setpoint + room temperature, - and +')}
      <ui.Thermostat x={60} y={84} size={220} setpoint="setpoint" value={21.5} current="21.2°" />
      {note(420, 52, 'with modes')}
      <ui.Thermostat x={460} y={80} size={170} setpoint="setpoint2" value={22} current="21.2°" modes={['Heat', 'Cool', 'Auto']} mode="tmode" modeValue={2} />
    </ui.Card>
    <Shell section="Dials" />
  </Page>
);
