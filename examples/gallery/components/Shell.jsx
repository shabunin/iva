import { ui } from '../ui.js';

/** The gallery's sections: the side menu and the overview cards. */
export const sections = [
  { page: 'Overview', icon: 'table-cells-large', text: 'Overview' },
  { page: 'Buttons', icon: 'hand-pointer', text: 'Buttons & status', sub: 'IconButton, Tile, Badge, Stat, Icon' },
  { page: 'Controls', icon: 'sliders', text: 'Controls', sub: 'Toggle, Slider, Stepper, Segmented, SceneBar' },
  { page: 'Devices', icon: 'lightbulb', text: 'Devices', sub: 'Dimmer, Blinds' },
  { page: 'Navigation', icon: 'compass', text: 'Navigation & feedback', sub: 'Header, SideMenu, NavCard, ConfirmDialog' },
];

/** What every page has: the header, and the side menu it opens. */
export default function Shell({ section }) {
  return (
    <>
      <ui.Header title="iva/ui gallery" section={section} />
      <ui.SideMenu title="iva/ui gallery" subtitle="every component" items={sections} />
    </>
  );
}
