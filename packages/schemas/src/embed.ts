/**
 * The embed contract: the one line a customer pastes into their page.
 *
 * It lives here because two apps have to agree on it and neither can see the
 * other. The dashboard generates the tag, and the widget's entry script reads
 * what the tag carries. They disagreed at integration, one writing
 * `/widget.js` and the other serving `/embed.js`, which is exactly the kind of
 * drift a shared constant prevents.
 *
 * It carries no Zod, and it is exported as `@acb/schemas/embed` as well as from
 * the barrel, because the widget's entry script imports it. That entry is the
 * whole cost a page pays before anyone opens the chat, so pulling a validation
 * library through it would undo the reason the chat is split off at all.
 */

/** The attribute carrying the bot's public id. It grants asking questions only. */
export const BOT_ID_ATTRIBUTE = 'data-acb-bot';

/**
 * `light` or `dark`, on `<html>`. This project's own pages set it from the
 * theme toggle, and the widget copies it onto its shadow host. A customer's
 * page never sets it, so the widget there stays light.
 */
export const THEME_ATTRIBUTE = 'data-acb-theme';

/** Optional: overrides where the widget sends requests. Defaults to the page's origin. */
export const API_ORIGIN_ATTRIBUTE = 'data-acb-api';

/**
 * The entry script the tag loads. It is the small one; the chat bundle
 * downloads later, on first hover, focus or click.
 */
export const EMBED_SCRIPT_PATH = '/embed.js';

/**
 * `type="module"` is required rather than cosmetic: the entry uses a dynamic
 * import to defer the chat, and a classic script cannot carry one.
 */
export function embedSnippet(publicId: string, origin: string): string {
  const source = new URL(EMBED_SCRIPT_PATH, origin).toString();
  return `<script type="module" src="${source}" ${BOT_ID_ATTRIBUTE}="${publicId}"></script>`;
}
