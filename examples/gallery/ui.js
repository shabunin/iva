// The components in this project's theme (change the accent, the font, ... here).
import { createUi } from 'iva/ui';

// the panel's size: screen(), the size being built (1280x800, or one of app.jsx's sizes)
export const ui = createUi();
export const t = ui.theme;
/** a narrow panel (a phone): the cards one under another, each laid out for its width */
export const narrow = t.panel.width < 700;
