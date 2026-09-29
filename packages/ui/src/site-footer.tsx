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
  /**
   * The width of the footer's content, matched to the page's own column so
   * their edges line up. Defaults to the landing page's `max-w-2xl`.
   */
  contentClassName?: string;
  className?: string;
}

const link =
  'acb:font-medium acb:text-ink acb:underline acb:underline-offset-4 acb:hover:text-ink-muted acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent';

export function SiteFooter({ aboutHref, contentClassName = 'acb:max-w-2xl', className }: SiteFooterProps) {
  return (
    // `mt-auto` pins it to the bottom of a short page, as long as the page's
    // container is a full-height flex column.
    <footer className={cn('acb:mt-auto acb:border-t acb:border-line', className)}>
      <div
        className={cn(
          'acb:mx-auto acb:flex acb:w-full acb:flex-wrap acb:items-center acb:justify-between acb:gap-3 acb:px-4 acb:py-6 acb:text-sm acb:text-ink-muted',
          contentClassName,
        )}
      >
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
