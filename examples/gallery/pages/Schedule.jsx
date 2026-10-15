import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

const L = ui.grid({
  // narrow: the summaries under the days, the code's texts under the pad
  days: [620, (w) => (w < 600 ? 300 : 240)],
  wake: [620, 210],
  weekend: [620, 210],
  pin: [612, (w) => (w < 600 ? 720 : 560)],
}, [[['days', 'wake', 'weekend'], 'pin']]);

const note = (x, y, text) => <Text x={x} y={y} w={Math.min(560, L.days.w - 56)} h={24} text={text} color={t.muted} font={t.font} fontSize={16} />;
const daysWrap = L.days.w < 600;
const pinWrap = L.pin.w < 600;
const px = pinWrap ? 28 : 300;
const py = pinWrap ? 476 : 64;

export default (
  <Page name="Schedule" bg={t.page}>
    <ui.ScrollArea>
      <ui.Card title="WeekDays" {...L.days}>
        {note(28, 52, daysWrap ? 'Monday first - a bitmask: Mon 1 ... Sun 64' : 'Monday first - the join is a bitmask: Mon 1, Tue 2 ... Sun 64')}
        <ui.WeekDays x={28} y={84} join="days" value={31} size={daysWrap ? 44 : 48} textJoin={s('daysText')} />
        <Text x={daysWrap ? 28 : 440} y={daysWrap ? 134 : 84} w={152} h={daysWrap ? 28 : 48} join={s('daysText')} align={daysWrap ? 'left' : 'right'} color={t.muted} font={t.font} fontSize={19} />
        {note(28, daysWrap ? 174 : 148, 'Sunday first, smaller, other labels')}
        <ui.WeekDays x={28} y={daysWrap ? 204 : 178} join="days2" value={65} first="sun" size={40} labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']} textJoin={s('days2Text')} />
        <Text x={daysWrap ? 28 : 440} y={daysWrap ? 248 : 178} w={152} h={daysWrap ? 28 : 40} join={s('days2Text')} align={daysWrap ? 'left' : 'right'} color={t.muted} font={t.font} fontSize={19} />
      </ui.Card>

      <ui.AlarmCard x={L.wake.x} y={L.wake.y} w={L.wake.w} h={L.wake.h} title="Wake up" on="wakeOn" onValue hour="alarmH" minute="alarmM" value="06:45" days="wakeDays" daysValue={31} />
      <ui.AlarmCard x={L.weekend.x} y={L.weekend.y} w={L.weekend.w} h={L.weekend.h} title={L.weekend.w < 600 ? 'Weekend (12 h, 15 min)' : 'Weekend (12 h, 15-minute steps)'} timeTitle="Weekend" on="weekendOn" hour="weekendH" minute="weekendM"
                    value="09:00" ampm minuteStep={15} days="weekendDays" daysValue={96} />

      <ui.Card title="PinPad" {...L.pin}>
        <ui.PinPad x={28} y={64} code={s('code')} onEnter="CF.setJoin(Joins.s.entered, 'Code entered: ' + code.length + ' digits');" />
        <Text x={px} y={py} w={290} h={28} text="OK writes the code (a string)" color={t.muted} font={t.font} fontSize={16} />
        <Box x={px} y={py + 36} w={284} h={44} bg={t.raised} radius={12} />
        <Text x={px + 12} y={py + 36} w={260} h={44} join={s('code')} font={t.font} fontSize={19} />
        <Text x={px} y={py + 96} w={290} h={28} text="then runs onEnter:" color={t.muted} font={t.font} fontSize={16} />
        <Text x={px} y={py + 126} w={290} h={28} join={s('entered')} color={t.accent} font={t.font} fontSize={16} />
        <Text x={px} y={py + 168} w={290} h={28} text="hold ← to clear" color={t.muted} font={t.font} fontSize={16} />
      </ui.Card>
    </ui.ScrollArea>
    <Shell section="Schedule & security" />
  </Page>
);
