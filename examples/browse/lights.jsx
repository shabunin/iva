// The Lights GUI: two pages (Living, Kitchen) - a GUI link can name one with
// ?page= - and links back to the Home and Media GUIs.
import { Nav, PALETTE } from './components/Nav.jsx';

const Room = ({ name, other, bg }) => (
  <Page name={name} bg={bg}>
    <Nav title={`Lights: ${name}`} subtitle="A page of the Lights GUI. The address bar shows ?page= as pages flip." />
    <Button x={80} y={240} w={340} h={110} join={`${name}Toggle`} feedback="toggle" text="Ceiling" fontSize={26} bg="#2a313b" radius={18} active={{ bg: '#f1c40f', color: '#111' }} />
    <Button x={470} y={240} w={340} h={110} join={`${name}Lamp`} feedback="toggle" text="Lamp" fontSize={26} bg="#2a313b" radius={18} active={{ bg: '#f1c40f', color: '#111' }} />
    <Button x={860} y={240} w={340} h={110} join={`to${other}`} feedback="momentary" text={`${other} page`} fontSize={26} bg="#16a085" radius={18} active={{ bg: '#1abc9c' }} page={other} />
    <Button x={80} y={390} w={520} h={110} join={`${name}Home`} feedback="momentary" text="Home GUI" fontSize={26} bg="#2f6fd6" radius={18} active={{ bg: '#4a86e8' }} js="CF.loadGUI('../home/Home.gui')" />
    <Button x={680} y={390} w={520} h={110} join={`${name}Media`} feedback="momentary" text="Media GUI" fontSize={26} bg="#8e44ad" radius={18} active={{ bg: '#a569bd' }} js="CF.loadGUI('../media/Media.gui')" />
    <Text x={80} y={560} w={1120} h={40} text="The panel's Back goes to the GUI before, not the page before: pages are this GUI's own." color="#9aa4b1" fontSize={20} />
  </Page>
);

export default (
  <Project name="Lights" width={1280} height={800} joinBase={1000}>
    <Room name="Living" other="Kitchen" bg={PALETTE.lights} />
    <Room name="Kitchen" other="Living" bg="#1f2a1e" />
  </Project>
);
