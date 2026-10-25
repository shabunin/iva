import { neu, t, W, phone, P } from '../ui.js';
import Shell, { sections, fade } from '../components/Shell.jsx';
import Stack from '../components/Stack.jsx';

const shapes = [
  { kind: 'flat', label: 'Flat' },
  { kind: 'convex', label: 'Convex' },
  { kind: 'concave', label: 'Concave' },
  { kind: 'inset', label: 'Inset' },
  { kind: 'pressed', label: 'Pressed' },
  { kind: 'accent', label: 'Accent' },
];
const cards = sections.filter((s) => s.page !== 'Overview');

/** what it is, two ways in (a tablet: an orb of rings beside it) */
const hero = (w) => {
  const tw = phone ? w - 2 * P : 380;
  return (
    <>
      <neu.Chip x={P + 6} y={36} text="iva · soft UI" dot={t.accent} />
      <neu.Text x={P + 6} y={92} w={tw} h={phone ? 76 : 100} text="Soft UI, drawn for iViewer" wrap valign="top" fontSize={phone ? 30 : 40} fontStyle="Demi Bold" />
      <neu.Text x={P + 6} y={phone ? 172 : 200} w={phone ? tw : 360} h={84} wrap valign="top" color={t.sub} fontSize={phone ? 16 : 17}
        text="One colour lit from the top left: raised shapes catch the light and cast a shadow, sunk ones hold both inside. iva draws every shape at its own size." />
      {phone ? (
        <>
          <neu.Button x={P + 6} y={272} w={Math.round((tw - 18) / 2)} text="Explore" icon="arrow-right" kind="accent" page="Controls" />
          <neu.Button x={P + 6 + Math.round((tw - 18) / 2) + 18} y={272} w={Math.round((tw - 18) / 2)} text="Smart home" page="Home" />
        </>
      ) : (
        <>
          <neu.Button x={34} y={292} text="Explore controls" icon="arrow-right" kind="accent" page="Controls" />
          <neu.Button x={282} y={292} text="Smart home" page="Home" />
          <neu.Plate x={420} y={86} w={200} h={200} r={100} kind="flat" depth="lg" />
          <neu.Plate x={445} y={111} w={150} h={150} r={75} kind="inset" depth="md" />
          <neu.Plate x={472} y={138} w={96} h={96} r={48} kind="convex" depth="md" />
          <neu.Plate x={508} y={174} w={24} h={24} r={12} kind="accent" depth="xs" />
        </>
      )}
    </>
  );
};

/** the six faces a shape can have, three a row */
const faces = (w) => {
  const s = phone ? Math.min(84, Math.floor((w - 2 * P - 48) / 3)) : 96;
  const col = (w - 2 * P) / 3;
  return shapes.map((sh, i) => {
    const x = Math.round(P + (i % 3) * col + (col - s) / 2), y = 70 + Math.floor(i / 3) * (s + 58);
    return (
      <>
        <neu.Plate x={x} y={y} w={s} h={s} r={22} kind={sh.kind} depth="md" />
        <neu.Text x={x - 16} y={y + s + 8} w={s + 32} h={24} text={sh.label} align="center" color={t.sub} fontSize={15} fontStyle="Demi Bold" />
      </>
    );
  });
};
const facesH = (w) => 70 + 2 * (Math.min(84, Math.floor((w - 2 * P - 48) / 3)) + 58) - 10;

export default (
  <Page name="Overview" bg={t.base} transition={fade}>
    {phone ? (
      <Stack page="Overview" items={[
        { h: 352, body: hero(W - 36) },
        { title: 'The shapes', h: facesH(W - 36), body: faces(W - 36) },
        // the sections, two a row
        ...Array.from({ length: Math.ceil(cards.length / 2) }, (_, r) => ({
          h: 200,
          el: (x, y, w) => cards.slice(r * 2, r * 2 + 2).map((c, i) => (
            <neu.NavCard x={x + i * Math.round((w + 18) / 2)} y={y} w={Math.round((w - 18) / 2)} h={200} icon={c.icon} title={c.title} text={c.sub} page={c.page} />
          )),
        })),
      ]} />
    ) : (
      <>
        <neu.Card x={136} y={116} w={640} h={380}>{hero(640)}</neu.Card>
        <neu.Card title="The shapes" x={800} y={116} w={456} h={380}>{faces(456)}</neu.Card>
        {cards.map((c, i) => (
          <neu.NavCard x={136 + i * ((1120 - 4 * 24) / 5 + 24)} y={526} w={(1120 - 4 * 24) / 5} h={250} icon={c.icon} title={c.title} text={c.sub} page={c.page} />
        ))}
      </>
    )}
    <Shell page="Overview" title={phone ? 'Soft UI' : 'Neumorphic iva/ui'} sub="A soft gallery: every control made of one colour, light and shadow" />
  </Page>
);
