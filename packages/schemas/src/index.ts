/**
 * Every shape crossing the wire, defined once. The API validates requests with
 * these and the front ends build requests from them, so a rename breaks the
 * typecheck rather than production.
 *
 * Phase 0 owns this file. A slice that needs a new field adds it here on `main`
 * first, because more than one slice reads every shape below.
 */
export * from './chat';
export * from './embed';
export * from './documents';
export * from './settings';
export * from './feedback';
export * from './limits';
