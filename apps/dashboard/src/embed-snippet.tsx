/**
 * The one line that puts the bot on someone else's site.
 *
 * The tag's shape comes from `@acb/schemas`, because the widget's entry script
 * has to read what this generates and neither app can see the other. Nothing
 * else is required of the host page: no stylesheet, no container element, no
 * build step.
 *
 * The public id is carried rather than the session cookie, because a cookie is
 * not sent from a third-party page. That id grants asking questions and nothing
 * else.
 */
import { embedSnippet } from '@acb/schemas';
import { Button, Card } from '@acb/ui';
import { useState } from 'react';

export { BOT_ID_ATTRIBUTE, EMBED_SCRIPT_PATH, embedSnippet } from '@acb/schemas';

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
