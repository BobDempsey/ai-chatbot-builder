/**
 * The conversation log: what was asked, what the bot said, and which documents
 * it drew on.
 *
 * Answers render through the same `Answer` component the preview and the widget
 * use, so a logged answer shows the citations exactly as the visitor saw them
 * rather than as a flattened string. The list collapses to one open exchange at
 * a time, which keeps a long log readable at 375px.
 */
import type { Conversation, Rating } from '@acb/schemas';
import { Answer, Button, Card } from '@acb/ui';
import { useState } from 'react';
import { RatingControls } from './rating-controls';

export interface ConversationsPanelProps {
  conversations: Conversation[];
  onRate: (messageId: string, rating: Rating) => Promise<void>;
}

const SURFACE_LABELS = { preview: 'Dashboard preview', widget: 'Embedded widget' } as const;

export function ConversationsPanel({ conversations, onRate }: ConversationsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card className="acb:space-y-3">
      <h2 className="acb:text-base acb:font-semibold acb:text-ink">Conversations</h2>
      {conversations.length === 0 ? (
        <p className="acb:text-sm acb:text-ink-muted">No conversations yet. Ask something in the preview above.</p>
      ) : null}

      <ul className="acb:space-y-3">
        {conversations.map((conversation) => {
          const open = openId === conversation.id;
          const first = conversation.messages.find((message) => message.role === 'user');
          return (
            <li key={conversation.id} className="acb:rounded-md acb:border acb:border-line acb:p-3">
              <Button
                variant="ghost"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : conversation.id)}
                className="acb:h-auto acb:w-full acb:justify-between acb:px-0 acb:py-1 acb:text-left"
              >
                <span className="acb:text-sm acb:font-medium acb:text-ink">{first?.content ?? 'Conversation'}</span>
                <span className="acb:text-xs acb:text-ink-muted">
                  {SURFACE_LABELS[conversation.surface]} · {new Date(conversation.startedAt).toLocaleDateString()}
                </span>
              </Button>

              {open ? (
                <div className="acb:mt-3 acb:space-y-4">
                  {conversation.messages.map((message) =>
                    message.role === 'user' ? (
                      <p key={message.id} className="acb:text-sm acb:font-medium acb:text-ink">
                        {message.content}
                      </p>
                    ) : (
                      <div key={message.id}>
                        <Answer text={message.content} citations={message.citations} />
                        <RatingControls messageId={message.id} rating={message.rating} onRate={onRate} />
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
