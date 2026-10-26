import { neu, t, phone, P, CW } from '../ui.js';
import Shell, { fade } from '../components/Shell.jsx';
import Stack from '../components/Stack.jsx';

const round = [
  { icon: 'power-off', toggle: true, on: true },
  { icon: 'microphone', toggle: true },
  { icon: 'wifi', toggle: true, on: true },
  { icon: 'bluetooth-b', toggle: true },
  { icon: 'bell' },
  { icon: 'heart', toggle: true },
];
/** n things across the inner width: the x of each (w wide) */
const across = (w, n, each) => Array.from({ length: n }, (_, i) => Math.round(P + i * (each + (w - 2 * P - n * each) / (n - 1))));

/** text buttons, each face; an accent one; a toggle */
const text = (w) => {
  const b3 = Math.floor((w - 2 * P - 40) / 3), b2 = Math.floor((w - 2 * P - 22) / 2);
  return (
    <>
      {['flat', 'convex', 'concave'].map((k, i) => (
        <neu.Button x={P + i * (b3 + 20)} y={70} w={b3} text={k[0].toUpperCase() + k.slice(1)} kind={k} />
      ))}
      <neu.Button x={P} y={154} w={b2} text="Save changes" icon="check" kind="accent" />
      <neu.Button x={P + b2 + 22} y={154} w={b2} text="Follow" icon="user-plus" iconOn="user-check" toggle />
      <neu.Text x={P} y={236} w={w - 2 * P} h={44} wrap valign="top" color={t.muted} fontSize={15}
        text="Hold one: it sinks in and its text lights up. Follow is a toggle: it stays in until it's tapped again." />
    </>
  );
};

/** round icon buttons (toggles light their icon); a transport row */
const rounds = (w) => {
  const s = phone ? 48 : 64;
  const xs = across(w, round.length, s);
  const row = [{ icon: 'shuffle', size: 40 }, { icon: 'backward-step', size: 56 }, { icon: 'play', size: 80, play: true }, { icon: 'forward-step', size: 56 }, { icon: 'repeat', size: 40 }];
  const total = row.reduce((sum, r) => sum + r.size, 0), gap = Math.min(40, (w - 2 * P - total) / 4);
  let x = Math.round((w - total - 4 * gap) / 2);
  const ty = 66 + s + 40;
  return (
    <>
      {round.map((b, i) => (
        <neu.RoundButton x={xs[i]} y={66} size={s} icon={b.icon} toggle={b.toggle} value={b.on} color={t.muted} join={b.toggle ? `round_${i}` : undefined} />
      ))}
      {row.map((r) => {
        const at = x;
        x += r.size + gap;
        const y = ty + (80 - r.size) / 2;
        return r.play ? <neu.RoundButton x={at} y={y} size={r.size} icon="play" iconOn="pause" kind="accent" toggle join="round_play" />
          : r.size < 50 ? <neu.RoundButton x={at} y={y} size={r.size} icon={r.icon} kind="flat" depth="sm" color={t.muted} toggle />
          : <neu.RoundButton x={at} y={y} size={r.size} icon={r.icon} kind="flat" color={t.sub} />;
      })}
    </>
  );
};
const roundsH = (phone ? 48 : 64) + 66 + 40 + 80 + 30;

/** one of several: the chosen one stays pressed in; icon and text */
const groups = (w) => {
  const side = w - 2 * P >= 400; // the view group beside the alignment one
  const vy = side ? 94 : 186;
  const b3 = Math.floor((w - 2 * P - 40) / 3);
  const iy = vy + 92;
  return (
    <>
      <neu.Text x={P} y={62} w={240} h={22} text="Alignment" color={t.sub} fontSize={15} fontStyle="Medium" />
      <neu.ButtonGroup x={P} y={94} icons={['align-left', 'align-center', 'align-right', 'align-justify']} join="align" value={1} />
      <neu.Text x={side ? w - P - 130 : P} y={side ? 62 : 154} w={130} h={22} text="View" color={t.sub} fontSize={15} fontStyle="Medium" />
      <neu.ButtonGroup x={side ? w - P - 130 : P} y={vy} icons={['table-cells-large', 'list']} join="view" />
      <neu.Text x={P} y={iy} w={w - 2 * P} h={22} text="Icon and text" color={t.sub} fontSize={15} fontStyle="Medium" />
      <neu.Button x={P} y={iy + 32} w={b3} text="Share" icon="share-nodes" />
      <neu.Button x={P + b3 + 20} y={iy + 32} w={b3} text="Export" icon="download" kind="convex" />
      <neu.Button x={P + 2 * (b3 + 20)} y={iy + 32} w={b3} text="Delete" icon="trash-can" color={t.danger} activeColor={t.danger} />
    </>
  );
};
const groupsH = (w) => (w - 2 * P >= 400 ? 94 : 186) + 92 + 32 + 56 + 30;

