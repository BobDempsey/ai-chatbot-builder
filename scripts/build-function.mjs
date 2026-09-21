/**
 * Bundles the API into the one Vercel Function.
 *
 * The first deploy failed on this: Vercel compiles each `api/*.ts` file on its
 * own and does not rewrite import specifiers, so a relative import reaching
 * into `apps/api/src` resolved to a path with no extension and the function
 * died with ERR_MODULE_NOT_FOUND before serving a request. Every import inside
 * `apps/api/src` is extensionless, which is ordinary TypeScript and not
 * something to rewrite for one deploy target.
 *
 * Bundling settles it. What lands in `api/` is a single file with no relative
 * imports left to resolve, and the workspace packages travel inside it rather
 * than through pnpm's symlinks, which the function's file tracing does not
 * follow either.
 *
 * Usage: node scripts/build-function.mjs (part of the Vercel build command)
 */
import { build } from 'esbuild';

const outfile = 'api/[[...route]].js';

await build({
  entryPoints: ['apps/api/src/vercel.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Vercel reads this off the built file to pick the runtime. The name is
  // deliberate: a bare `config` collides with a binding of that name inside
  // the bundle, and the file fails to parse.
  footer: {
    js: ['const __vercelFunctionConfig = { runtime: "nodejs" };', 'export { __vercelFunctionConfig as config };'].join('\n'),
  },
  logLevel: 'warning',
});

console.log(`bundled ${outfile}`);
