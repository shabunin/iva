import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (y, text) => <Text x={28} y={y} w={360} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

/** a line of the joins card: a join's value, live (analog: min..max as 0..65535) */
const shows = (y, label, join, max = 65535) => {
  const text = s(`demo_${join}_shown`);
  return (
    <>
      <Text x={28} y={y} w={220} h={30} text={label} font={t.font} fontSize={18} />
      <Text x={250} y={y} w={140} h={30} join={text} color={t.accent} font={t.font} fontSize={18} />
      <OnStart js={`IvaUI.value(Joins.a[${JSON.stringify(join)}], Joins.s[${JSON.stringify(`demo_${join}_shown`)}], '', 0, 0, ${max});`} joins={[text]} />
    </>
  );
};

export default (
  <Page name="Pickers" bg={t.page}>
    <ui.Card title="TimePicker" x={16} y={88} w={400} h={344}>
      {note(52, '24 h')}
      <ui.TimePicker x={28} y={80} w={344} title="Wake up" hour="wakeH" minute="wakeM" value="07:30" />
      {note(148, '12 h, 5-minute steps, a Now button')}
      <ui.TimePicker x={28} y={176} w={344} title="Sleep" hour="sleepH" minute="sleepM" value="22:45" ampm minuteStep={5} now="Now" />
      {note(244, 'dropdown under the field')}
      <ui.TimePicker x={28} y={272} w={344} hour="startH" minute="startM" value="18:00" mode="dropdown" />
    </ui.Card>

    <ui.Card title="DatePicker" x={432} y={88} w={400} h={344}>
      {note(52, 'DD.MM.YYYY, a Today button')}
      <ui.DatePicker x={28} y={80} w={344} title="Due date" day="dueD" month="dueM" year="dueY" value="2026-10-08" />
      {note(148, 'order="mdy", format="MMM D, YYYY"')}
      <ui.DatePicker x={28} y={176} w={344} title="Party" day="partyD" month="partyM" year="partyY" order="mdy" format="MMM D, YYYY" />
      {note(244, '"ymd", "YYYY-MM-DD", 2020-2030, dropdown')}
      <ui.DatePicker x={28} y={272} w={344} day="sinceD" month="sinceM" year="sinceY" value="2024-03-01" order="ymd" format="YYYY-MM-DD"
                     minYear={2020} maxYear={2030} today={false} mode="dropdown" />
    </ui.Card>

    <ui.Card title="NumberField" x={848} y={88} w={416} h={344}>
      {note(52, '0-99, two digits, dropdown')}
      <ui.NumberField x={28} y={80} w={360} join="count" value={7} max={99} digits={2} mode="dropdown" />
      {note(148, '0-100, whole numbers')}
      <ui.NumberField x={28} y={176} w={360} title="Volume" join="percent" value={42} unit="%" />
      {note(244, '-10 to 40, one decimal, in °C')}
      <ui.NumberField x={28} y={272} w={360} title="Target temperature" join="target" value={21.5} min={-10} max={40} decimals={1} unit={'°C'} />
    </ui.Card>

    <ui.Card title="Bigger fields (fontSize, showIcon)" x={16} y={448} w={816} h={180}>
      <ui.TimePicker x={28} y={72} w={200} h={72} hour="wakeH" minute="wakeM" fontSize={36} showIcon={false} />
      <ui.DatePicker x={248} y={72} w={380} h={72} day="dueD" month="dueM" year="dueY" format="D MMMM YYYY" fontSize={28} />
    </ui.Card>

    <ui.Card title="The joins they set" x={848} y={448} w={416} h={316}>
      {shows(52, 'wakeH · wakeM', 'wakeH')}
      {shows(82, '', 'wakeM')}
      {shows(116, 'dueD · dueM · dueY', 'dueD')}
      {shows(146, '', 'dueM')}
      {shows(176, '', 'dueY')}
      {shows(210, 'percent (0..100)', 'percent', 100)}
      {note(256, 'times, dates: numbers; numbers: 0..65535')}
    </ui.Card>
    <Shell section="Pickers" />
  </Page>
);