/** chips laid out a row after another: [x, y] each */
function flow(w, chips, y0) {
  let x = P, y = y0;
  return chips.map((c) => {
    const cw = neu.chipWidth(c.text, c.dot);
    if (x + cw > w - P) {
      x = P;
      y += 54;
    }
    const at = [x, y];
    x += cw + 18;
    return at;
  });
}
const status = [
  { text: 'Online', dot: t.ok }, { text: 'Away', dot: t.warn }, { text: 'Busy', dot: t.danger }, { text: 'Offline', dot: t.muted },
  { text: 'Living room', kind: 'inset' }, { text: 'Kitchen', kind: 'inset' }, { text: '#iva', kind: 'convex', color: t.accent }, { text: 'v0.1.0', kind: 'convex' },
];
/** status pills, plain chips, a count on a button */
const chips = (w) => {
  const at = flow(w, status, 68);
  const cy = at[at.length - 1][1] + 66;
  return (
    <>
      {status.map((c, i) => <neu.Chip x={at[i][0]} y={at[i][1]} text={c.text} dot={c.dot} kind={/** @type {any} */ (c.kind)} color={c.color} />)}
      <neu.Text x={P} y={cy} w={w - 2 * P} h={22} text="A count on a button" color={t.sub} fontSize={15} fontStyle="Medium" />
      {[['bell', '3'], ['envelope', '12'], ['cart-shopping', '1']].map(([icon, n], i) => (
        <>
          <neu.RoundButton x={P + i * 96} y={cy + 42} size={60} icon={icon} kind="flat" color={t.sub} />
          <neu.Plate x={P + i * 96 + 42} y={cy + 34} w={26} h={26} r={13} kind="accent" depth="xs" />
          <neu.Text x={P + i * 96 + 42} y={cy + 34} w={26} h={26} text={n} align="center" color="#FFFFFF" fontSize={n.length > 1 ? 11 : 13} fontStyle="Demi Bold" />
        </>
      ))}
      {w - 2 * P >= 440 && <neu.Chip x={P + 306} y={cy + 56} text="3 new alerts" dot={t.accent} kind="pressed" color={t.accent} />}
    </>
  );
};
const chipsH = (w) => flow(w, status, 68)[status.length - 1][1] + 66 + 42 + 60 + 28;

export default (
  <Page name="Buttons" bg={t.base} transition={fade}>
    {phone ? (
      <Stack page="Buttons" items={[
        { title: 'Text buttons', h: 290, body: text(CW) },
        { title: 'Round buttons', h: roundsH, body: rounds(CW) },
        { title: 'Groups', h: groupsH(CW), body: groups(CW) },
        { title: 'Chips & badges', h: chipsH(CW), body: chips(CW) },
      ]} />
    ) : (
      <>
        <neu.Card title="Text buttons" x={136} y={116} w={548} h={300}>{text(548)}</neu.Card>
        <neu.Card title="Round buttons" x={708} y={116} w={548} h={300}>{rounds(548)}</neu.Card>
        <neu.Card title="Groups" x={136} y={440} w={548} h={336}>{groups(548)}</neu.Card>
        <neu.Card title="Chips & badges" x={708} y={440} w={548} h={336}>{chips(548)}</neu.Card>
      </>
    )}
    <Shell page="Buttons" title="Buttons" sub="Raised until pressed: the shape sinks in, and a toggle stays in" />
  </Page>
);
