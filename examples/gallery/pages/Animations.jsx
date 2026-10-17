import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

// Animations two ways: setProps() actions in the JSX - one CF.setProperties call, then the next in its
// callback - and, for what keeps state (a toggle, where an element started), a script's functions
// (scripts/animations.js: CF.setProperties / CF.getProperties by hand).
const script = <Script src="../scripts/animations.js" />;

const note = (x, y, w, h, text, size = 16) => <Text x={x} y={y} w={w} h={h} wrap valign="top" text={text} color={t.muted} font={t.font} fontSize={size} />;
const label = (x, y, w, text) => <Text x={x} y={y} w={w} h={32} text={text} font={t.font} fontSize={17} />;

/** a row of buttons across w: each a script's call (a string) or actions (setProps() ...) */
const buttons = (x, y, w, h, items) => {
  const bw = Math.floor((w - (items.length - 1) * 8) / items.length);
  return items.map(([text, act], i) => (
    <ui.IconButton x={x + i * (bw + 8)} y={y} w={bw} h={h} text={text} {...(typeof act === 'string' ? { js: act } : { onPress: act })} />
  ));
};

const cube = d('animCube');
/** what CF.getProperties says of the cube, under the stage (the script's) */
const readout = js('GalleryAnim.readout(Joins.d.animCube, Joins.s.animProps)');

/** bigger, then back: the second in the first one's callback */
const scale = setProps(cube, { scale: 1.6 }, { duration: 0.35, curve: 'easeOut',
  then: setProps(cube, { scale: 1 }, { delay: 0.15, duration: 0.35, curve: 'easeIn', then: readout }) });
/** a full turn in two halves (more than 180° at once may go either way), then 0 at once */
const spin = setProps(cube, { zrotation: 179 }, { duration: 0.45,
  then: setProps(cube, { zrotation: 358 }, { duration: 0.45, then: [setProps(cube, { zrotation: 0 }), readout] }) });
/** nearly gone, then back */
const fade = setProps(cube, { opacity: 0.1 }, { duration: 0.4, curve: 'easeIn',
  then: setProps(cube, { opacity: 1 }, { delay: 0.2, duration: 0.4, curve: 'easeOut', then: readout }) });
/** a card turning over: about Y to its edge, at once to the other edge, back */
const flip = setProps(cube, { yrotation: 90 }, { duration: 0.22, curve: 'easeIn',
  then: [setProps(cube, { yrotation: -90 }), setProps(cube, { yrotation: 0 }, { duration: 0.22, curve: 'easeOut', then: readout })] });
/** a tap on the cube */
const bounce = setProps(cube, { scale: 1.2 }, { duration: 0.12, curve: 'easeOut',
  then: setProps(cube, { scale: 1 }, { duration: 0.25, curve: 'easeIn' }) });

/**
 * The cube (d animCube) moved, scaled, turned, faded, flipped: setProps() actions, and the script's
 * for what keeps state - Move (there and back), All at once and Reset (where it started). What
 * CF.getProperties then says is under the stage.
 */
const propsCard = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const stage = { x: m, y: top + 52, w: c.w - 2 * m, h: compact ? 112 : 150 };
  const size = compact ? 72 : 96;
  const pad = (stage.h - size) / 2;
  const dx = stage.w - size - 2 * pad;
  const call = (fn, ...args) => `GalleryAnim.${fn}(${['Joins.d.animCube', ...args, 'Joins.s.animProps'].join(', ')})`;
  const row1 = [['Move', call('move', dx)], ['Scale', scale], ['Spin', spin], ['Fade', fade]];
  const row2 = [['Flip', flip], ['All at once', call('all', dx)], ['Reset', call('reset')]];
  const below = stage.y + stage.h + 6;
  return (
    <ui.Card title={compact ? undefined : 'CF.setProperties'} {...c}>
      {note(m, top, c.w - 2 * m, 48, compact
        ? 'An element animated by its join: x, scale, zrotation, opacity - a duration, a curve, a callback.'
        : 'An element animated by its join: x / y, scale, zrotation, opacity (and xrotation / yrotation: 3D) over a duration, with a curve; the callback runs when it is done. Tap the cube too.', compact ? 14 : 16)}
      <Box x={stage.x} y={stage.y} w={stage.w} h={stage.h} radius={t.radius} bg={t.page} />
      <ui.IconButton x={stage.x + pad} y={stage.y + pad} w={size} h={size} icon="cube" size={Math.round(size * 0.5)} tone="accent"
                     join="animCube" feedback="none" onPress={bounce} />
      <Text x={m} y={below} w={c.w - 2 * m} h={24} join={s('animProps')} text="CF.getProperties: -" color={t.muted} font={t.font} fontSize={compact ? 12 : 14} />
      {compact ? (
        <>
          {buttons(m, below + 26, c.w - 2 * m, 44, row1)}
          {buttons(m, below + 78, c.w - 2 * m, 44, row2)}
        </>
      ) : buttons(m, below + 34, c.w - 2 * m, 56, [...row1, ...row2])}
    </ui.Card>
  );
};

