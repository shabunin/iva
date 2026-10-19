import { ui, t, narrow } from '../ui.js';
import Shell, { enter, tab } from '../components/Shell.jsx';

// Gestures on an image (a pad): two fingers pinch and turn the shape, one drags it, a double tap puts it
// back (scripts/gestures.js, CF.setProperties); taps, a press, swipes say what they were; a swipe on the
// strip flips to the next section (a page flip in a transition, a gesture action's own). The readouts are
// join values with the gesture's tokens and iViewer's math: {{round([scale] * 100)}}, rtod([rotation]).
const script = <Script src="../scripts/gestures.js" />;

const note = (x, y, w, h, text, size = 16) => <Text x={x} y={y} w={w} h={h} wrap valign="top" text={text} color={t.muted} font={t.font} fontSize={size} />;
/** a pad the fingers work on: a rounded area, a hint at its foot */
const pad = (p, hint, size) => (
  <>
    <Box x={p.x} y={p.y} w={p.w} h={p.h} radius={t.radius} bg={t.page} />
    {hint && <Text x={p.x + 16} y={p.y + p.h - 34} w={p.w - 32} h={26} text={hint} align="center" color={t.muted} font={t.font} fontSize={size} />}
  </>
);
/** a clear image over an area: what takes its gestures */
const over = (p, gestures) => <Image x={p.x} y={p.y} w={p.w} h={p.h} src={draw.box({ w: 4, h: 4, fill: '#00000000' })}>{gestures}</Image>;

/** the shape (s gestShape): pinched, turned, dragged */
const shapeCard = (c, compact) => {
  const m = compact ? 16 : 28;
  const top = compact ? 8 : 48;
  const area = { x: m, y: top + (compact ? 40 : 60), w: c.w - 2 * m, h: c.h - top - (compact ? 40 : 60) - (compact ? 34 : 56) };
  const size = Math.round(Math.min(area.w, area.h) * 0.32);
  const below = area.y + area.h + (compact ? 6 : 14);
  const half = Math.floor((c.w - 2 * m) / 2);
  return (
    <ui.Card title={compact ? undefined : 'Pinch, rotate, pan'} {...c}>
      {note(m, top, c.w - 2 * m, 40, compact
        ? 'Two fingers pinch and turn the shape, one drags it; a double tap puts it back.'
        : 'Two fingers pinch and turn the shape, one drags it; a double tap puts it back. Below: the gesture\'s own scale and turn ([scale], [rotation] in iViewer\'s math).', compact ? 14 : 16)}
      {pad(area, compact ? undefined : 'pinch · rotate · pan · double tap', 15)}
      <Image x={area.x + Math.round((area.w - size) / 2)} y={area.y + Math.round((area.h - size) / 2)} w={size} h={size} join={s('gestShape')}
             src={fa('cube', { color: t.accent, size })} clickthrough />
      {/* the gestures over the shape (last: on top) */}
      {over(area, (
        <>
          <Gesture type="pinch" onChange={['GalleryGest.pinch(gesture.scale)', { join: s('gestScale'), value: 'pinch {{round([scale] * 100)}} %' }]}
                   onEnd="GalleryGest.settle()" />
          <Gesture type="rotate" onChange={['GalleryGest.turn(gesture.rotation)', { join: s('gestTurn'), value: 'turned {{round(rtod([rotation]))}}°' }]}
                   onEnd="GalleryGest.settle()" />
          <Gesture type="pan" onBegin="GalleryGest.grab(gesture.deltax, gesture.deltay)" onChange="GalleryGest.drag(gesture.deltax, gesture.deltay)"
                   onEnd="GalleryGest.settle()" />
          <Gesture type="tap" taps={2} onBegin="GalleryGest.reset()" />
        </>
      ))}
      <Text x={m} y={below} w={half} h={compact ? 26 : 32} join={s('gestScale')} text="pinch 100 %" font={t.font} fontSize={compact ? 16 : 20} />
      <Text x={m + half} y={below} w={half} h={compact ? 26 : 32} join={s('gestTurn')} text="turned 0°" align="right" font={t.font} fontSize={compact ? 16 : 20} />
    </ui.Card>
  );
};

