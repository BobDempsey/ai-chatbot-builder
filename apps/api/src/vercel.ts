/**
 * The Hono app as a Vercel fetch handler.
 *
 * It lives in this workspace rather than beside the function file because
 * `hono/vercel` resolves here: pnpm links each package's dependencies into its
 * own `node_modules`, and `hono` belongs to `@acb/api`, not to the repo root.
 * The function at the root is a re-export for that reason alone.
 */
import { handle } from 'hono/vercel';
import { createProductionApi } from './production';

/** Created once per instance, so a warm function reuses its database pool. */
const api = createProductionApi();

export default handle(api);
