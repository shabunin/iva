import { colors, font } from '../theme.js';
import Header from '../components/Header.jsx';

export default (
  <Page name="Settings" bg={colors.bg}>
    <Header title="Rooms" back="Home" />
    {/* filled by scripts/main.js: CF.listAdd(Joins.l.rooms, ...) */}
    <List x={40} y={130} w={944} h={600} join="rooms"
          item={
            <Subpage name="RoomRow" w={944} h={72} bg={colors.tile}>
              <Text x={24} y={0} w={896} h={70} join={1} font={font} fontSize={22} />
            </Subpage>
          } />
  </Page>
);
