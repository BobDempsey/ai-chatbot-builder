/**
 * The embed entry is what every page carrying the tag pays for, whether or not
 * anyone opens the chat. It has to stay small, and it is easy to make large by
 * accident: importing one constant from a barrel that also exports Zod schemas
 * took it from 2.2 KB to 27 KB gzipped at integration, because the bundler
 * followed the barrel.
 *
 * Usage: node scripts/check-embed-size.mjs (after `pnpm build`)
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/** Gzipped bytes. Slice C shipped 2.16 KB; this leaves room without inviting a library in. */
const LIMIT = 4096;

const entry = 'apps/widget/dist/embed.js';
let size;
try {
  size = gzipSync(readFileSync(entry)).length;
} catch {
  console.error(`${entry} is missing. Run pnpm build first.`);
  process.exit(1);
}

if (size > LIMIT) {
  console.error(`embed entry is ${size} bytes gzipped, over the ${LIMIT} limit.`);
  console.error('Something large was pulled into the entry. Check its imports, especially barrel files.');
  process.exit(1);
}
console.log(`embed entry: ${size} bytes gzipped, under ${LIMIT}`);
