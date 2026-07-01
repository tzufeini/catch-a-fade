/* Renders the source App Store assets from the CAF brand mark:
 *   assets/icon-only.png  1024×1024  (full-bleed square — Apple masks corners)
 *   assets/splash.png     2732×2732  (dark brand background, centered logo tile)
 *   assets/splash-dark.png 2732×2732 (same — brand is already dark)
 * `@capacitor/assets generate` then fans these out to every iOS size.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
await mkdir(OUT, { recursive: true });

const CREAM = '#F2ECDD', RED = '#B23A45', NAVY = '#1E3A66', DARK = '#0C0C0F';
const WHITE = '#FFFFFF', BLACK = '#15110D';   // new minimal mark: cream tile + black CAF on white
const SERIF = "Georgia, 'Times New Roman', Times, 'Apple Garamond', serif";

// Barber-pole diagonal stripe pattern (red / cream / navy).
function pole(id, scale) {
  const w = 18 * scale, h = 11 * scale, bar = 6 * scale, gap = 9 * scale;
  return `<pattern id="${id}" width="${w}" height="${h}" patternTransform="rotate(25)" patternUnits="userSpaceOnUse">
    <rect width="${w}" height="${h}" fill="${CREAM}"/>
    <rect width="${bar}" height="${h}" fill="${RED}"/>
    <rect x="${gap}" width="${bar}" height="${h}" fill="${NAVY}"/>
  </pattern>`;
}

// App icon: WHITE full-bleed background + centered cream rounded tile + black CAF.
// No barber-pole stripes — those stay in the in-app UI, not the icon. iOS masks the
// outer corners, so the white shows as a thin margin around the cream tile.
const ICON = 1024;
const iconMargin = Math.round(ICON * 0.045);
const iconTile = ICON - iconMargin * 2;
const iconR = Math.round(iconTile * 0.22);
const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">
  <rect width="${ICON}" height="${ICON}" fill="${WHITE}"/>
  <rect x="${iconMargin}" y="${iconMargin}" width="${iconTile}" height="${iconTile}" rx="${iconR}" fill="${CREAM}"/>
  <text x="${ICON / 2}" y="${ICON / 2}" font-family="${SERIF}" font-weight="700"
        font-size="392" fill="${BLACK}" text-anchor="middle" dominant-baseline="central"
        letter-spacing="4">CAF</text>
</svg>`;

// Splash: brand-dark canvas with a centered rounded icon tile.
// tile=400 (not 760): scaleAspectFill on tall phones magnifies a square splash,
// so 760 rendered ~60% of screen width. 400 lands at a normal ~140pt icon size.
const SP = 2732, tile = 400, r = Math.round(tile * 0.26), x = (SP - tile) / 2, y = (SP - tile) / 2;
const splashSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SP}" height="${SP}" viewBox="0 0 ${SP} ${SP}">
  <rect width="${SP}" height="${SP}" fill="${DARK}"/>
  <rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="${r}" fill="${CREAM}"/>
  <text x="${SP / 2}" y="${SP / 2}" font-family="${SERIF}" font-weight="700"
        font-size="${Math.round(278 * tile / 760)}" fill="${BLACK}" text-anchor="middle" dominant-baseline="central"
        letter-spacing="2">CAF</text>
</svg>`;

await sharp(Buffer.from(iconSVG)).png().toFile(join(OUT, 'icon-only.png'));
await sharp(Buffer.from(splashSVG)).png().toFile(join(OUT, 'splash.png'));
await sharp(Buffer.from(splashSVG)).png().toFile(join(OUT, 'splash-dark.png'));
console.log('Source assets written to assets/');
