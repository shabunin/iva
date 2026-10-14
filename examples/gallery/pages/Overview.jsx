import { ui, t } from '../ui.js';
import Shell, { sections } from '../components/Shell.jsx';

const cards = sections.filter((s) => s.sub);

export default (
  <Page name="Overview" bg={t.page}>
    <Text x={20} y={88} w={1240} h={36} text="Every iva/ui component with its variations. Tap a section, or open the menu." color={t.muted} font={t.font} fontSize={19} />
    {cards.map((s, i) => (
      <ui.NavCard x={20 + (i % 3) * 413} y={140 + Math.floor(i / 3) * 200} w={393} h={180} icon={s.icon} title={s.text} text={s.sub} page={s.page} />
    ))}
    <Shell />
  </Page>
);
