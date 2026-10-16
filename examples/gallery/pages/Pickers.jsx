import { ui, t, narrow } from '../ui.js';
import Shell, { enter } from '../components/Shell.jsx';

const L = ui.grid({
  time: [400, 344], date: [400, 344], number: [416, 344],
  // narrow: the two fields one under the other
  bigger: [816, (w) => (w < 640 ? 260 : 180)],
  joins: [416, 316],
}, [['time', 'date', 'number'], ['bigger', 'joins']]);

const note = (y, text) => <Text x={28} y={y} w={360} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
// a phone: what drops down opens as a sheet (the page scrolls; a sheet stays put)
const drop = narrow ? 'sheet' : 'dropdown';
const stacked = L.bigger.w < 640;

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
  <Page name="Pickers" bg={t.page} transition={enter}>
    <ui.ScrollArea>
      <ui.Card title="TimePicker" {...L.time}>
        {note(52, '24 h')}
        <ui.TimePicker x={28} y={80} w={L.time.w - 56} title="Wake up" hour="wakeH" minute="wakeM" value="07:30" />
        {note(148, '12 h, 5-minute steps, a Now button')}
        <ui.TimePicker x={28} y={176} w={L.time.w - 56} title="Sleep" hour="sleepH" minute="sleepM" value="22:45" ampm minuteStep={5} now="Now" />
        {note(244, narrow ? 'another' : 'dropdown under the field')}
        <ui.TimePicker x={28} y={272} w={L.time.w - 56} title="Start" hour="startH" minute="startM" value="18:00" mode={drop} />
      </ui.Card>

      <ui.Card title="DatePicker" {...L.date}>
        {note(52, 'DD.MM.YYYY, a Today button')}
        <ui.DatePicker x={28} y={80} w={L.date.w - 56} title="Due date" day="dueD" month="dueM" year="dueY" value="2026-10-08" />
        {note(148, 'order="mdy", format="MMM D, YYYY"')}
        <ui.DatePicker x={28} y={176} w={L.date.w - 56} title="Party" day="partyD" month="partyM" year="partyY" order="mdy" format="MMM D, YYYY" />
        {note(244, narrow ? '"ymd", "YYYY-MM-DD", 2020-2030' : '"ymd", "YYYY-MM-DD", 2020-2030, dropdown')}
        <ui.DatePicker x={28} y={272} w={L.date.w - 56} title="Since" day="sinceD" month="sinceM" year="sinceY" value="2024-03-01" order="ymd" format="YYYY-MM-DD"
                       minYear={2020} maxYear={2030} today={false} mode={drop} />
      </ui.Card>

      <ui.Card title="NumberField" {...L.number}>
        {note(52, narrow ? '0-99, two digits' : '0-99, two digits, dropdown')}
        <ui.NumberField x={28} y={80} w={L.number.w - 56} title="Count" join="count" value={7} max={99} digits={2} mode={drop} />
        {note(148, '0-100, whole numbers')}
        <ui.NumberField x={28} y={176} w={L.number.w - 56} title="Volume" join="percent" value={42} unit="%" />
        {note(244, '-10 to 40, one decimal, in °C')}
        <ui.NumberField x={28} y={272} w={L.number.w - 56} title="Target temperature" join="target" value={21.5} min={-10} max={40} decimals={1} unit={'°C'} />
      </ui.Card>

      <ui.Card title="Bigger fields (fontSize, showIcon)" {...L.bigger}>
        <ui.TimePicker x={28} y={72} w={200} h={72} hour="wakeH" minute="wakeM" fontSize={36} showIcon={false} />
        <ui.DatePicker x={stacked ? 28 : 248} y={stacked ? 160 : 72} w={Math.min(380, L.bigger.w - 56)} h={72} day="dueD" month="dueM" year="dueY" format="D MMMM YYYY" fontSize={28} />
      </ui.Card>

      <ui.Card title="The joins they set" {...L.joins}>
        {shows(52, 'wakeH · wakeM', 'wakeH')}
        {shows(82, '', 'wakeM')}
        {shows(116, 'dueD · dueM · dueY', 'dueD')}
        {shows(146, '', 'dueM')}
        {shows(176, '', 'dueY')}
        {shows(210, 'percent (0..100)', 'percent', 100)}
        {note(256, 'times, dates: numbers; numbers: 0..65535')}
      </ui.Card>
    </ui.ScrollArea>
    <Shell section="Pickers" />
  </Page>
);
