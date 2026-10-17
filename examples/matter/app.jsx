import { Matter } from 'iva/drivers/matter';
import Probe from './pages/Probe.jsx';
import Devices from './pages/Devices.jsx';
import Commission from './pages/Commission.jsx';
import Control from './pages/Control.jsx';

/**
 * Matter devices from the panel: matter.js over a pool of ten UDP systems (works in official iViewer and in
 * iva's own runtime). The driver's devices: a node id each - the one the controller gives a device when it's
 * commissioned (the Commission page shows it); `address` where Bonjour can't find the node.
 */
const matter = (
  <Matter slots={10} devices={{
    lamp: { node: '1', cluster: 'OnOff', join: d('lamp') },
    level: { node: '1', cluster: 'LevelControl', join: a('level') },
    colour: { node: '1', cluster: 'ColorControl', hue: a('hue'), saturation: a('sat') },
  }} commission={{ code: s('setupCode'), go: d('commission'), status: s('matterStatus') }} found={s('matterFound')} />
);

export default (
  // built at 1280x800, and for a phone with a 1400x1400 screen (laid out at 467x467, scaled up 3x by iViewer)
  <Project name="iva matter" width={1280} height={800} sizes={['1400x1400@3x']}
           licenses={{ 'phone 1400x1400': '8437F51DCCD3F92EA6898A980ACA0259' }}>
    {Probe}
    {Devices}
    {Commission}
    {Control}
    {matter}
  </Project>
);
