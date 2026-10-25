// The neumorphic components in this project's theme (change the accent, the font, ... here), and the layout
// for the screen being built: the 1280x800 tablet, the Titan 2 (1400x1400@3x: 467x467), the Nexus 5 (1080x1920@2.5x: 432x768).
import { screen } from 'iva';
import { createNeu } from './neu/index.jsx';

export const neu = createNeu();
export const t = neu.theme;

/** the size being laid out */
export const { width: W, height: H } = screen();
/** a phone: a header, cards one under another (scrolling), the sections in a bar at the bottom */
export const phone = W < 700;
/** a phone's frame: the header's height, the room the bottom bar takes */
export const frame = { top: 62, bar: 86 };
/** a card's padding */
export const P = phone ? 22 : 28;
