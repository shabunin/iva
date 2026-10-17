import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

const L = ui.grid({
  knob: [608, 440],
  thermostat: [624, 440],
}, [['knob', 'thermostat']]);

const note = (x, y, text) => <Text x={x} y={y} w={340} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
const A = ui.screenArea;

// a phone: a screen each - a gesture in a list (a ScrollArea) doesn't fire on the device
export default narrow ? (
  <ui.Screens name="Dials" transition={enter} tabTransition={tab} shell={<Shell section="Dials" />} screens={[
    {
      title: 'Knob',
      content: (
        <ui.Card {...A}>
          {note(24, 16, "GUI Designer's Dial demo: touch or drag the knob")}
          <ui.Knob x={24} y={56} size={170} join="volume" value={40} label="Volume" />
          <ui.Knob x={A.w - 164} y={72} size={140} join="bass" value={2} min={-10} max={10} step={1} unit="dB" label="Bass" color="#3a4048" pointer={t.warning} />
        </ui.Card>
      ),
    },
    {
      title: 'Thermostat',
      content: (
        <ui.Card {...A}>
          {note(24, 16, 'setpoint + room temperature, - and +')}
          <ui.Thermostat x={Math.round((A.w - 190) / 2)} y={40} size={190} setpoint="setpoint" value={21.5} current="21.2°" />
        </ui.Card>
      ),
    },
    {
      title: 'Modes',
      content: (
        <ui.Card {...A}>
          {note(24, 16, 'with modes')}
          <ui.Thermostat x={Math.round((A.w - 150) / 2)} y={40} size={150} setpoint="setpoint2" value={22} current="21.2°" modes={['Heat', 'Cool', 'Auto']} mode="tmode" modeValue={2} />
        </ui.Card>
      ),
    },
  ]} />
) : (
  <Page name="Dials" bg={t.page} transition={enter}>
    <ui.Card title="Knob" {...L.knob}>
      {note(28, 52, "GUI Designer's Dial demo, as a component: touch or drag the knob")}
      <ui.Knob x={40} y={84} size={196} join="volume" value={40} label="Volume" />
      <ui.Knob x={330} y={104} size={150} join="bass" value={2} min={-10} max={10} step={1} unit="dB" label="Bass" color="#3a4048" pointer={t.warning} />
      {note(28, 380, 'size, colour, pointer, step and unit')}
    </ui.Card>

    <ui.Card title="Thermostat" {...L.thermostat}>
      {note(28, 52, 'setpoint + room temperature, - and +')}
      <ui.Thermostat x={40} y={84} size={200} setpoint="setpoint" value={21.5} current="21.2°" />
      {note(340, 52, 'with modes')}
      <ui.Thermostat x={340} y={84} size={200} setpoint="setpoint2" value={22} current="21.2°" modes={['Heat', 'Cool', 'Auto']} mode="tmode" modeValue={2} />
    </ui.Card>
    <Shell section="Dials" />
  </Page>
);
