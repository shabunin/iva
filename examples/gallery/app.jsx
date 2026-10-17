import Overview from './pages/Overview.jsx';
import Buttons from './pages/Buttons.jsx';
import Controls from './pages/Controls.jsx';
import Dials from './pages/Dials.jsx';
import Devices from './pages/Devices.jsx';
import Forms from './pages/Forms.jsx';
import Pickers from './pages/Pickers.jsx';
import Lists from './pages/Lists.jsx';
import Schedule from './pages/Schedule.jsx';
import Tables from './pages/Tables.jsx';
import Charts from './pages/Charts.jsx';
import DragDrop from './pages/DragDrop.jsx';
import Animations from './pages/Animations.jsx';
import Gestures from './pages/Gestures.jsx';
import Navigation from './pages/Navigation.jsx';
import Network from './pages/Network.jsx';

export default (
  // built at 1280x800, and for a phone with a 1400x1400 screen: laid out at 467x467 and scaled up 3x by
  // iViewer (as big as on a tablet); the pages lay themselves out from the size (ui.grid) and scroll (ScrollArea)
  <Project name="iva-ui gallery" width={1280} height={800} sizes={['1400x1400@3x']} themes={['dark', 'light']}
           licenses={{ 'phone 1400x1400': '8437F51DCCD3F92EA6898A980ACA0259' }}>
    {Overview}
    {Buttons}
    {Controls}
    {Dials}
    {Devices}
    {Forms}
    {Pickers}
    {Lists}
    {Schedule}
    {Tables}
    {Charts}
    {DragDrop}
    {Animations}
    {Gestures}
    {Navigation}
    {Network}
  </Project>
);
