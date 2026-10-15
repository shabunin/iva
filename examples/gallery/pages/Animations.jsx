import { ui, t, narrow } from '../ui.js';
import Shell from '../components/Shell.jsx';

// The functions the buttons run: CF.setProperties / CF.getProperties (scripts/animations.js)
const script = <Script src="../scripts/animations.js" />;

const note = (x, y, w, h, text, size = 16) => <Text x={x} y={y} w={w} h={h} wrap valign="top" text={text} color={t.muted} font={t.font} fontSize={size} />;
const label = (x, y, w, text) => <Text x={x} y={y} w={w} h={32} text={text} font={t.font} fontSize={17} />;

/** a row of buttons across w, each running js */
const buttons = (x, y, w, h, items) => {
  const bw = Math.floor((w - (items.length - 1) * 8) / items.length);
  return items.map(([text, js], i) => <ui.IconButton x={x + i * (bw + 8)} y={y} w={bw} h={h} text={text} js={js} />);
};

/**
 * CF.setProperties: the cube moved, scaled, turned, faded, flipped by its join (d animCube) - each
 * button one call (and its callback); a tap on the cube bounces it. What CF.getProperties then says
 * is under the stage.
 */
const setProps = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const stage = { x: m, y: top + (compact ? 52 : 52), w: c.w - 2 * m, h: compact ? 112 : 150 };
  const cube = compact ? 72 : 96;
  const pad = (stage.h - cube) / 2;
  const dx = stage.w - cube - 2 * pad;
  const cubeJ = 'Joins.d.animCube';
  const out = 'Joins.s.animProps';
  const run = (fn, ...args) => `GalleryAnim.${fn}(${[cubeJ, ...args, out].join(', ')})`;
  const row1 = [['Move', run('move', dx)], ['Scale', run('scale')], ['Spin', run('spin')], ['Fade', run('fade')]];
  const row2 = [['Flip', run('flip')], ['All at once', run('all', dx)], ['Reset', run('reset')]];
  const below = stage.y + stage.h + 6;
  return (
    <ui.Card title={compact ? undefined : 'CF.setProperties'} {...c}>
      {note(m, top, c.w - 2 * m, 48, compact
        ? 'An element animated by its join: x, scale, zrotation, opacity - a duration, a curve, a callback.'
        : 'An element animated by its join: x / y, scale, zrotation, opacity (and xrotation / yrotation: 3D) over a duration, with a curve; the callback runs when it is done. Tap the cube too.', compact ? 14 : 16)}
      <Box x={stage.x} y={stage.y} w={stage.w} h={stage.h} radius={t.radius} bg={t.page} />
      <ui.IconButton x={stage.x + pad} y={stage.y + pad} w={cube} h={cube} icon="cube" size={Math.round(cube * 0.5)} tone="accent"
                     join="animCube" feedback="none" js={`GalleryAnim.bounce(${cubeJ})`} />
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

/** The same move with each of CF's curves: a dot a lane (s animCurveLinear ...), 1.2 s. */
const curves = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const names = ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut'];
  const lw = compact ? 96 : 112;
  const lane = compact ? 50 : 56;
  const y0 = top + (compact ? 40 : 60);
  const dot = 32;
  const track = c.w - 2 * m - lw;
  const dx = track - dot;
  return (
    <ui.Card title={compact ? undefined : 'Curves'} {...c}>
      {note(m, top, c.w - 2 * m, 40, 'The same move, each lane with its curve: CF.AnimationCurveLinear, …EaseIn, …EaseOut, …EaseInOut.', compact ? 14 : 16)}
      {names.map((n, i) => (
        <>
          {label(m, y0 + i * lane, lw, n)}
          <Box x={m + lw} y={y0 + i * lane + dot / 2 - 2} w={track} h={4} radius={2} bg={t.raised} />
          <Image x={m + lw} y={y0 + i * lane} w={dot} h={dot} join={s(`animCurve${n}`)} src={fa('circle', { color: t.accent, size: dot })} />
        </>
      ))}
      <ui.IconButton x={m} y={y0 + 4 * lane + (compact ? 4 : 12)} w={160} h={compact ? 44 : 56} icon="play" text="Run" tone="accent" js={`GalleryAnim.curves(${dx})`} />
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
const transitions = (c, compact) => {
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

/** Callbacks chaining animations: the bars (d animBar0 ...) in a wave, toppling like dominoes. */
const chains = (c, compact) => {
  const m = compact ? 20 : 28;
  const top = compact ? 12 : 48;
  const n = compact ? 7 : 8;
  const bw = 36;
  const gap = Math.floor((c.w - 2 * m - n * bw) / (n - 1));
  const y0 = top + (compact ? 70 : 64);
  return (
    <ui.Card title={compact ? undefined : 'Callbacks & delays'} {...c}>
      {note(m, top, c.w - 2 * m, 48, 'One animation starts in the last one\'s callback, or after a delay: a wave along the bars, dominoes.', compact ? 14 : 16)}
      {Array.from({ length: n }, (_, i) => (
        <ui.IconButton x={m + i * (bw + gap)} y={y0} w={bw} h={64} tone="accent" join={`animBar${i}`} feedback="none" />
      ))}
      {buttons(m, y0 + (compact ? 100 : 84), c.w - 2 * m, compact ? 44 : 56, [['Wave', 'GalleryAnim.wave()'], ['Dominoes', 'GalleryAnim.domino()']])}
    </ui.Card>
  );
};

const L = ui.grid({
  setProps: [800, 400], curves: [432, 400],
  transitions: [800, 280], chains: [432, 280],
}, [['setProps', 'curves'], ['transitions', 'chains']]);
const A = ui.screenArea;

export default narrow ? (
  <ui.Screens name="Animations" shell={<Shell section="Animations" />} screens={[
    { title: 'Properties', content: <>{setProps(A, true)}{script}</> },
    { title: 'Curves', content: curves(A, true) },
    { title: 'Subpages', content: <>{transitions(A, true)}{sheetDef}</> },
    { title: 'Chains', content: chains(A, true) },
  ]} />
) : (
  <Page name="Animations" bg={t.page}>
    {setProps(L.setProps)}
    {curves(L.curves)}
    {transitions(L.transitions)}
    {chains(L.chains)}
    {sheetDef}
    {script}
    <Shell section="Animations" />
  </Page>
);
