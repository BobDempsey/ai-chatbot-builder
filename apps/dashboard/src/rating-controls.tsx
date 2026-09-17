/**
 * The thumbs on an answer, used by the preview chat and by the conversation
 * log, so a rating left in either place lands the same way.
 *
 * The choice shows immediately and the summary above moves with it, because a
 * round trip before the button changes state reads as a dropped click. A
 * refusal puts the previous choice back and says so.
 */
import type { Rating } from '@acb/schemas';
import { Button } from '@acb/ui';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from './api';

export interface RatingControlsProps {
  messageId: string;
  rating?: Rating;
  onRate: (messageId: string, rating: Rating) => Promise<void>;
}

export function RatingControls({ messageId, rating, onRate }: RatingControlsProps) {
  const [chosen, setChosen] = useState<Rating | undefined>(rating);
  const [failure, setFailure] = useState<string | null>(null);

  async function choose(next: Rating) {
    const previous = chosen;
    setChosen(next);
    setFailure(null);
    try {
      await onRate(messageId, next);
    } catch (error) {
      setChosen(previous);
      setFailure(error instanceof ApiError ? error.message : 'That rating was not recorded. Try again.');
    }
  }

  return (
    <div className="acb:mt-2 acb:flex acb:items-center acb:gap-1">
      <Thumb label="Good answer" active={chosen === 'up'} onClick={() => choose('up')}>
        <ThumbsUp aria-hidden="true" className="acb:h-4 acb:w-4" />
      </Thumb>
      <Thumb label="Poor answer" active={chosen === 'down'} onClick={() => choose('down')}>
        <ThumbsDown aria-hidden="true" className="acb:h-4 acb:w-4" />
      </Thumb>
      {failure ? <span className="acb:text-xs acb:text-ink-muted">{failure}</span> : null}
    </div>
  );
}

function Thumb({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? 'primary' : 'ghost'}
      size="sm"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="acb:h-8 acb:w-8 acb:px-0"
    >
      {children}
    </Button>
  );
}
