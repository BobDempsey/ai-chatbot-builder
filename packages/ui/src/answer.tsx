/**
 * How an answer is drawn, everywhere it is drawn: the dashboard's preview chat
 * and the embedded widget both render this, so the owner tests what a visitor
 * gets.
 *
 * Markdown with no raw HTML (`skipHtml`), GFM for tables, and citations as
 * numbered buttons rather than model-written links, because the numbers are
 * resolved server-side from the chunks that were actually retrieved.
 */
import type { Citation } from '@acb/schemas';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from './cn';

export interface AnswerProps {
  text: string;
  citations?: Citation[];
  /** Streaming is not finished, so the caret shows and sources stay hidden. */
  pending?: boolean;
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

/**
 * A wide table would otherwise widen the whole panel, which at 375px means the
 * page scrolls sideways. It scrolls inside its own region instead, and that
 * region takes focus so a keyboard reader can reach the scroll.
 */
const components: Components = {
  p: ({ children }) => <p className="acb:my-1.5 acb:first:mt-0 acb:last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="acb:my-1.5 acb:list-disc acb:space-y-1 acb:pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="acb:my-1.5 acb:list-decimal acb:space-y-1 acb:pl-5">{children}</ol>,
  code: ({ children }) => (
    <code className="acb:rounded acb:bg-surface-muted acb:px-1 acb:font-mono acb:text-[0.85em]">{children}</code>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="acb:font-medium acb:underline acb:underline-offset-2">
      {children}
    </a>
  ),
  table: ({ children }) => (
    // A scrollable region must be focusable, or a keyboard reader cannot scroll
    // a wide table. That is axe's scrollable-region-focusable rule, and the test
    // asserts it. Biome's noNoninteractiveTabindex is off for this file in
    // biome.json for the same reason.
    <section
      className="acb:my-2 acb:max-w-full acb:overflow-x-auto acb:rounded-md acb:border acb:border-line"
      aria-label="Table"
      tabIndex={0}
    >
      <table className="acb:w-full acb:border-collapse acb:text-xs">{children}</table>
    </section>
  ),
  thead: ({ children }) => <thead className="acb:bg-surface-muted">{children}</thead>,
  tr: ({ children }) => <tr className="acb:border-b acb:border-line acb:last:border-b-0">{children}</tr>,
  th: ({ children, style }) => (
    <th scope="col" style={style} className="acb:px-2 acb:py-1.5 acb:text-left acb:font-semibold acb:whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="acb:px-2 acb:py-1.5 acb:align-top acb:tabular-nums">
      {children}
    </td>
  ),
};

export function Answer({ text, citations = [], pending = false, onCitationClick, className }: AnswerProps) {
  return (
    <div className={cn('acb:text-sm acb:leading-relaxed acb:text-ink', className)}>
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
      {pending ? <span className="acb:sr-only">Answering</span> : null}
      {!pending && citations.length > 0 ? <Sources citations={citations} onCitationClick={onCitationClick} /> : null}
    </div>
  );
}

function Sources({ citations, onCitationClick }: { citations: Citation[]; onCitationClick?: (citation: Citation) => void }) {
  return (
    <div className="acb:mt-3 acb:border-t acb:border-line acb:pt-2">
      <p className="acb:mb-1 acb:text-xs acb:font-semibold acb:text-ink-muted">Sources</p>
      <ol className="acb:space-y-1">
        {citations.map((citation) => (
          <li key={citation.chunkId} className="acb:text-xs">
            <button
              type="button"
              onClick={() => onCitationClick?.(citation)}
              className="acb:text-left acb:underline acb:underline-offset-2 acb:hover:text-accent"
            >
              <span className="acb:font-semibold">[{citation.index}]</span> {citation.documentTitle}
              {citation.section ? `, ${citation.section}` : ''}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
