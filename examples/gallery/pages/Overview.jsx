import { ui, t } from '../ui.js';
import Shell, { sections } from '../components/Shell.jsx';

const cards = sections.filter((s) => s.sub);

export default (
  <Page name="Overview" bg={t.page}>
    <Text x={20} y={88} w={1240} h={36} text="Every iva/ui component with its variations. Tap a section, or open the menu." color={t.muted} font={t.font} fontSize={19} />
    {/* the cards scroll when there are more than fit */}
    <ui.ScrollBox join="overview" x={20} y={136} w={1245} h={648}>
      {cards.map((s, i) => (
        <ui.NavCard x={(i % 4) * 310} y={4 + Math.floor(i / 4) * 200} w={295} h={180} icon={s.icon} title={s.text} text={s.sub} page={s.page} />
      ))}
    </ui.ScrollBox>
    <Shell />
  </Page>
);
