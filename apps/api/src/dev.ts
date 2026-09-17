/**
 * `pnpm dev:api`: serves the phase 0 fake on the port the slice was given, so
 * the dashboard and the widget have something to talk to before slice A lands.
 *
 * It reads no keys and touches no database, which is the point: a front end
 * slice can run with nothing configured. Ports are assigned per slice in
 * `docs/parallel-slices.md`, so two worktrees never fight over one.
 */
import { serve } from '@hono/node-server';
import { createFakeApi } from './fake/route';

const port = Number(process.env.PORT ?? 5180);

serve({ fetch: createFakeApi().fetch, port }, (info) => {
  console.log(`fake api on http://localhost:${info.port} (phase 0 stand-in, no database, no model)`);
});
