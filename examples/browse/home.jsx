// A browser's worth of GUIs: three projects linking to one another with
// CF.loadGUI (relative URLs, ?page= the page to start on) and CF.openURL -
// what the iva panel follows with back, forward and its address bar.
// Build each into examples/browse/dist/<name>/ and `iva serve` the folder
// (see README.md).
import { Nav, PALETTE } from './components/Nav.jsx';

export default (
  <Project name="Home" width={1280} height={800} joinBase={1000}>
    <Page name="Home" bg={PALETTE.home}>
      <Nav title="Home" subtitle="A browser of GUIs: each button loads another .gui, as a link loads another page" />
      <Button x={80} y={240} w={520} h={110} join="toLights" feedback="momentary" text="Lights (its Kitchen page)" fontSize={26} bg="#2f6fd6" radius={18}
              active={{ bg: '#4a86e8' }} js="CF.loadGUI('../lights/Lights.gui?page=Kitchen')" />
      <Button x={680} y={240} w={520} h={110} join="toMedia" feedback="momentary" text="Media" fontSize={26} bg="#8e44ad" radius={18}
              active={{ bg: '#a569bd' }} js="CF.loadGUI('../media/Media.gui')" />
      <Button x={80} y={390} w={520} h={110} join="peekLights" feedback="momentary" text="Lights, once (not remembered)" fontSize={24} bg="#2a313b" radius={18}
              active={{ bg: '#3a434f' }} js="CF.loadGUI('../lights/Lights.gui', { rememberLastGUI: false })" />
      <Button x={680} y={390} w={520} h={110} join="reloadSelf" feedback="momentary" text="This GUI again (CF.loadGUI(''))" fontSize={24} bg="#2a313b" radius={18}
              active={{ bg: '#3a434f' }} js="CF.loadGUI('')" />
      <Text x={80} y={560} w={1120} h={40} text="Back and forward: the panel's address bar (Settings, Ctrl+S: Address bar). Ctrl+R loads this GUI again from the server." color="#9aa4b1" fontSize={20} />
      <Text x={80} y={600} w={1120} h={40} text="Type an address: http://<server>:8019/lights/Lights.gui?page=Living" color="#9aa4b1" fontSize={20} />
    </Page>
  </Project>
);
