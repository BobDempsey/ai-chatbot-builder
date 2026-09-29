/**
 * The footer on the landing page, the About page and the dashboard: who built
 * this, a way back to the portfolio it belongs to (in a new tab, so the demo
 * stays open), and the About page.
 *
 * The widget never carries it. It runs on customers' pages, where a link to
 * this project's author would be somebody else's footer.
 */
import { cn } from './cn';

export const PORTFOLIO_URL = 'https://bobdempsey83.com';

export interface SiteFooterProps {
  /** Where "About this app" points: `/about` on every page that carries the footer. */
  aboutHref: string;
  className?: string;
}

const link =
  'acb:font-medium acb:text-ink acb:underline acb:underline-offset-4 acb:hover:text-ink-muted acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent';

export function SiteFooter({ aboutHref, className }: SiteFooterProps) {
  return (
    <footer className={cn('acb:border-t acb:border-line', className)}>
      <div className="acb:mx-auto acb:flex acb:max-w-6xl acb:flex-wrap acb:items-center acb:justify-between acb:gap-3 acb:px-4 acb:py-6 acb:text-sm acb:text-ink-muted">
        <p>
          Built by Bob Dempsey. More projects at{' '}
          <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className={link}>
            bobdempsey83.com<span className="acb:sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
        <a href={aboutHref} className={link}>
          About this app
        </a>
      </div>
    </footer>
  );
}
