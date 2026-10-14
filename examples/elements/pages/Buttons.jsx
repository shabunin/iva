import { c, tile } from '../theme.js';

export default (
  <Page name="Buttons" bg={c.bg}>
    <Text x={40} y={30} w={700} h={50} text="Buttons" fontSize={32} bold />

    {/* shapes: rounded, pill, outline */}
    <Button x={40} y={100} w={200} h={64} text="radius 16" {...tile} />
    <Button x={260} y={100} w={200} h={64} text="pill" radius={32} bg={c.tile} active={{ bg: c.accent }} />
    <Button x={480} y={100} w={200} h={64} text="outline" radius={16} borderWidth={2} borderColor={c.accent} color={c.accent}
            active={{ bg: c.accent, color: '#ffffff' }} />

    {/* icons: alone, left of the text, above it; brands too */}
    <Button x={40} y={190} w={96} h={96} icon={fa('lightbulb')} feedback="toggle" join="lamp" {...tile} />
    <Button x={156} y={190} w={240} h={96} icon={fa('volume-high')} iconAlign="left" text="Volume" {...tile} />
    <Button x={416} y={190} w={140} h={96} icon={fa('tv')} iconAlign="top" text="TV" {...tile} />
    <Button x={576} y={190} w={104} h={96} icon={fa('brands:spotify', { color: '#1DB954' })} {...tile} />
    <Button x={700} y={190} w={96} h={96} radius={48} icon={fa('power-off')} bg="#5a2a2a" active={{ bg: c.danger }} />

    {/* an icon on its own */}
    <Image x={40} y={320} w={48} h={48} src={fa('house', { color: c.dim })} />
    <Text x={100} y={320} w={500} h={48} text="<Image src={fa('house')} />" color={c.dim} />

    {/* a card: a subpage shown while its join is on */}
    <Button x={40} y={400} w={240} h={64} text="Show card" activeText="Hide card" join="card" feedback="toggle" {...tile} />
    <Subpage name="Card" x={300} y={400} w={480} h={200} join="card" radius={20} bg={c.card} borderWidth={1} borderColor={c.line}
             in={{ type: 'fade', time: 0.2 }} out={{ type: 'fade', time: 0.2 }}>
      <Image x={24} y={24} w={40} h={40} src={fa('circle-info', { color: c.accent })} />
      <Text x={80} y={24} w={380} h={40} text="A rounded card" fontSize={22} bold />
      <Text x={24} y={80} w={432} h={90} text="A <Subpage> with radius and a border: iva draws its background." color={c.dim} wrap />
    </Subpage>

    <Button x={784} y={680} w={200} h={64} icon={fa('arrow-right')} iconAlign="left" text="Lights" page="Lights" {...tile} />
  </Page>
);
