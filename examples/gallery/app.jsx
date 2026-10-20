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
import Orientation from './pages/Orientation.jsx';

export default (
  // built at 1280x800, and for phones: a 1400x1400 screen at 3x and a 1080x1920 one (a Nexus 5) at 2.5x, laid
  // out at 467x467 and 432x768 and scaled up by iViewer (as big as on a tablet); the pages lay themselves out from
  // the size (ui.grid) and scroll (ScrollArea)
  <Project name="iva-ui gallery" width={1280} height={800} orientation="both" sizes={['1400x1400@3x', '1080x1920@2.5x']} themes={['dark', 'light']}>
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
    {Orientation}
  </Project>
);
