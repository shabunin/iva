// The Media GUI: links to the other GUIs, a GUI opened by CF.openURL, a web
// page opened outside (the device's browser), the panel's default GUI.
import { Nav, PALETTE } from './components/Nav.jsx';

export default (
  <Project name="Media" width={1280} height={800} joinBase={1000}>
    <Page name="Media" bg={PALETTE.media}>
      <Nav title="Media" subtitle="CF.openURL: a GUI's URL is loaded here, a web page opens in the device's browser" />
      <Button x={80} y={240} w={520} h={110} join="toHome" feedback="momentary" text="Home GUI" fontSize={26} bg="#2f6fd6" radius={18}
              active={{ bg: '#4a86e8' }} js="CF.loadGUI('../home/Home.gui')" />
      <Button x={680} y={240} w={520} h={110} join="openLights" feedback="momentary" text="Lights by CF.openURL" fontSize={26} bg="#16a085" radius={18}
              active={{ bg: '#1abc9c' }} js="CF.openURL(CF.guiURL.replace(/media\/Media\.gui.*$/, 'lights/Lights.gui?page=Living'))" />
      <Button x={80} y={390} w={520} h={110} join="openWeb" feedback="momentary" text="commandfusion.com (outside)" fontSize={24} bg="#2a313b" radius={18}
              active={{ bg: '#3a434f' }} js="CF.openURL('https://www.commandfusion.com/')" />
      <Button x={680} y={390} w={520} h={110} join="toDefault" feedback="momentary" text="The panel's default GUI (CF.loadGUI(null))" fontSize={22} bg="#2a313b" radius={18}
              active={{ bg: '#3a434f' }} js="CF.loadGUI(null)" />
      <Text x={80} y={560} w={1120} h={40} text="CF.guiURL is where this GUI came from: links next to it are made from it." color="#9aa4b1" fontSize={20} />
    </Page>
  </Project>
);
