/**
 * Assembles the three front-end builds into the one directory Vercel serves.
 *
 * Each app keeps its own `dist/` because other things read them there: the
 * embed size check reads `apps/widget/dist/embed.js`, and a per-app preview
 * still works. This copies rather than re-points their `outDir`, so neither of
 * those breaks.
 *
 * The layout is decided by what a customer pastes into their page. The embed
 * tag is `/embed.js` at the site root, so the widget's output goes to the root
 * and the dashboard moves under `/dashboard/` instead. The landing page is
 * last so nothing it owns is overwritten by a chunk name collision.
 *
 * Usage: node scripts/build-vercel.mjs (after `pnpm build`)
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist';

/** Source directory, then where it lands under `dist`. */
const PARTS = [
  ['apps/widget/dist', ''],
  ['apps/dashboard/dist', 'dashboard'],
  ['apps/landing/dist', ''],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const [source, target] of PARTS) {
  if (!existsSync(source)) {
    console.error(`${source} is missing. Run pnpm build first.`);
    process.exit(1);
  }
  cpSync(source, target ? join(OUT, target) : OUT, { recursive: true });
  console.log(`${source} -> ${target ? `${OUT}/${target}` : OUT}`);
}

if (!existsSync(join(OUT, 'embed.js'))) {
  console.error('dist/embed.js is missing, so every pasted script tag would 404.');
  process.exit(1);
}
if (!existsSync(join(OUT, 'index.html'))) {
  console.error('dist/index.html is missing, so the landing page would not serve.');
  process.exit(1);
}
if (!existsSync(join(OUT, 'dashboard', 'index.html'))) {
  console.error('dist/dashboard/index.html is missing, so the dashboard link would 404.');
  process.exit(1);
}
console.log('dist assembled');
