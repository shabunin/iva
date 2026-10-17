// The components in this project's theme (change the accent, the font, ... here).
import { createUi } from 'iva/ui';

// the panel's size: screen(), the size being built (1280x800, or the phone's 1400x1400@3x)
export const ui = createUi();
export const t = ui.theme;
/** a narrow panel (a phone): a screen a tab */
export const narrow = t.panel.width < 700;
