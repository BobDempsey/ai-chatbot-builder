/**
 * The API as a Node request listener, which is what the deployed function is.
 *
 * `getRequestListener` rather than `hono/vercel`: the function is emitted
 * through the Build Output API with the Node launcher, and that launcher calls
 * the default export as `(req, res)`. This also keeps streaming honest, since
 * the listener writes to the response as tokens arrive rather than buffering
 * an answer and sending it whole.
 *
 * It lives in this workspace rather than beside the build script because
 * `@hono/node-server` resolves here: pnpm links each package's dependencies
 * into its own `node_modules`, and that one belongs to `@acb/api`.
 */
import { getRequestListener } from '@hono/node-server';
import { createProductionApi } from './production';

/** Created once per instance, so a warm function reuses its database pool. */
const api = createProductionApi();

export default getRequestListener(api.fetch);
