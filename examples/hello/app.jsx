import { theme } from './theme.js';
import Header from './Header.jsx';

const Tile = ({ x, y, label, join }) => (
  <Button x={x} y={y} w={200} h={120} join={join} feedback="toggle" text={label}
          bg={theme.tile} active={{ bg: theme.accent }} fontSize={22} />
);

export default (
  <Project name="Hello iva" width={1024} height={768}>
    <Page name="Home" bg={theme.bg}>
      <Header title="Living room" />
      <Tile x={40} y={120} label="Lights" join="lights" />
      <Tile x={260} y={120} label="Blinds" join="blinds" />
      <Tile x={480} y={120} label="Music" join="music" />

      <Text x={40} y={280} w={400} h={40} color={theme.dim}>Volume</Text>
      <Slider x={40} y={330} w={600} h={40} join="volume" bg="#333a44" fill={theme.accent} thumbColor="#ffffff" />
      <Text x={660} y={330} w={120} h={40} join="volumeText" align="right" />

      <Button x={40} y={420} w={240} h={70} text="Ping device" onPress={['Ping']} bg={theme.tile} active={{ bg: theme.accent }} />
      <Button x={300} y={420} w={240} h={70} feedback="none" join={d('online')} text="offline" activeText="online"
              bg="#552222" active={{ bg: '#226644' }} />
      <Text x={40} y={510} w={600} h={40} join="reply" color={theme.dim} />

      <Button x={780} y={120} w={200} h={120} text="Settings" page="Settings" bg={theme.tile} />

      <Subpage name="Toast" x={40} y={600} w={500} h={80} join="toast" bg="#000000c0" in={{ type: 'fade', time: 0.3 }}>
        <Text x={20} y={0} w={460} h={80} align="center">Lights are on</Text>
      </Subpage>
    </Page>

    <Page name="Settings" bg={theme.bg}>
      <Header title="Settings" />
      <Button x={40} y={120} w={200} h={70} text="Back" page="Home" bg={theme.tile} />
      <List x={300} y={120} w={500} h={500} join={1}
            item={<Subpage name="Row" w={500} h={60} bg="#262c34"><Text x={20} y={0} w={460} h={60} join={1} /></Subpage>} />
    </Page>

    <System name="Device" host="127.0.0.2" port={5199} eom="\x0D" connectJoin={d('online')}>
      <Command name="Ping" send="hello\x0D" />
      <Feedback name="reply" regex="echo:(.*)">
        <Capture join={s('reply')} />
      </Feedback>
    </System>

    <Script name="main.js" code={`CF.userMain = function () { CF.setJoin(Joins.s.volumeText, "50%"); };`} />
  </Project>
);
