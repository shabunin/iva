import { c, tile } from '../theme.js';

const rooms = ['Living room', 'Kitchen', 'Bedroom', 'Office'];

export default (
  <Page name="Lights" bg={c.bg}>
    <Button x={40} y={30} w={140} h={56} icon={fa('chevron-left')} iconAlign="left" text="Back" page="Buttons" {...tile} />
    <Text x={200} y={30} w={600} h={56} text="Lights" fontSize={32} bold />
    {rooms.map((room, i) => (
      <Button x={40 + (i % 2) * 480} y={120 + Math.floor(i / 2) * 140} w={460} h={120}
              icon={fa('lightbulb')} iconAlign="left" text={room} join={`light${i + 1}`} feedback="toggle" {...tile} fontSize={22} />
    ))}
  </Page>
);
