import Overview from './pages/Overview.jsx';
import Buttons from './pages/Buttons.jsx';
import Controls from './pages/Controls.jsx';
import Dials from './pages/Dials.jsx';
import Home from './pages/Home.jsx';
import Forms from './pages/Forms.jsx';

export default (
  // 1280x800, and for phones: the Titan 2's 1400x1400 at 3x and the Nexus 5's 1080x1920 at 2.5x, laid out at 467x467
  // and 432x768 and scaled up by iViewer (pages lay themselves out from screen(): ui.js). Two looks, light and
  // dark: the moon button switches (IvaTheme.toggle())
  <Project name="neomorph" width={1280} height={800} sizes={['1400x1400@3x', '1080x1920@2.5x']} themes={['light', 'dark']}>
    {Overview}
    {Buttons}
    {Controls}
    {Dials}
    {Home}
    {Forms}
  </Project>
);
