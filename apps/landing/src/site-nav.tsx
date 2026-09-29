/**
 * The bar at the top of the landing page and the About page: the product
 * name, labelled RAG, then About, the dashboard and the theme toggle. It
 * sticks to the top of the viewport, above the page but below the lightbox.
 *
 * The name links home, so the About page has a way back without a separate
 * back link. `current` marks the page the reader is on for assistive tech.
 */
import { Badge, ThemeToggle } from '@acb/ui';
import { LayoutDashboard } from 'lucide-react';

const focus = 'acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent';

export function SiteNav({ current = 'home' }: { current?: 'home' | 'about' }) {
  return (
    <nav
      aria-label="Site"
      className="acb:sticky acb:top-0 acb:z-30 acb:flex acb:items-center acb:justify-between acb:gap-4 acb:border-b acb:border-line acb:bg-surface acb:px-4 acb:py-3"
    >
      <span className="acb:flex acb:items-center acb:gap-2">
        <a
          href="/"
          aria-current={current === 'home' ? 'page' : undefined}
          className={`acb:rounded-md acb:text-sm acb:font-semibold acb:text-ink acb:no-underline ${focus}`}
        >
          AI Chatbot Builder
        </a>
        <Badge title="Retrieval-augmented generation: it finds the relevant passages first, then answers from them">RAG</Badge>
      </span>
      <div className="acb:flex acb:items-center acb:gap-2">
        <a
          href="/about"
          aria-current={current === 'about' ? 'page' : undefined}
          className={`acb:hidden acb:h-10 acb:items-center acb:rounded-md acb:px-3 acb:text-sm acb:font-medium acb:text-ink acb:no-underline acb:hover:bg-surface-muted acb:sm:inline-flex ${focus}`}
        >
          About
        </a>
        <a
          href="/dashboard"
          className={`acb:inline-flex acb:h-10 acb:items-center acb:gap-2 acb:rounded-md acb:border acb:border-line acb:bg-surface acb:px-4 acb:text-sm acb:font-medium acb:text-ink acb:no-underline acb:hover:bg-surface-muted ${focus}`}
        >
          <LayoutDashboard aria-hidden="true" className="acb:size-4" />
          Open the dashboard
        </a>
        <ThemeToggle />
      </div>
    </nav>
  );
}
