import { ui, t } from '../ui.js';
import Shell, { enter } from '../components/Shell.jsx';

// The page laid out each way: <Project orientation="both"> builds every page twice - screen() as the panel stands,
// then turned - and screen().orientation says which way this one is. Turn the panel: the other layout, at once.
const { orientation } = screen();
const tall = orientation === 'portrait';
const { width: W, height: H } = t.panel;
const pad = 16;
const top = 88;
const room = H - top - pad;
// upright: one card over the other; on its side: side by side
const way = tall ? { x: pad, y: top, w: W - 2 * pad, h: Math.floor(room * 0.42) } : { x: pad, y: top, w: Math.floor((W - 3 * pad) / 2), h: room };
const kept = tall
  ? { x: pad, y: way.y + way.h + pad, w: W - 2 * pad, h: room - way.h - pad }
  : { x: way.x + way.w + pad, y: top, w: W - 3 * pad - way.w, h: room };
// each way its own colour
const tone = tall ? '#3B82F6' : '#F59E0B';
const big = Math.min(44, Math.floor(way.w / 7));

export default (
  <Page name="Orientation" bg={t.page} transition={enter}>
    <ui.Card title={tall ? 'Portrait layout' : 'Landscape layout'} {...way}>
      <Box x={28} y={56} w={way.w - 56} h={8} bg={tone} radius={4} />
      {way.h > 260 && <ui.Icon x={28} y={84} size={64} icon={tall ? 'mobile-screen' : 'tablet-screen-button'} color={tone} />}
      <Text x={way.h > 260 ? 108 : 28} y={way.h > 260 ? 88 : 80} w={way.w - 136} h={big + 12} text={tall ? 'Upright' : 'On its side'} color={tone} font={t.font} fontSize={big} />
      <Text x={28} y={way.h - 76} w={way.w - 56} h={56} wrap valign="top" color={t.muted} font={t.font} fontSize={16}
        text={tall ? 'Turn the panel on its side: this page has a landscape layout too.' : 'Turn the panel upright: this page has a portrait layout too.'} />
    </ui.Card>
    <ui.Card title="Kept when turned" {...kept}>
      <Text x={28} y={52} w={kept.w - 56} h={44} wrap valign="top" color={t.muted} font={t.font} fontSize={15}
        text="On the same joins either way, placed otherwise: set them, turn the panel." />
      <ui.Toggle x={28} y={tall ? 104 : 120} w={Math.min(332, kept.w - 56)} label="Lamp" join="turnLamp" />
      <ui.Slider x={28} y={tall ? 176 : 216} w={kept.w - 56} label="Level" join="turnLevel" value={30} />
    </ui.Card>
    <Shell section="Orientation" />
  </Page>
);
