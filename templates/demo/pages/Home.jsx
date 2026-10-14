import { colors, font } from '../theme.js';
import Header from '../components/Header.jsx';
import Tile from '../components/Tile.jsx';

const scene = { bg: colors.tile, active: { bg: colors.accent }, font, fontSize: 20 };

export default (
  <Page name="Home" bg={colors.bg}>
    <Header title="Living room" />

    <Tile x={40} y={130} label="Lights" join="lights" />
    <Tile x={280} y={130} label="Blinds" join="blinds" />
    <Tile x={520} y={130} label="TV" join="tv" />
    <Tile x={760} y={130} label="Music" join="music" />

    <Text x={40} y={310} w={300} h={40} text="Volume" color={colors.dim} font={font} fontSize={20} />
    <Slider x={40} y={360} w={760} h={44} join="volume" dragCmd="Volume" bg={colors.track} fill={colors.accent} thumbColor="#ffffff" />
    <Text x={820} y={360} w={164} h={44} join="volumeText" align="right" font={font} fontSize={24} />

    <Button x={40} y={460} w={220} h={80} text="Power on" cmd="PowerOn" {...scene} />
    <Button x={280} y={460} w={220} h={80} text="Standby" cmd="PowerOff" {...scene} />
    <Button x={520} y={460} w={220} h={80} text="Movie" cmd="InputMovie" {...scene} />
    <Button x={760} y={460} w={224} h={80} text="Settings" page="Settings" {...scene} />
  </Page>
);
