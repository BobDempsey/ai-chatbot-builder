/**
 * The documents the bot answers from: the demo corpus picker, the three ways to
 * add your own, and the indexing progress underneath.
 *
 * Progress is polled rather than animated. Each document carries a real state
 * from the server, and the poll runs only while at least one document is short
 * of `ready` or `failed`, then stops. A progress bar that keeps moving after the
 * work is done is worse than no progress bar, and a poll that keeps running
 * after the work is done costs requests for nothing.
 */
import {
  type Corpus,
  CORPUS_LABELS,
  type Doc,
  DEMO_DATA_LABEL,
  type DocumentState,
  MAX_UPLOAD_BYTES,
  corpusSchema,
  markdownUploadSchema,
  urlUploadSchema,
} from '@acb/schemas';
import { Badge, Button, Card, Input, Textarea } from '@acb/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, chooseCorpus, uploadFile, uploadMarkdown, uploadUrl } from './api';

/** How often the progress view asks again while something is still indexing. */
export const POLL_INTERVAL_MS = 1500;

const TERMINAL: DocumentState[] = ['ready', 'failed'];

const STATE_LABELS: Record<DocumentState, string> = {
  queued: 'Queued',
  extracting: 'Extracting text',
  embedding: 'Embedding',
  ready: 'Ready',
  failed: 'Failed',
};

/** Roughly how far through the pipeline each state is, for the bar's width. */
const STATE_PROGRESS: Record<DocumentState, number> = {
  queued: 10,
  extracting: 40,
  embedding: 75,
  ready: 100,
  failed: 100,
};

export interface DocumentsPanelProps {
  documents: Doc[];
  corpus: Corpus;
  onCorpusChange: (corpus: Corpus, documents: Doc[]) => void;
  onDocuments: (documents: Doc[]) => void;
  /** Reads the list again. The poll and every upload go through this. */
  refresh: () => Promise<Doc[]>;
}

export function DocumentsPanel({ documents, corpus, onCorpusChange, onDocuments, refresh }: DocumentsPanelProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const indexing = documents.some((document) => !TERMINAL.includes(document.state));

  useIndexingPoll(indexing, async () => {
    onDocuments(await refresh());
  });

  async function swap(next: Corpus) {
    setNotice(null);
    try {
      onCorpusChange(next, await chooseCorpus(next));
    } catch (error) {
      setNotice(messageOf(error, 'That document set could not be loaded. Try again.'));
    }
  }

  return (
    <Card className="acb:space-y-4">
      <div>
        <h2 className="acb:text-base acb:font-semibold acb:text-ink">Documents</h2>
        <p className="acb:mt-1 acb:text-xs acb:text-ink-muted">
          Every set below is {DEMO_DATA_LABEL.toLowerCase()}. Add your own with the forms underneath.
        </p>
      </div>

      <CorpusPicker corpus={corpus} onChoose={swap} />

      <UploadForms
        onUploaded={(document) => {
          onDocuments([document, ...documents.filter((existing) => existing.id !== document.id)]);
          setNotice(`${document.title} was accepted and is indexing.`);
        }}
        onFailure={setNotice}
      />

      {notice ? (
        <p role="status" className="acb:text-xs acb:text-ink-muted">
          {notice}
        </p>
      ) : null}

      <DocumentList documents={documents} />
    </Card>
  );
}

function CorpusPicker({ corpus, onChoose }: { corpus: Corpus; onChoose: (corpus: Corpus) => void }) {
  const id = useId();
  return (
    <div className="acb:space-y-1">
      <label htmlFor={id} className="acb:text-sm acb:font-medium acb:text-ink">
        Demo document set
      </label>
      <select
        id={id}
        value={corpus}
        onChange={(event) => onChoose(corpusSchema.parse(event.target.value))}
        className="acb:h-10 acb:w-full acb:rounded-md acb:border acb:border-line acb:bg-surface acb:px-3 acb:text-sm acb:text-ink"
      >
        {corpusSchema.options.map((option) => (
          <option key={option} value={option}>
            {CORPUS_LABELS[option]} ({DEMO_DATA_LABEL.toLowerCase()})
          </option>
        ))}
      </select>
    </div>
  );
}

