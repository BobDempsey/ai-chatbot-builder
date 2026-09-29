/**
 * The footer on the landing page, the About page and the dashboard: the
 * copyright, a way back to the portfolio it belongs to (in a new tab, so the
 * demo stays open), the source, and the About page.
 *
 * The widget never carries it. It runs on customers' pages, where a link to
 * this project's author would be somebody else's footer.
 */
import { cn } from './cn';
import { SourceLink } from './source-link';

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
  // Rendered once per mount rather than pinned to a build date, so the year is
  // right on a site that stays deployed across New Year.
  const year = new Date().getFullYear();

  return (
    // `mt-auto` pins it to the bottom of a short page, as long as the page's
    // container is a full-height flex column.
    <footer className={cn('acb:mt-auto acb:border-t acb:border-line', className)}>
      <div
        className={cn(
          // The bottom padding clears the widget launcher, which floats over
          // the bottom-right corner and otherwise sits on top of the links.
          'acb:mx-auto acb:flex acb:w-full acb:flex-col acb:gap-3 acb:px-4 acb:pt-6 acb:pb-20 acb:text-sm acb:text-ink-muted acb:sm:flex-row acb:sm:items-center acb:sm:justify-between acb:sm:pb-6',
          contentClassName,
        )}
      >
        <p>
          &copy; {year} -{' '}
          <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className={link}>
            Bob Dempsey<span className="acb:sr-only"> (opens in a new tab)</span>
          </a>
        </p>
        <nav aria-label="About this project" className="acb:flex acb:items-center acb:gap-3">
          <a href={aboutHref} className={link}>
            About this app
          </a>
          <SourceLink />
        </nav>
      </div>
    </footer>
  );
}
