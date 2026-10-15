import { ui } from '../ui.js';

/** The gallery's sections: the side menu and the overview cards. */
export const sections = [
  { page: 'Overview', icon: 'table-cells-large', text: 'Overview' },
  { page: 'Buttons', icon: 'hand-pointer', text: 'Buttons & status', sub: 'IconButton, Tile, Badge, Stat, Icon' },
  { page: 'Controls', icon: 'sliders', text: 'Controls', sub: 'Toggle, Slider, Stepper, Segmented, SceneBar' },
  { page: 'Dials', icon: 'circle-half-stroke', text: 'Dials', sub: 'Dial, Knob, Thermostat' },
  { page: 'Devices', icon: 'lightbulb', text: 'Devices', sub: 'Dimmer, Blinds, ColorPicker, Web' },
  { page: 'Forms', icon: 'square-check', text: 'Forms', sub: 'RadioGroup, CheckBox, SelectBox, SearchSelect, TextField' },
  { page: 'Pickers', icon: 'calendar-days', text: 'Pickers', sub: 'TimePicker, DatePicker, NumberField' },
  { page: 'Lists', icon: 'list', text: 'Lists', sub: 'DataList, ListRow, ScrollBox' },
  { page: 'Schedule', icon: 'clock', text: 'Schedule & security', sub: 'WeekDays, AlarmCard, PinPad' },
  { page: 'Tables', icon: 'table', text: 'Tables & alarms', sub: 'DataTable, AlarmTable, AlarmBanner' },
  { page: 'Charts', icon: 'chart-line', text: 'Charts & 3D', sub: 'Trend, Chart, WebApp (three.js)' },
  { page: 'DragDrop', icon: 'hand', text: 'Drag & drop', sub: 'DragDrop: items onto targets' },
  { page: 'Animations', icon: 'wand-magic-sparkles', text: 'Animations', sub: 'CF.setProperties, curves, subpage transitions' },
  { page: 'Navigation', icon: 'compass', text: 'Navigation & feedback', sub: 'Header, SideMenu, Breadcrumbs, Pager, Loader, ConfirmDialog' },
];

/** What every page has: the header, and the side menu it opens. */
export default function Shell({ section }) {
  return (
    <>
      <ui.Header title="iva/ui gallery" section={section} themeToggle />
      <ui.SideMenu title="iva/ui gallery" subtitle="every component" items={sections} />
    </>
  );
}
