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
import Navigation from './pages/Navigation.jsx';

export default (
  <Project name="iva-ui gallery" width={1280} height={800} themes={['dark', 'light']}>
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
    {Navigation}
  </Project>
);
