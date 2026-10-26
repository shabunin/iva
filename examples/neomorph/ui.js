// The neumorphic components in this project's theme (change the accent, the font, ... here), and the layout
// for the screen being built: the 1280x800 tablet, the Titan 2 (1400x1400@3x: 467x467), the Nexus 5 (1080x1920@2.5x:
// 432x768) - each laid out both ways (<Project orientation="both">: screen() turned the second time), so the tablet
// upright is 800x1280 and the Nexus on its side 768x432.
import { screen } from 'iva';
import { createNeu } from './neu/index.jsx';

export const neu = createNeu();
export const t = neu.theme;

/** the size being laid out */
export const { width: W, height: H } = screen();
/**
 * stacked: a header, cards one under another (scrolling), the sections in a bar - a phone either way, a tablet
 * upright; a tablet on its side has the rail and the cards placed on it
 */
export const phone = W < 1000;
/** a phone on its side: the sections' bar down the left, the cards beside it */
export const side = phone && W > H;
/** a stacked page's frame: the header's height, the room the bar takes at the bottom - on its side, at the left */
export const frame = { top: 62, bar: side ? 0 : 86, left: side ? 86 : 0 };
/** a stacked page's columns: two where there's room (a tablet upright) */
export const cols = phone && !side && W >= 700 ? 2 : 1;
/** a stacked card's width */
export const CW = Math.floor((W - frame.left - 36 - (cols - 1) * 24) / cols);
/** a card's padding */
export const P = phone ? 22 : 28;