function UploadForms({ onUploaded, onFailure }: { onUploaded: (document: Doc) => void; onFailure: (message: string) => void }) {
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { title: useId(), markdown: useId(), url: useId(), file: useId() };

  async function run(work: () => Promise<Doc>, after?: () => void) {
    setBusy(true);
    try {
      onUploaded(await work());
      after?.();
    } catch (error) {
      onFailure(messageOf(error, 'That document could not be added. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitMarkdown(event: React.FormEvent) {
    event.preventDefault();
    const parsed = markdownUploadSchema.safeParse({ title, markdown });
    if (!parsed.success) {
      onFailure('Give the document a title and some Markdown before adding it.');
      return;
    }
    await run(
      () => uploadMarkdown(parsed.data),
      () => {
        setTitle('');
        setMarkdown('');
      },
    );
  }

  async function submitUrl(event: React.FormEvent) {
    event.preventDefault();
    const parsed = urlUploadSchema.safeParse({ url });
    if (!parsed.success) {
      onFailure('That does not look like a full URL. Include https:// and try again.');
      return;
    }
    await run(
      () => uploadUrl(parsed.data),
      () => setUrl(''),
    );
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // The server refuses an oversized file too. Checking here saves the upload
    // and lets the reader see the limit before waiting for it.
    if (file.size > MAX_UPLOAD_BYTES) {
      onFailure(`That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1_000_000)} MB limit, so it was not uploaded.`);
      return;
    }
    void run(() => uploadFile(file));
  }

  return (
    <div className="acb:space-y-4">
      <form onSubmit={submitMarkdown} noValidate className="acb:space-y-2">
        <label htmlFor={ids.title} className="acb:text-sm acb:font-medium acb:text-ink">
          Paste Markdown
        </label>
        <Input id={ids.title} value={title} placeholder="Title" onChange={(event) => setTitle(event.target.value)} />
        <Textarea
          id={ids.markdown}
          rows={3}
          value={markdown}
          placeholder="# Refund policy"
          aria-label="Markdown"
          onChange={(event) => setMarkdown(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy}>
          Add Markdown
        </Button>
      </form>

      <form onSubmit={submitUrl} noValidate className="acb:space-y-2">
        <label htmlFor={ids.url} className="acb:text-sm acb:font-medium acb:text-ink">
          Add a help-center URL
        </label>
        <Input id={ids.url} value={url} placeholder="https://example.com/help" onChange={(event) => setUrl(event.target.value)} />
        <Button type="submit" size="sm" disabled={busy}>
          Fetch and index
        </Button>
      </form>

      <div className="acb:space-y-2">
        <label htmlFor={ids.file} className="acb:text-sm acb:font-medium acb:text-ink">
          Upload a PDF
        </label>
        <input
          id={ids.file}
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={pickFile}
          className="acb:w-full acb:text-sm acb:text-ink"
        />
      </div>
    </div>
  );
}

function DocumentList({ documents }: { documents: Doc[] }) {
  if (documents.length === 0) {
    return <p className="acb:text-sm acb:text-ink-muted">No documents yet. Add one above.</p>;
  }
  return (
    <ul className="acb:space-y-3">
      {documents.map((document) => (
        <li key={document.id} className="acb:space-y-1">
          <div className="acb:flex acb:flex-wrap acb:items-center acb:gap-2">
            <span className="acb:text-sm acb:font-medium acb:text-ink">{document.title}</span>
            <Badge>{STATE_LABELS[document.state]}</Badge>
            {document.seeded ? <Badge>{DEMO_DATA_LABEL}</Badge> : null}
          </div>
          <p className="acb:text-xs acb:text-ink-muted">
            {document.reference}
            {document.state === 'ready' ? ` · ${document.chunkCount} chunks` : ''}
            {document.failure ? ` · ${document.failure}` : ''}
          </p>
          <div
            role="progressbar"
            aria-label={`${document.title} indexing progress`}
            aria-valuenow={STATE_PROGRESS[document.state]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={STATE_LABELS[document.state]}
            className="acb:h-1.5 acb:w-full acb:overflow-hidden acb:rounded-full acb:bg-surface-muted"
          >
            <div
              className={document.state === 'failed' ? 'acb:h-full acb:bg-line' : 'acb:h-full acb:bg-accent'}
              style={{ width: `${STATE_PROGRESS[document.state]}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Polls while `active`, and stops as soon as it is not. The timer is chained
 * rather than set on an interval, so a slow response cannot stack requests, and
 * the effect's cleanup cancels the one in flight.
 */
function useIndexingPoll(active: boolean, tick: () => Promise<void>) {
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const run = async () => {
      await latest.current().catch(() => {
        // A failed poll is not worth a message. The next one carries the state.
      });
      if (!stopped) timer = setTimeout(run, POLL_INTERVAL_MS);
    };
    timer = setTimeout(run, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active]);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
