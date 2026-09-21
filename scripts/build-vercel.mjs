/**
 * Assembles the three front-end builds and the routing table into the Build
 * Output API directory Vercel serves.
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
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '.vercel/output';
const STATIC = join(OUT, 'static');

/** Source directory, then where it lands under the static root. */
const PARTS = [
  ['apps/widget/dist', ''],
  ['apps/dashboard/dist', 'dashboard'],
  ['apps/landing/dist', ''],
];

const CORS = { 'access-control-allow-origin': '*' };

/**
 * `handle: filesystem` divides the table: everything above it runs on every
 * request, everything below it only when no file matched. The two rewrites
 * therefore cannot swallow a real asset under `/dashboard/assets`.
 */
const config = {
  version: 3,
  routes: [
    { src: '/embed\\.js', headers: { ...CORS, 'cache-control': 'public, max-age=300, must-revalidate' }, continue: true },
    {
      src: '/chat-[^/]+\\.js',
      headers: { ...CORS, 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    { handle: 'filesystem' },
    { src: '/api(/.*)?', dest: '/api' },
    { src: '/dashboard(/.*)?', dest: '/dashboard/index.html' },
  ],
  crons: [{ path: '/api/cron/sweep', schedule: '0 4 * * *' }],
};

rmSync(STATIC, { recursive: true, force: true });
mkdirSync(STATIC, { recursive: true });

for (const [source, target] of PARTS) {
  if (!existsSync(source)) {
    console.error(`${source} is missing. Run pnpm build first.`);
    process.exit(1);
  }
  cpSync(source, target ? join(STATIC, target) : STATIC, { recursive: true });
  console.log(`${source} -> ${target ? `${STATIC}/${target}` : STATIC}`);
}

writeFileSync(join(OUT, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);

if (!existsSync(join(STATIC, 'embed.js'))) {
  console.error('embed.js is missing, so every pasted script tag would 404.');
  process.exit(1);
}
if (!existsSync(join(STATIC, 'index.html'))) {
  console.error('index.html is missing, so the landing page would not serve.');
  process.exit(1);
}
if (!existsSync(join(STATIC, 'dashboard', 'index.html'))) {
  console.error('dashboard/index.html is missing, so the dashboard link would 404.');
  process.exit(1);
}
if (!existsSync(join(OUT, 'functions', 'api.func', 'index.js'))) {
  console.error('the api function is missing. Run scripts/build-function.mjs first.');
  process.exit(1);
}
console.log('build output assembled');
