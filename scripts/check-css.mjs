/**
 * Guards the one CSS rule the widget depends on: every class this project ships
 * is prefixed `acb:`, and no reset reaches the page.
 *
 * The widget mounts on sites nobody here controls. An unprefixed `.flex` would
 * collide with whatever the host already has, and a preflight reset would
 * restyle the host's own elements. Both are silent in development, where the
 * only page is ours, which is why this runs in CI against the built files.
 *
 * Usage: node scripts/check-css.mjs (after `pnpm build`)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APPS = ['dashboard', 'landing'];
const PREFIX = 'acb';

/** Selectors Tailwind emits for itself, which carry no class of ours. */
const ALLOWED = /^(:root|\*|::?[a-z-]+|@|html|body)/;

let failures = 0;

for (const app of APPS) {
  const dir = join('apps', app, 'dist', 'assets');
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.css'));
  } catch {
    console.error(`${app}: no built assets. Run pnpm build first.`);
    failures += 1;
    continue;
  }

  for (const file of files) {
    // Comments are stripped first: a URL in the banner looks like a selector.
    const css = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    const unprefixed = [...css.matchAll(/\.(-?[_a-zA-Z][\w\\:.-]*)/g)]
      .map((m) => m[1])
      .filter((cls) => !cls.startsWith(`${PREFIX}\\:`) && !cls.startsWith(`${PREFIX}:`) && !ALLOWED.test(cls));

    if (unprefixed.length > 0) {
      console.error(`${app}/${file}: ${unprefixed.length} unprefixed class selectors, first: ${[...new Set(unprefixed)].slice(0, 5)}`);
      failures += 1;
    }

    // Preflight's signature: the universal border-box reset.
    if (/(^|[,{])\s*\*\s*,?[^{]*\{[^}]*box-sizing:\s*border-box/.test(css)) {
      console.error(`${app}/${file}: a global reset reached the stylesheet. Preflight must stay off.`);
      failures += 1;
    }
  }
}

if (failures > 0) process.exit(1);
console.log('css check: every class is prefixed and no reset ships');
