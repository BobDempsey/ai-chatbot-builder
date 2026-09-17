/**
 * Guards the rule the widget depends on: every class this project ships is
 * prefixed `acb:`.
 *
 * The widget mounts on sites nobody here controls, where an unprefixed `.flex`
 * would collide with whatever the host already has. That is silent in
 * development, where the only page is ours, which is why this runs in CI
 * against the built files.
 *
 * The base layer in `@acb/ui/base.css` is deliberately not checked here. The
 * dashboard and the landing page own their whole document, so restating the
 * parts of preflight the components need is correct there. The widget applies
 * the same layer inside its shadow root, and what guards that is its own test:
 * it mounts on a hostile page and asserts `document.head` gained nothing and no
 * host element changed.
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
  }
}

if (failures > 0) process.exit(1);
console.log('css check: every class this project ships is prefixed');