/** The same move with each of CF's curves: a dot a lane (s animCurveLinear ...), over and back. */
const curvesCard = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const names = ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut'];
  const lw = compact ? 96 : 112;
  const lane = compact ? 50 : 56;
  const y0 = top + (compact ? 40 : 60);
  const size = 32;
  const track = c.w - 2 * m - lw;
  // where the dots are on the page (the card's place and theirs in it): over to the end and back
  const x0 = c.x + m + lw;
  const run = names.map((n) => {
    const dot = s(`animCurve${n}`);
    const curve = /** @type {'linear' | 'easeIn' | 'easeOut' | 'easeInOut'} */ (n[0].toLowerCase() + n.slice(1));
    return setProps(dot, { x: x0 + track - size }, { duration: 1.2, curve, then: setProps(dot, { x: x0 }, { delay: 0.4, duration: 1.2, curve }) });
  });
  return (
    <ui.Card title={compact ? undefined : 'Curves'} {...c}>
      {note(m, top, c.w - 2 * m, 40, 'The same move, each lane with its curve: linear, easeIn, easeOut, easeInOut - over and back.', compact ? 14 : 16)}
      {names.map((n, i) => (
        <>
          {label(m, y0 + i * lane, lw, n)}
          <Box x={m + lw} y={y0 + i * lane + size / 2 - 2} w={track} h={4} radius={2} bg={t.raised} />
          <Image x={m + lw} y={y0 + i * lane} w={size} h={size} join={s(`animCurve${n}`)} src={fa('circle', { color: t.accent, size })} />
        </>
      ))}
      <ui.IconButton x={m} y={y0 + 4 * lane + (compact ? 4 : 12)} w={160} h={compact ? 44 : 56} icon="play" text="Run" tone="accent" onPress={run} />
    </ui.Card>
  );
};

// the transitions shown: a placement of the sheet each, its join (d animSheet<Kind>) showing it
/** @type {{ kind: string, how: import('iva').Transition }[]} */
const kinds = [
  { kind: 'Fade', how: { type: 'fade', time: 0.4 } },
  { kind: 'From left', how: { type: 'moveIn', from: 'left', time: 0.45, ease: 'easeOut' } },
  { kind: 'From right', how: { type: 'moveIn', from: 'right', time: 0.45, ease: 'easeOut' } },
  { kind: 'From top', how: { type: 'moveIn', from: 'top', time: 0.45, ease: 'easeOut' } },
  { kind: 'From bottom', how: { type: 'moveIn', from: 'bottom', time: 0.45, ease: 'easeOut' } },
  { kind: 'Push', how: { type: 'push', from: 'right', time: 0.45, ease: 'easeInOut' } },
];
const joinOf = (kind) => `animSheet${kind.replace(/\W/g, '')}`;
const sheet = { w: 300, h: 150 };

/** A small sheet, only defined: placed once a transition below. */
const sheetDef = (
  <Subpage name="anim_sheet" define w={sheet.w} h={sheet.h} radius={t.radius} bg={t.raised}>
    <Text x={20} y={16} w={sheet.w - 40} h={30} text="A subpage" font={t.font} fontSize={20} />
    <Text x={20} y={50} w={sheet.w - 40} h={28} join={s('animSheetText')} color={t.muted} font={t.font} fontSize={16} />
    <ui.IconButton x={20} y={sheet.h - 60} w={sheet.w - 40} h={44} icon="xmark" text="Close" js="GalleryAnim.closeSheet()" />
  </Subpage>
);

/** Subpage transitions: in / out on its placement - fade, moveIn and push from a side, a time, an ease. */
const transitionsCard = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const cols = compact ? 2 : 3;
  const bw = compact ? Math.floor((c.w - 2 * m - 8) / 2) : 150;
  const bh = compact ? 44 : 52;
  const y0 = top + (compact ? 44 : 56);
  // the sheet: beside the buttons, or over the card on a phone
  const at = compact ? { x: (c.w - sheet.w) / 2, y: c.h - sheet.h - 12 } : { x: m + cols * (bw + 8) + 24, y: y0 };
  return (
    <ui.Card title={compact ? undefined : 'Subpage transitions'} {...c}>
      {note(m, top, c.w - 2 * m, 40, compact ? 'A subpage shown by its join, coming in its way.' : 'A subpage shown by its join, coming in (and going) its own way: in / out on its placement.', compact ? 14 : 16)}
      {kinds.map(({ kind }, i) => (
        <ui.IconButton x={m + (i % cols) * (bw + 8)} y={y0 + Math.floor(i / cols) * (bh + 8)} w={bw} h={bh} text={kind}
                       js={`GalleryAnim.sheet(Joins.d.${joinOf(kind)}, ${JSON.stringify(`came in: ${kind.toLowerCase()}`)})`} />
      ))}
      {kinds.map(({ kind, how }) => (
        <SubpageRef name="anim_sheet" x={at.x} y={at.y} join={joinOf(kind)} in={how} out={how} />
      ))}
    </ui.Card>
  );
};

