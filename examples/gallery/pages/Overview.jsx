import { ui, t, narrow } from '../ui.js';
import Shell, { sections } from '../components/Shell.jsx';

const cards = sections.filter((s) => s.sub);
// a wide panel: four across; a square one: three, taller - as many rows as fill it; a phone: one under another
const { width: W, height: H } = t.panel;
const cols = narrow ? 1 : W / H >= 1.3 ? 4 : 3;
const top = narrow ? 156 : 136;
const cw = Math.floor((W - 40 - (cols - 1) * 15) / cols);
const rows = Math.ceil(cards.length / cols);
const ch = narrow ? 160 : Math.max(180, Math.floor((H - top - 20 - (rows - 1) * 20) / rows));

export default (
  <Page name="Overview" bg={t.page}>
    <Text x={20} y={88} w={W - 40} h={narrow ? 56 : 36} wrap valign="top" text="Every iva/ui component with its variations. Tap a section, or open the menu." color={t.muted} font={t.font} fontSize={19} />
    {/* the cards scroll when there are more than fit */}
    <ui.ScrollBox x={20} y={top} w={W - 35} h={H - top - 16}>
      {cards.map((s, i) => (
        <ui.NavCard x={(i % cols) * (cw + 15)} y={4 + Math.floor(i / cols) * (ch + 20)} w={cw} h={ch} icon={s.icon} title={s.text} text={s.sub} page={s.page} />
      ))}
    </ui.ScrollBox>
    <Shell />
  </Page>
);
