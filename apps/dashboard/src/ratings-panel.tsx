/**
 * How the answers have been rated, in one line and one bar.
 *
 * The count moves the moment a thumb is pressed anywhere on the page, because
 * the summary and the thumbs read the same state in `App`. Waiting for a refetch
 * would leave the number contradicting the button next to it.
 */
import type { RatingSummary } from '@acb/schemas';
import { Card } from '@acb/ui';

export interface RatingsPanelProps {
  summary: RatingSummary;
}

export function RatingsPanel({ summary }: RatingsPanelProps) {
  const total = summary.up + summary.down;
  const share = total === 0 ? 0 : Math.round((summary.up / total) * 100);

  return (
    <Card className="acb:space-y-2">
      <h2 className="acb:text-base acb:font-semibold acb:text-ink">Ratings</h2>
      <p className="acb:text-sm acb:text-ink">
        {total === 0 ? (
          'No answers have been rated yet.'
        ) : (
          <>
            <span className="acb:font-semibold">{share}%</span> helpful, from {total} {total === 1 ? 'rating' : 'ratings'}.
          </>
        )}
      </p>
      <p className="acb:text-xs acb:text-ink-muted">
        <span data-testid="ratings-up">{summary.up} up</span> · <span data-testid="ratings-down">{summary.down} down</span>
      </p>
      {/* Decoration. The share and both counts are already stated above, so the
          bar repeating them as a meter would only be read out twice. */}
      <div aria-hidden="true" className="acb:h-1.5 acb:w-full acb:overflow-hidden acb:rounded-full acb:bg-surface-muted">
        <div className="acb:h-full acb:bg-accent" style={{ width: `${share}%` }} />
      </div>
    </Card>
  );
}
