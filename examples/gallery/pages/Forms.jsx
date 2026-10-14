import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, text) => <Text x={x} y={y} w={360} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
const rooms = ['Kitchen', 'Living room', 'Bedroom'];
const cities = ['Amsterdam', 'Athens', 'Barcelona', 'Berlin', 'Bern', 'Brussels', 'Budapest', 'Copenhagen', 'Dublin', 'Helsinki', 'Lisbon', 'London',
  'Madrid', 'Milan', 'Oslo', 'Paris', 'Prague', 'Riga', 'Rome', 'Stockholm', 'Tallinn', 'Vienna', 'Vilnius', 'Warsaw', 'Zurich'];
// what a driver or a feedback would put in the serial join
const devices = ['Hallway lamp', 'Kitchen dimmer', 'Living room TV', 'Bedroom blinds', 'Garage door', 'Garden lights', 'Boiler', 'Doorbell camera'];

/** a line of the joins card: a join's value, live */
const shows = (y, join, type) => {
  const text = type === 's' ? s(join) : s(`demo_${join}_shown`);
  return (
    <>
      <Text x={28} y={y} w={180} h={30} text={join} font={t.font} fontSize={18} />
      <Text x={208} y={y} w={180} h={30} join={text} color={t.accent} font={t.font} fontSize={18} />
      {type !== 's' && (
        <OnStart js={`IvaUI.value(Joins.${type}[${JSON.stringify(join)}], Joins.s[${JSON.stringify(`demo_${join}_shown`)}], '', 0, 0, 65535);`} joins={[text]} />
      )}
    </>
  );
};

export default (
  <Page name="Forms" bg={t.page}>
    <ui.Card title="RadioGroup" x={16} y={88} w={392} h={250}>
      <ui.RadioGroup x={28} y={60} w={340} options={rooms} join="room" value={1} />
    </ui.Card>

    <ui.Card title="SelectBox" x={424} y={88} w={408} h={250}>
      {note(28, 52, 'as a sheet')}
      <ui.SelectBox x={28} y={80} w={352} options={['Auto', 'Low', 'Medium', 'High']} join="fan" title="Fan speed" />
      {note(28, 146, 'as a dropdown under the field')}
      <ui.SelectBox x={28} y={174} w={352} options={rooms} join="room" value={1} mode="dropdown" />
    </ui.Card>

    <ui.Card title="SearchSelect" x={848} y={88} w={416} h={250}>
      {note(28, 52, 'sheet, fixed options - type to filter')}
      <ui.SearchSelect x={28} y={80} w={360} title="City" options={cities} join="city" value={3} />
      {note(28, 146, 'dropdown, options from a serial join (JSON)')}
      <ui.SearchSelect x={28} y={174} w={360} mode="dropdown" source="devices" join="device" placeholder="Pick a device" />
      <OnStart js={`CF.setJoin(Joins.s.devices, ${JSON.stringify(JSON.stringify(devices))});`} joins={[s('devices')]} />
    </ui.Card>

    <ui.Card title="CheckBox · CheckBoxGroup" x={16} y={354} w={392} h={410}>
      {note(28, 52, 'one CheckBox')}
      <ui.CheckBox x={28} y={80} w={340} label="Send notifications" join="notify" value />
      {note(28, 150, 'a group: a join per box')}
      <ui.CheckBoxGroup x={28} y={178} w={340} options={[
        { label: 'Kitchen', join: 'kitchen', value: true },
        { label: 'Living room', join: 'living' },
        { label: 'Bedroom', join: 'bedroom', value: true },
      ]} />
    </ui.Card>

    <ui.Card title="The joins they set" x={424} y={354} w={408} h={410}>
      {[['room', 'a'], ['fan', 'a'], ['city', 'a'], ['device', 'a'], ['notify', 'd'], ['kitchen', 'd'], ['living', 'd'], ['bedroom', 'd'], ['name', 's']]
        .map(([join, type], i) => shows(50 + i * 32, join, type))}
      {note(28, 352, 'an index (analog), on / off (digital), text (serial)')}
    </ui.Card>

    <ui.Card title="TextField" x={848} y={354} w={416} h={410}>
      <ui.TextField x={28} y={56} w={360} label="Name" join="name" placeholder="Your name" icon="user" />
      <ui.TextField x={28} y={160} w={360} label="Password" join="secret" placeholder="At least 8 characters" icon="lock" password />
      {note(28, 264, 'the text in a serial join, as you type')}
    </ui.Card>
    <Shell section="Forms" />
  </Page>
);
