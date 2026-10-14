import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, text) => <Text x={x} y={y} w={360} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
const rooms = ['Kitchen', 'Living room', 'Bedroom'];

/** a line of the joins card: a join's value, live */
const shows = (y, label, join, type) => {
  const text = s(`demo_${join}_shown`);
  return (
    <>
      <Text x={28} y={y} w={300} h={36} text={label} font={t.font} fontSize={19} />
      <Text x={330} y={y} w={120} h={36} join={text} color={t.accent} font={t.font} fontSize={19} />
      <OnStart js={`IvaUI.value(Joins.${type}[${JSON.stringify(join)}], Joins.s[${JSON.stringify(`demo_${join}_shown`)}], '', 0, 0, 65535);`} joins={[text]} />
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

    <ui.Card title="CheckBox · CheckBoxGroup" x={848} y={88} w={416} h={420}>
      {note(28, 52, 'one CheckBox')}
      <ui.CheckBox x={28} y={80} w={360} label="Send notifications" join="notify" value />
      {note(28, 150, 'a group: a join per box')}
      <ui.CheckBoxGroup x={28} y={178} w={360} options={[
        { label: 'Kitchen', join: 'kitchen', value: true },
        { label: 'Living room', join: 'living' },
        { label: 'Bedroom', join: 'bedroom', value: true },
      ]} />
    </ui.Card>

    <ui.Card title="The joins they set" x={16} y={354} w={816} h={410}>
      {shows(56, 'room (RadioGroup, dropdown)', 'room', 'a')}
      {shows(96, 'fan (the sheet)', 'fan', 'a')}
      {shows(136, 'notify', 'notify', 'd')}
      {shows(176, 'kitchen', 'kitchen', 'd')}
      {shows(216, 'living', 'living', 'd')}
      {shows(256, 'bedroom', 'bedroom', 'd')}
      {note(28, 320, 'one-of-several: the index in an analog join;')}
      {note(28, 344, 'check boxes: a digital join each')}
    </ui.Card>
    <Shell section="Forms" />
  </Page>
);