/** what a gesture was: a line each (s gestLog), the newest on top */
const say = (what) => `GalleryGest.log(${what})`;
const tapsCard = (c, compact) => {
  const m = compact ? 16 : 28;
  const top = compact ? 8 : 48;
  const area = { x: m, y: top + (compact ? 40 : 60), w: c.w - 2 * m, h: compact ? 132 : 300 };
  const logY = area.y + area.h + (compact ? 6 : 16);
  const logH = compact ? 78 : 120;
  const strip = { x: m, y: logY + logH + (compact ? 4 : 16), w: c.w - 2 * m, h: compact ? 40 : 64 };
  /** @param {string} page @param {'left' | 'right'} from @returns {import('iva').GestureAction} */
  const flip = (page, from) => ({ page, transition: { type: 'push', from, time: 0.35, ease: 'easeInOut' } });
  return (
    <ui.Card title={compact ? undefined : 'Tap, press, swipe'} {...c}>
      {note(m, top, c.w - 2 * m, 40, compact
        ? 'A tap on release, a press as soon as a finger is down, a swipe once far enough one way.'
        : 'Each says what it was: a tap on release (two of them a double tap, or two fingers), a press as soon as a finger is down, a swipe once it is far enough one way.', compact ? 14 : 16)}
      {pad(area, 'tap · double tap · two fingers · press · swipe', compact ? 13 : 15)}
      {over(area, (
        <>
          <Gesture type="tap" onBegin={say(`'tap at ' + Math.round(gesture.x) + ', ' + Math.round(gesture.y)`)} />
          <Gesture type="tap" taps={2} onBegin={say(`'double tap'`)} />
          <Gesture type="tap" touches={2} onBegin={say(`'two-finger tap'`)} />
          <Gesture type="press" onBegin={say(`'press: a finger down'`)} />
          {/** @type {const} */ (['left', 'right', 'up', 'down']).map((dir) => (
            <Gesture type="swipe" direction={dir} onBegin={say(`'swipe ${dir}, ' + Math.round(Math.abs(gesture.${dir === 'left' || dir === 'right' ? 'deltax' : 'deltay'})) + ' pt'`)} />
          ))}
        </>
      ))}
      <Text x={m} y={logY} w={c.w - 2 * m} h={logH} wrap valign="top" join={s('gestLog')} text="(nothing yet)" font={t.font} fontSize={compact ? 15 : 20} />
      <Box x={strip.x} y={strip.y} w={strip.w} h={strip.h} radius={t.radius} bg={t.raised} />
      <Text x={strip.x} y={strip.y} w={strip.w} h={strip.h} align="center" text="‹ swipe here: the section before · after ›" color={t.muted} font={t.font} fontSize={compact ? 14 : 17} />
      {over(strip, (
        <>
          <Gesture type="swipe" direction="left" onBegin={flip('Navigation', 'right')} />
          <Gesture type="swipe" direction="right" onBegin={flip('Animations', 'left')} />
        </>
      ))}
    </ui.Card>
  );
};

const L = ui.grid({ shape: { w: 616, h: 696, grow: true }, taps: { w: 616, h: 696, grow: true } }, [['shape', 'taps']]);
const A = ui.screenArea;

export default narrow ? (
  <ui.Screens name="Gestures" transition={enter} tabTransition={tab} shell={<Shell section="Gestures" />} screens={[
    { title: 'Pinch & turn', content: <>{shapeCard(A, true)}{script}</> },
    { title: 'Tap & swipe', content: tapsCard(A, true) },
  ]} />
) : (
  <Page name="Gestures" bg={t.page} transition={enter}>
    {shapeCard(L.shape)}
    {tapsCard(L.taps)}
    {script}
    <Shell section="Gestures" />
  </Page>
);
