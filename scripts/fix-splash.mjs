/* Regenerates ONLY the launch splash with a normal-sized centered icon tile.
 * The default tile (760px on a 2732 canvas) rendered ~60% of screen width after
 * scaleAspectFill on tall phones — way too big. 400px lands at ~140pt (a normal
 * app-icon size). Writes straight into the Splash.imageset (light + dark).
 */
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMGSET = join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');

const CREAM = '#F2ECDD', RED = '#B23A45', NAVY = '#1E3A66', DARK = '#0C0C0F';
const SERIF = "Georgia, 'Times New Roman', Times, 'Apple Garamond', serif";

function pole(id, scale) {
  const w = 18 * scale, h = 11 * scale, bar = 6 * scale, gap = 9 * scale;
  return `<pattern id="${id}" width="${w}" height="${h}" patternTransform="rotate(25)" patternUnits="userSpaceOnUse">
    <rect width="${w}" height="${h}" fill="${CREAM}"/>
    <rect width="${bar}" height="${h}" fill="${RED}"/>
    <rect x="${gap}" width="${bar}" height="${h}" fill="${NAVY}"/>
  </pattern>`;
}

const SP = 2732;
const tile = 400;                          // was 760 — now a normal icon size
const r = Math.round(tile * 0.26);
const x = (SP - tile) / 2, y = (SP - tile) / 2;
const tband = Math.round(tile * 0.165);
const font = Math.round(278 * tile / 760); // keep CAF text proportional to tile

const splashSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SP}" height="${SP}" viewBox="0 0 ${SP} ${SP}">
  <defs>${pole('ps', 6)}
    <clipPath id="tile"><rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="${r}"/></clipPath>
  </defs>
  <rect width="${SP}" height="${SP}" fill="${DARK}"/>
  <g clip-path="url(#tile)">
    <rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="${CREAM}"/>
    <rect x="${x}" y="${y}" width="${tile}" height="${tband}" fill="url(#ps)"/>
    <rect x="${x}" y="${y + tile - tband}" width="${tile}" height="${tband}" fill="url(#ps)"/>
    <text x="${SP / 2}" y="${SP / 2}" font-family="${SERIF}" font-weight="700"
          font-size="${font}" fill="${NAVY}" text-anchor="middle" dominant-baseline="central"
          letter-spacing="2">CAF</text>
  </g>
</svg>`;

const png = await sharp(Buffer.from(splashSVG)).png().toBuffer();
const files = [
  'Default@1x~universal~anyany.png',
  'Default@2x~universal~anyany.png',
  'Default@3x~universal~anyany.png',
  'Default@1x~universal~anyany-dark.png',
  'Default@2x~universal~anyany-dark.png',
  'Default@3x~universal~anyany-dark.png',
];
for (const f of files) {
  await sharp(png).toFile(join(IMGSET, f));
  console.log('  [write]', f);
}
console.log(`Splash regenerated: tile ${tile}px (~140pt on screen).`);
