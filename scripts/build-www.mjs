/* Assembles the Capacitor web bundle (www/) from the app's source files.
 * Only the files the app actually needs are copied — the repo also holds
 * unrelated docs/decks that must NOT ship inside the iOS app.
 * Run via `npm run build` (which first bundles native-bridge.js with esbuild).
 */
import { mkdir, copyFile, rm, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');

// Files copied into the native web bundle. Add any new local asset here.
const ASSETS = [
  'index.html',
  'native-bridge.js',
  'apple-touch-icon.png',
];

async function exists(p) { try { await access(p); return true; } catch { return false; } }

await rm(WWW, { recursive: true, force: true });
await mkdir(WWW, { recursive: true });

for (const rel of ASSETS) {
  const src = join(ROOT, rel);
  if (!(await exists(src))) {
    console.warn('  [skip] missing ' + rel);
    continue;
  }
  const dest = join(WWW, rel);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log('  [copy] ' + rel);
}

console.log('www/ ready.');
