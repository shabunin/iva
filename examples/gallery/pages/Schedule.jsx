import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const note = (x, y, text) => <Text x={x} y={y} w={560} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;

export default (
  <Page name="Schedule" bg={t.page}>
    <ui.Card title="WeekDays" x={16} y={88} w={620} h={240}>
      {note(28, 52, 'Monday first - the join is a bitmask: Mon 1, Tue 2 ... Sun 64')}
      <ui.WeekDays x={28} y={84} join="days" value={31} textJoin={s('daysText')} />
      <Text x={440} y={84} w={152} h={48} join={s('daysText')} align="right" color={t.muted} font={t.font} fontSize={19} />
      {note(28, 148, 'Sunday first, smaller, other labels')}
      <ui.WeekDays x={28} y={178} join="days2" value={65} first="sun" size={40} labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']} textJoin={s('days2Text')} />
      <Text x={440} y={178} w={152} h={40} join={s('days2Text')} align="right" color={t.muted} font={t.font} fontSize={19} />
    </ui.Card>

    <ui.AlarmCard x={16} y={344} w={620} title="Wake up" on="wakeOn" onValue time="wake" value="06:45" days="wakeDays" daysValue={31} />
    <ui.AlarmCard x={16} y={570} w={620} title="Weekend (12 h, 15-minute steps)" on="weekendOn" time="weekend" value="09:00" ampm days="weekendDays" daysValue={96} />

    <ui.Card title="PinPad" x={652} y={88} w={612} h={560}>
      <ui.PinPad x={28} y={64} code={s('code')} onEnter="CF.setJoin(Joins.s.entered, 'Code entered: ' + code.length + ' digits');" />
      <Text x={300} y={64} w={290} h={28} text="OK writes the code (a string)" color={t.muted} font={t.font} fontSize={16} />
      <Box x={300} y={100} w={284} h={44} bg={t.raised} radius={12} />
      <Text x={312} y={100} w={260} h={44} join={s('code')} font={t.font} fontSize={19} />
      <Text x={300} y={160} w={290} h={28} text="then runs onEnter:" color={t.muted} font={t.font} fontSize={16} />
      <Text x={300} y={190} w={290} h={28} join={s('entered')} color={t.accent} font={t.font} fontSize={16} />
      <Text x={300} y={232} w={290} h={28} text="hold ← to clear" color={t.muted} font={t.font} fontSize={16} />
    </ui.Card>
    <Shell section="Schedule & security" />
  </Page>
);