/** Delays and callbacks: the bars (d animBar0 ...) in a wave, toppling like dominoes - setProps() each. */
const chainsCard = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const n = compact ? 7 : 8;
  const bw = 36;
  const gap = Math.floor((c.w - 2 * m - n * bw) / (n - 1));
  const y0 = top + (compact ? 70 : 64);
  const bars = Array.from({ length: n }, (_, i) => d(`animBar${i}`));
  // up and down, each a little later
  const wave = bars.map((bar, i) => setProps(bar, { yscale: 1.6 }, { delay: i * 0.07, duration: 0.22, curve: 'easeOut',
    then: setProps(bar, { yscale: 1 }, { duration: 0.3, curve: 'easeIn' }) }));
  // over one after another; once the last is down, all up again, last first
  const up = bars.map((bar, i) => setProps(bar, { zrotation: 0 }, { delay: 0.3 + (n - 1 - i) * 0.06, duration: 0.25, curve: 'easeOut' }));
  const dominoes = bars.map((bar, i) => setProps(bar, { zrotation: 90 }, { delay: i * 0.1, duration: 0.25, curve: 'easeIn', then: i === n - 1 ? up : undefined }));
  return (
    <ui.Card title={compact ? undefined : 'Delays & callbacks'} {...c}>
      {note(m, top, c.w - 2 * m, 48, 'Each bar a little later (a delay), the next move in the last one\'s callback: a wave, dominoes.', compact ? 14 : 16)}
      {bars.map((_, i) => <ui.IconButton x={m + i * (bw + gap)} y={y0} w={bw} h={64} tone="accent" join={`animBar${i}`} feedback="none" />)}
      {buttons(m, y0 + (compact ? 100 : 84), c.w - 2 * m, compact ? 44 : 56, [['Wave', wave], ['Dominoes', dominoes]])}
    </ui.Card>
  );
};

/** motion={...} on elements: in as the page shows, smaller while pressed, with a join - no script of the page's. */
const motionCard = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const y0 = top + (compact ? 76 : 60);
  const size = compact ? 64 : 80;
  // the icons, then the button, then the toggle with the lamp beside it: a row each
  const row2 = y0 + size + 24;
  const row3 = row2 + 48 + 20;
  return (
    <ui.Card title={compact ? undefined : 'motion={...}'} {...c}>
      {note(m, top, c.w - 2 * m, 64, 'motion={...} on an element, no script: these three come in as the page shows (flip away and back), the button shrinks while pressed, the lamp follows the toggle.', compact ? 14 : 16)}
      {['circle', 'square', 'star'].map((icon, i) => (
        <Image x={m + i * (size + 12)} y={y0} w={size} h={size} src={fa(icon, { color: t.accent, size: Math.round(size * 0.55) })}
               motion={{ enter: { from: { y: '+40', opacity: 0 }, delay: 0.1 * i, duration: 0.4, curve: 'easeOut' } }} />
      ))}
      <Button x={m} y={row2} w={160} h={48} text="Press me" bg={t.accent} radius={t.radius} font={t.font} fontSize={18}
              motion={{ press: { scale: 0.92, duration: 0.08 } }} />
      <ui.Toggle x={m} y={row3 + Math.round((size - 36) / 2)} w={240} h={36} label="Lamp" join="animGlow" />
      <Image x={c.w - m - size} y={row3} w={size} h={size} src={fa('lightbulb', { color: t.warning, size: Math.round(size * 0.6) })}
             motion={{ when: { join: d('animGlow'), on: { opacity: 1, scale: 1.15 }, off: { opacity: 0.35, scale: 1 }, duration: 0.3 } }} />
    </ui.Card>
  );
};

const L = ui.grid({
  props: [800, 400], curves: [432, 400],
  transitions: [800, 280], chains: [432, 280],
}, [['props', 'curves'], ['transitions', 'chains']]);
const A = ui.screenArea;

export default narrow ? (
  <ui.Screens name="Animations" transition={enter} tabTransition={tab} shell={<Shell section="Animations" />} screens={[
    { title: 'Properties', content: <>{propsCard(A, true)}{script}</> },
    { title: 'Curves', content: curvesCard(A, true) },
    { title: 'Subpages', content: <>{transitionsCard(A, true)}{sheetDef}</> },
    { title: 'Chains', content: chainsCard(A, true) },
    { title: 'Motion', content: motionCard(A, true) },
  ]} />
) : (
  <Page name="Animations" bg={t.page} transition={enter}>
    {propsCard(L.props)}
    {curvesCard(L.curves)}
    {transitionsCard(L.transitions)}
    {chainsCard(L.chains)}
    {sheetDef}
    {script}
    <Shell section="Animations" />
  </Page>
);
