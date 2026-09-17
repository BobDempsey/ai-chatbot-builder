/**
 * The questions the bot declined, with any address the asker left.
 *
 * This is the list the whole dashboard is pointed at: it names the document the
 * owner has not written yet. An entry with an email is a person waiting, so it
 * is marked rather than left to be spotted in a column of grey text.
 */
import type { UnansweredQuestion } from '@acb/schemas';
import { Badge, Card } from '@acb/ui';

export interface UnansweredPanelProps {
  questions: UnansweredQuestion[];
}

export function UnansweredPanel({ questions }: UnansweredPanelProps) {
  return (
    <Card className="acb:space-y-3">
      <div>
        <h2 className="acb:text-base acb:font-semibold acb:text-ink">Questions the bot could not answer</h2>
        <p className="acb:mt-1 acb:text-xs acb:text-ink-muted">Each one is a gap in the documents. Write these next.</p>
      </div>

      {questions.length === 0 ? (
        <p className="acb:text-sm acb:text-ink-muted">Nothing here. Every question so far was covered.</p>
      ) : (
        <ul className="acb:space-y-3">
          {questions.map((question) => (
            <li key={question.id} className="acb:space-y-1">
              <p className="acb:text-sm acb:text-ink">{question.question}</p>
              <p className="acb:flex acb:flex-wrap acb:items-center acb:gap-2 acb:text-xs acb:text-ink-muted">
                <span>{new Date(question.askedAt).toLocaleString()}</span>
                {question.email ? <Badge>Waiting on a reply: {question.email}</Badge> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
