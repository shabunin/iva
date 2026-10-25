import { neu, t, W, H, phone, frame } from '../ui.js';
import Shell, { fade } from '../components/Shell.jsx';

const rings = [
  { part: 0.46, text: '46%', label: 'Humidity', title: 'Living room', sub: 'Comfortable' },
  { part: 0.82, text: '82', label: 'Air quality', title: 'Bedroom', sub: 'Good · low PM2.5', color: t.ok },
  { part: 0.64, text: '64%', label: 'Battery', title: 'Solar storage', sub: 'Charging at 2.1 kW' },
  { part: 0.31, text: '9.4', label: 'kWh today', title: 'Energy', sub: 'A third of the budget', color: t.warn },
];

/** what the room is: two sunk readings */
const readings = (x, y, w) => {
  const bw = Math.floor((w - 18) / 2);
  return [['20.8°', 'now'], ['46%', 'humidity']].map(([v, l], i) => (
    <>
      <neu.Plate x={x + i * (bw + 18)} y={y} w={bw} h={84} r={20} kind="inset" depth="sm" />
      <neu.Text x={x + i * (bw + 18)} y={y + 8} w={bw} h={40} text={v} align="center" fontSize={30} fontStyle="Demi Bold" />
      <neu.Text x={x + i * (bw + 18)} y={y + 50} w={bw} h={22} text={l} align="center" color={t.muted} fontSize={14} fontStyle="Medium" />
    </>
  ));
};

const tablet = (
  <>
    {/* a knob: ticks round a raised disc, a lit dot turning to the value; - and + at its open end */}
    <neu.Card title="Knob" x={136} y={116} w={400} h={430}>
      <neu.Knob x={60} y={70} size={280} join="master" value={42} label="Master volume" buttons />
    </neu.Card>

    {/* a thermostat: a knob for the setpoint, what the room is, the mode */}
    <neu.Card title="Thermostat" x={560} y={116} w={696} h={430}>
      <neu.Knob x={40} y={70} size={280} join="setpoint" min={16} max={30} step={0.5} decimals={1} unit="°" value={21.5} label="Heating to" buttons />
      <neu.Text x={372} y={66} w={290} h={34} text="Living room" fontSize={24} fontStyle="Demi Bold" />
      <neu.Text x={372} y={100} w={290} h={22} text="Floor heating · zone 2" color={t.muted} fontSize={15} />
      {readings(372, 142, 290)}
      <neu.Segmented x={372} y={254} w={290} options={['Auto', 'Heat', 'Cool', 'Off']} join="hvac" value={1} fontSize={15} />
      <neu.Toggle x={372} y={330} w={290} label="Eco" sub="1° lower while away" join="eco" value />
    </neu.Card>

    {/* rings: a part of a whole, as drawn */}
    <neu.Card x={136} y={570} w={1120} h={206}>
      {rings.map((r, i) => (
        <>
          <neu.Ring x={34 + i * 276} y={33} size={140} part={r.part} text={r.text} label={r.label} color={r.color} />
          <neu.Text x={192 + i * 276} y={72} w={110} h={50} text={r.title} wrap valign="top" fontSize={17} fontStyle="Demi Bold" />
          <neu.Text x={192 + i * 276} y={120} w={110} h={50} text={r.sub} wrap valign="top" color={t.muted} fontSize={13} />
        </>
      ))}
    </neu.Card>
  </>
);

// a phone: a screen each, a tab apart - a knob takes gestures, which iViewer fires in no list (a scroll)
const tabs = { y: frame.top + 4, h: 46 };
const area = { y: tabs.y + tabs.h + 14, h: H - frame.bar - (tabs.y + tabs.h + 14) };
const tall = area.h >= 480;
const knobSize = Math.min(W - 60, area.h - 12, 300);
const thermoSize = tall ? 270 : Math.min(W - 60, area.h - 70);
const ringSize = Math.min(Math.floor((W - 36 - 24) / 2), Math.floor((area.h - 24) / 2), 160);
const screens = [
  {
    title: 'Knob',
    content: <neu.Knob x={Math.round((W - knobSize) / 2)} y={Math.round((area.h - knobSize) / 2)} size={knobSize} join="master" value={42} label="Master volume" buttons />,
  },
  {
    title: 'Thermostat',
    content: (
      <>
        <neu.Knob x={Math.round((W - thermoSize) / 2)} y={tall ? 6 : 0} size={thermoSize} join="setpoint" min={16} max={30} step={0.5} decimals={1} unit="°" value={21.5} label="Heating to" buttons />
        {tall && readings(18, 300, W - 36)}
        <neu.Segmented x={18} y={tall ? 408 : thermoSize + 12} w={W - 36} h={tall ? 50 : 46} options={['Auto', 'Heat', 'Cool', 'Off']} join="hvac" value={1} fontSize={15} />
        {tall && <neu.Toggle x={24} y={478} w={W - 48} label="Eco" sub="1° lower while away" join="eco" value />}
      </>
    ),
  },
  {
    title: 'Rings',
    content: rings.map((r, i) => {
      const gx = Math.round((W - 2 * ringSize - 24) / 2), gy = Math.round((area.h - 2 * ringSize - 24) / 2);
      return <neu.Ring x={gx + (i % 2) * (ringSize + 24)} y={gy + Math.floor(i / 2) * (ringSize + 24)} size={ringSize} part={r.part} text={r.text} label={r.label} color={r.color} />;
    }),
  },
];

export default (
  <Page name="Dials" bg={t.base} transition={fade}>
    {phone ? (
      <>
        <neu.Segmented x={18} y={tabs.y} w={W - 36} h={tabs.h} options={screens.map((sc) => sc.title)} join="dials_tab" fontSize={15} />
        {screens.map((sc, i) => (
          <Subpage name={`dials_${sc.title.toLowerCase()}`} x={0} y={area.y} w={W} h={area.h} join={neu.optionJoin('dials_tab', i)}
            in={{ type: 'fade', time: 0.15 }} out={{ type: 'fade', time: 0.15 }}>
            {sc.content}
          </Subpage>
        ))}
      </>
    ) : tablet}
    <Shell page="Dials" title="Dials" sub="Turn a knob: a tap turns it there, a drag has it follow" />
  </Page>
);
