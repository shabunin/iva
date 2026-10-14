/**
 * The fonts iViewer panels name (iOS / Android families, from GUI Designer's
 * font list) as browser fonts: each family is itself where it's installed,
 * else the closest installed sans / serif / mono - not the browser's default
 * serif. Loaded before the panel renders, so text measures right.
 */
import fonts from '../compiler/fonts.json';

const SANS = ['Helvetica Neue', 'Helvetica', 'Arial', 'Liberation Sans', 'DejaVu Sans', 'Noto Sans', 'Roboto'];
const SERIF = ['Georgia', 'Times New Roman', 'Liberation Serif', 'DejaVu Serif', 'Noto Serif'];
const MONO = ['Courier New', 'Menlo', 'Liberation Mono', 'DejaVu Sans Mono', 'Noto Sans Mono'];

function fallbacks(family: string): string[] {
  if (/mono|courier|menlo/i.test(family)) return MONO;
  if (/times|georgia|baskerville|palatino|didot|bodoni|garamond|cochin|hoefler|charter|typewriter|serif(?!.*sans)/i.test(family)) return SERIF;
  return SANS;
}

export async function installFonts() {
  const families = new Set<string>();
  for (const platform of Object.values(fonts as Record<string, Record<string, unknown>>)) for (const f of Object.keys(platform)) families.add(f);
  const css = [...families].map((f) => {
    const src = [f, ...fallbacks(f)].map((x) => `local(${JSON.stringify(x)})`).join(', ');
    return `@font-face { font-family: ${JSON.stringify(f)}; src: ${src}; }\n@font-face { font-family: ${JSON.stringify(f)}; font-weight: bold; src: ${[f, ...fallbacks(f)].map((x) => `local(${JSON.stringify(`${x} Bold`)})`).join(', ')}, ${src}; }`;
  });
  const style = document.createElement('style');
  style.textContent = css.join('\n');
  document.head.appendChild(style);
  await Promise.allSettled([...families].flatMap((f) => [document.fonts.load(`16px ${JSON.stringify(f)}`), document.fonts.load(`bold 16px ${JSON.stringify(f)}`)]));
}
