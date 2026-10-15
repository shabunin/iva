// The panel's icons (a dial: track, value, knob), for the desktop bundle and Android's densities.
//   node panel/scripts/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tauri = path.resolve(here, '../src-tauri');
const res = path.join(tauri, 'gen/android/app/src/main/res');

const BG = '#14181C';
// the ring: 270 deg of track, 180 of it lit, the knob where it ends (cx, cy, r in a 1024 box)
const ring = (cx, cy, r, w) => {
  const c = 2 * Math.PI * r;
  const end = (135 + 180) * Math.PI / 180;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2C333A" stroke-width="${w}" stroke-linecap="round"
            stroke-dasharray="${c * 0.75} ${c}" transform="rotate(135 ${cx} ${cy})"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#00A884" stroke-width="${w}" stroke-linecap="round"
            stroke-dasharray="${c * 0.5} ${c}" transform="rotate(135 ${cx} ${cy})"/>
          <circle cx="${cx + r * Math.cos(end)}" cy="${cy + r * Math.sin(end)}" r="${w * 0.72}" fill="#FFFFFF"/>`;
};
const svg = {
  square: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="224" fill="${BG}"/>${ring(512, 512, 300, 72)}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="512" fill="${BG}"/>${ring(512, 512, 290, 70)}</svg>`,
  // an adaptive icon's foreground: the ring alone, inside the middle 2/3 (the part every mask keeps)
  fore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${ring(512, 512, 210, 52)}</svg>`,
};
const png = (s, size) => new Resvg(s, { fitTo: { mode: 'width', value: size } }).render().asPng();
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

for (const [name, size] of [['32x32.png', 32], ['128x128.png', 128], ['128x128@2x.png', 256], ['icon.png', 512]]) {
  write(path.join(tauri, 'icons', name), png(svg.square, size));
}
for (const [dpi, n] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  write(path.join(res, `mipmap-${dpi}/ic_launcher.png`), png(svg.square, n));
  write(path.join(res, `mipmap-${dpi}/ic_launcher_round.png`), png(svg.round, n));
  write(path.join(res, `mipmap-${dpi}/ic_launcher_foreground.png`), png(svg.fore, Math.round(n * 2.25)));
}
console.log('icons written');
