/**
 * The footer on the landing page and the dashboard: who built this, a way back
 * to the portfolio it belongs to, and the About section.
 *
 * The widget never carries it. It runs on customers' pages, where a link to
 * this project's author would be somebody else's footer.
 */
import { cn } from './cn';

export const PORTFOLIO_URL = 'https://bobdempsey83.com';

export interface SiteFooterProps {
  /** Where "About this app" points. The landing page passes `#about`, the dashboard `/#about`. */
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
          <a href={PORTFOLIO_URL} className={link}>
            bobdempsey83.com
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
