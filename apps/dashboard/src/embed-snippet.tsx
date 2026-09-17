/**
 * The one line that puts the bot on someone else's site.
 *
 * {@link embedSnippet} is the single place the tag's shape is written. The
 * widget reads its bot from `data-acb-bot` on its own `<script>` element, so
 * that attribute name is a contract between this slice and the widget slice,
 * and the test below pins it. Nothing else is required of the host page: no
 * stylesheet, no container element, no build step.
 *
 * The public id is carried rather than the session cookie, because a cookie is
 * not sent from a third-party page. That id grants asking questions and nothing
 * else.
 */
import { Button, Card } from '@acb/ui';
import { useState } from 'react';

/** The attribute the widget's entry script reads its bot id from. */
export const BOT_ID_ATTRIBUTE = 'data-acb-bot';

/** The file the tag loads: the small entry script, not the chat bundle. */
export const WIDGET_SCRIPT_PATH = '/widget.js';

export function embedSnippet(publicId: string, origin: string): string {
  const source = new URL(WIDGET_SCRIPT_PATH, origin).toString();
  return `<script src="${source}" ${BOT_ID_ATTRIBUTE}="${publicId}" async></script>`;
}

export interface EmbedSnippetProps {
  publicId: string;
  /** Where the widget is served from. Defaults to wherever the dashboard runs. */
  origin?: string;
}

export function EmbedSnippet({ publicId, origin }: EmbedSnippetProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const snippet = embedSnippet(publicId, origin ?? window.location.origin);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied('Copied. Paste it before the closing body tag on any page.');
    } catch {
      // A browser can refuse the clipboard outright, so the text stays on
      // screen and selectable rather than the button silently doing nothing.
      setCopied('Copying was blocked. Select the line above and copy it by hand.');
    }
  }

  return (
    <Card className="acb:space-y-2">
      <h2 className="acb:text-base acb:font-semibold acb:text-ink">Embed on your site</h2>
      <p className="acb:text-xs acb:text-ink-muted">One line, anywhere in the page. Nothing else to install.</p>
      <code
        data-testid="embed-snippet"
        className="acb:block acb:overflow-x-auto acb:rounded-md acb:bg-surface-muted acb:p-2 acb:font-mono acb:text-xs acb:text-ink"
      >
        {snippet}
      </code>
      <div className="acb:flex acb:items-center acb:gap-3">
        <Button size="sm" onClick={copy}>
          Copy script tag
        </Button>
        <p role="status" className="acb:text-xs acb:text-ink-muted">
          {copied}
        </p>
      </div>
    </Card>
  );
}
