import { ui } from '../ui.js';

/** The example's sections: the side menu. */
export const sections = [
  { page: 'Probe', icon: 'stethoscope', text: 'Probe' },
  { page: 'Devices', icon: 'magnifying-glass', text: 'Devices' },
  { page: 'Commission', icon: 'key', text: 'Commission' },
  { page: 'Control', icon: 'lightbulb', text: 'Control' },
];

/** How the pages come: a section pushes in from the right, a tab fades in. */
export const enter = { type: 'push', from: 'right', time: 0.3, ease: 'easeInOut' };
export const tab = { type: 'fade', time: 0.15 };

/** What every page has: the header, and the side menu it opens. */
export default function Shell({ section }) {
  return (
    <>
      <ui.Header title="iva matter" section={section} />
      <ui.SideMenu title="iva matter" subtitle="matter.js over UDP systems" items={sections} />
    </>
  );
}
