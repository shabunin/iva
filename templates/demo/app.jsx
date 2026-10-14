import Home from './pages/Home.jsx';
import Settings from './pages/Settings.jsx';
import receiver from './systems.jsx';

export default (
  <Project name="{{name}}" device="iPad">
    {Home}
    {Settings}
    {receiver}
    <Script src="./scripts/main.js" />
  </Project>
);
