/**
 * src/compiler/fonts.json from GUI Designer's fontlist.xml: per platform,
 * font family -> style -> the font name the device knows ('Arial' Bold ->
 * 'Arial-BoldMT'), which is what a theme's `font-name` needs.
 *   node --import tsx tools/gen-fonts.ts [path/to/fontlist.xml]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseXml } from '../src/compiler/xml.ts';

const src = process.argv[2] ?? path.join(os.homedir(), '.wine-cf/drive_c/Program Files (x86)/CommandFusion/fontlist.xml');
const [root] = parseXml(fs.readFileSync(src, 'utf8'));
const attr = (n: { attrs: [string, string][] }, k: string) => n.attrs.find(([a]) => a === k)?.[1] ?? '';
const out: Record<string, Record<string, Record<string, string>>> = {};
for (const platform of root.children) {
  const key = attr(platform, 'name') === 'Apple iOS' ? 'ios' : attr(platform, 'name').toLowerCase();
  const fonts: Record<string, Record<string, string>> = (out[key] = {});
  for (const font of platform.children) {
    const styles: Record<string, string> = (fonts[attr(font, 'name')] = {});
    for (const style of font.children) styles[attr(style, 'name')] = (style.text ?? '').trim();
  }
}
const dest = path.resolve(import.meta.dirname, '../src/compiler/fonts.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`${path.relative(process.cwd(), dest)}: ${Object.entries(out).map(([p, f]) => `${p} ${Object.keys(f).length} families`).join(', ')}`);
