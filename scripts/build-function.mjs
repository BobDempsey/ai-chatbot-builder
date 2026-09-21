/**
 * Emits the API as a Vercel Function through the Build Output API.
 *
 * Two earlier shapes failed, and both failures are the reason for this one. A
 * `api/[[...route]].ts` file was compiled per file rather than bundled, so its
 * relative import into `apps/api/src` resolved to a path with no extension and
 * the function died on ERR_MODULE_NOT_FOUND. Generating that file during the
 * build instead did not help either: the `api/` directory is read from the
 * committed source, so a file the build writes is never seen, and the
 * deployment came back with no function at all.
 *
 * The Build Output API has neither problem. The build writes the function
 * itself, bundled, and Vercel serves what it finds in `.vercel/output`.
 *
 * Usage: node scripts/build-function.mjs (part of the Vercel build command)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const dir = '.vercel/output/functions/api.func';

mkdirSync(dir, { recursive: true });

await build({
  entryPoints: ['apps/api/src/vercel.ts'],
  outfile: `${dir}/index.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
});

writeFileSync(
  `${dir}/.vc-config.json`,
  `${JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      // Without this the platform buffers the whole reply and the answer
      // arrives in one piece, which is the one thing the chat must not do.
      supportsResponseStreaming: true,
    },
    null,
    2,
  )}\n`,
);

// The bundle is ESM and nothing else in the directory declares what it is.
writeFileSync(`${dir}/package.json`, `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

console.log(`bundled ${dir}/index.js`);
