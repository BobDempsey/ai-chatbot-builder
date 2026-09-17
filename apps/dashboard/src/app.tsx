/**
 * The dashboard itself: one screen holding the bot's settings, a live preview
 * beside them, the documents behind the answers, and what visitors did with
 * them.
 *
 * State lives here rather than in each panel because the panels are views of
 * one workspace. Saving settings retints the preview, a document reaching
 * `ready` changes what the preview says it can answer from, a thumb pressed in
 * the log moves the ratings summary, and a declined question in the preview
 * appears in the unanswered list. Each of those is one piece of state read by
 * two panels, so none of them needs a reload.
 */
import {
  type Bot,
  type BotSettings,
  type Conversation,
  type Corpus,
  DEFAULT_CORPUS,
  type Doc,
  type Rating,
  type RatingSummary,
  type UnansweredQuestion,
} from '@acb/schemas';
import { themeStyle } from '@acb/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { ConversationsPanel } from './conversations-panel';
import { DocumentsPanel } from './documents-panel';
import { EmbedSnippet } from './embed-snippet';
import { PreviewChat } from './preview-chat';
import { RatingsPanel } from './ratings-panel';
import { SettingsPanel } from './settings-panel';
import { UnansweredPanel } from './unanswered-panel';

export function App() {
  const [bot, setBot] = useState<Bot | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [corpus, setCorpus] = useState<Corpus>(DEFAULT_CORPUS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [summary, setSummary] = useState<RatingSummary>({ up: 0, down: 0 });
  const [unanswered, setUnanswered] = useState<UnansweredQuestion[]>([]);
  /**
   * What has already been rated, held in a ref rather than state: only the
   * summary is drawn from it, and a ref cannot be double-counted by an updater
   * React runs twice.
   */
  const chosen = useRef<Record<string, Rating>>({});
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.getBot(), api.getDocuments(), api.getConversations(), api.getRatings(), api.getUnanswered()])
      .then(([loadedBot, loadedDocuments, loadedConversations, loadedRatings, loadedQuestions]) => {
        if (!live) return;
        setBot(loadedBot);
        setDocuments(loadedDocuments);
        setConversations(loadedConversations);
        setSummary(loadedRatings);
        setUnanswered(loadedQuestions);
        chosen.current = ratingsAlreadyLeft(loadedConversations);
      })
      .catch((error: unknown) => {
        if (live) setLoadFailure(error instanceof api.ApiError ? error.message : 'The dashboard could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(async (settings: BotSettings) => {
    setBot(await api.saveBot(settings));
  }, []);

  /**
   * A rating is recorded first and counted second, so a refusal never leaves the
   * summary claiming something the server did not take. Re-rating the same
   * answer moves the count across rather than adding to it.
   */
  const rate = useCallback(async (messageId: string, rating: Rating) => {
    await api.rate({ messageId, rating });
    const previous = chosen.current[messageId];
    if (previous === rating) return;
    chosen.current = { ...chosen.current, [messageId]: rating };
    setSummary((counts) => ({
      up: counts.up + (rating === 'up' ? 1 : 0) - (previous === 'up' ? 1 : 0),
      down: counts.down + (rating === 'down' ? 1 : 0) - (previous === 'down' ? 1 : 0),
    }));
  }, []);

  const refreshUnanswered = useCallback(() => {
    api.getUnanswered().then(setUnanswered).catch(noop);
    api.getConversations().then(setConversations).catch(noop);
  }, []);

  if (loadFailure) {
    return (
      <main className="acb:mx-auto acb:max-w-2xl acb:p-6">
        <h1 className="acb:text-xl acb:font-semibold acb:text-ink">Dashboard</h1>
        <p className="acb:mt-2 acb:text-sm acb:text-ink">{loadFailure}</p>
      </main>
    );
  }

  if (!bot) {
    return (
      <main className="acb:mx-auto acb:max-w-2xl acb:p-6">
        <h1 className="acb:text-xl acb:font-semibold acb:text-ink">Dashboard</h1>
        <p role="status" className="acb:mt-2 acb:text-sm acb:text-ink-muted">
          Loading your workspace.
        </p>
      </main>
    );
  }

  return (
    <main style={themeStyle(bot)} className="acb:mx-auto acb:max-w-6xl acb:space-y-6 acb:p-4 acb:sm:p-6">
      <header>
        <h1 className="acb:text-xl acb:font-semibold acb:text-ink">{bot.name}</h1>
        <p className="acb:mt-1 acb:text-sm acb:text-ink-muted">Configure the bot, try it, and read back what visitors asked.</p>
      </header>

      <div className="acb:grid acb:gap-6 acb:lg:grid-cols-2">
        <div className="acb:space-y-6">
          <SettingsPanel settings={bot} onSave={save} />
          <DocumentsPanel
            documents={documents}
            corpus={corpus}
            onCorpusChange={(next, loaded) => {
              setCorpus(next);
              setDocuments(loaded);
            }}
            onDocuments={setDocuments}
            refresh={api.getDocuments}
          />
          <EmbedSnippet publicId={bot.publicId} />
        </div>

        <div className="acb:space-y-6">
          <PreviewChat settings={bot} documents={documents} onRate={rate} onDeclined={refreshUnanswered} />
          <RatingsPanel summary={summary} />
          <ConversationsPanel conversations={conversations} onRate={rate} />
          <UnansweredPanel questions={unanswered} />
        </div>
      </div>
    </main>
  );
}

function ratingsAlreadyLeft(conversations: Conversation[]): Record<string, Rating> {
  const chosen: Record<string, Rating> = {};
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.rating) chosen[message.id] = message.rating;
    }
  }
  return chosen;
}

function noop(): void {
  // A background refresh that fails leaves the previous list on screen.
}
