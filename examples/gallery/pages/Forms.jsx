import { ui, t, narrow } from '../ui.js';
import Shell, { enter } from '../components/Shell.jsx';

const rooms = ['Kitchen', 'Living room', 'Bedroom'];
const cities = ['Amsterdam', 'Athens', 'Barcelona', 'Berlin', 'Bern', 'Brussels', 'Budapest', 'Copenhagen', 'Dublin', 'Helsinki', 'Lisbon', 'London',
  'Madrid', 'Milan', 'Oslo', 'Paris', 'Prague', 'Riga', 'Rome', 'Stockholm', 'Tallinn', 'Vienna', 'Vilnius', 'Warsaw', 'Zurich'];
// what a driver or a feedback would put in the serial join
const devices = ['Hallway lamp', 'Kitchen dimmer', 'Living room TV', 'Bedroom blinds', 'Garage door', 'Garden lights', 'Boiler', 'Doorbell camera'];

const L = ui.grid({
  radio: [392, 250], select: [408, 250], search: [416, 250],
  checks: [392, 410], joins: [408, 410], text: [416, 410],
}, [['radio', 'select', 'search'], ['checks', 'joins', 'text']]);

const note = (x, y, text) => <Text x={x} y={y} w={360} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
// a phone: what drops down opens as a sheet (the page scrolls; a sheet stays put)
const drop = narrow ? 'sheet' : 'dropdown';

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
  <Page name="Forms" bg={t.page} transition={enter}>
    <ui.ScrollArea>
      <ui.Card title="RadioGroup" {...L.radio}>
        <ui.RadioGroup x={28} y={60} w={L.radio.w - 52} options={rooms} join="room" value={1} />
      </ui.Card>

      <ui.Card title="SelectBox" {...L.select}>
        {note(28, 52, 'as a sheet')}
        <ui.SelectBox x={28} y={80} w={L.select.w - 56} options={['Auto', 'Low', 'Medium', 'High']} join="fan" title="Fan speed" />
        {note(28, 146, narrow ? 'another, the rooms' : 'as a dropdown under the field')}
        <ui.SelectBox x={28} y={174} w={L.select.w - 56} options={rooms} join="room" value={1} mode={drop} title="Room" />
      </ui.Card>

      <ui.Card title="SearchSelect" {...L.search}>
        {note(28, 52, 'sheet, fixed options - type to filter')}
        <ui.SearchSelect x={28} y={80} w={L.search.w - 56} title="City" options={cities} join="city" value={3} />
        {note(28, 146, narrow ? 'options from a serial join (JSON)' : 'dropdown, options from a serial join (JSON)')}
        <ui.SearchSelect x={28} y={174} w={L.search.w - 56} mode={drop} title="Device" source="devices" join="device" placeholder="Pick a device" />
        <OnStart js={`CF.setJoin(Joins.s.devices, ${JSON.stringify(JSON.stringify(devices))});`} joins={[s('devices')]} />
      </ui.Card>

      <ui.Card title="CheckBox · CheckBoxGroup" {...L.checks}>
        {note(28, 52, 'one CheckBox')}
        <ui.CheckBox x={28} y={80} w={L.checks.w - 52} label="Send notifications" join="notify" value />
        {note(28, 150, 'a group: a join per box')}
        <ui.CheckBoxGroup x={28} y={178} w={L.checks.w - 52} options={[
          { label: 'Kitchen', join: 'kitchen', value: true },
          { label: 'Living room', join: 'living' },
          { label: 'Bedroom', join: 'bedroom', value: true },
        ]} />
      </ui.Card>

      <ui.Card title="The joins they set" {...L.joins}>
        {[['room', 'a'], ['fan', 'a'], ['city', 'a'], ['device', 'a'], ['notify', 'd'], ['kitchen', 'd'], ['living', 'd'], ['bedroom', 'd'], ['name', 's']]
          .map(([join, type], i) => shows(50 + i * 32, join, type))}
        {note(28, 352, 'an index (analog), on / off (digital), text (serial)')}
      </ui.Card>

      <ui.Card title="TextField" {...L.text}>
        <ui.TextField x={28} y={56} w={L.text.w - 56} label="Name" join="name" placeholder="Your name" icon="user" />
        <ui.TextField x={28} y={160} w={L.text.w - 56} label="Password" join="secret" placeholder="At least 8 characters" icon="lock" password />
        {note(28, 264, 'the text in a serial join, as you type')}
      </ui.Card>
    </ui.ScrollArea>
    <Shell section="Forms" />
  </Page>
);
