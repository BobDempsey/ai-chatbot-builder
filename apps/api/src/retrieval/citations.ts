/**
 * Turning the model's bracketed numbers into citations the client can open.
 *
 * The mapping happens on the server, from the retrieval set, so a citation
 * cannot point at anything retrieval did not return. A number outside that set
 * is deleted from the answer as it streams rather than shown, because the model
 * occasionally invents one and a citation a reader cannot follow is worse than
 * none.
 *
 * It works on the stream rather than on the finished answer, so text still
 * reaches the reader as it is written. Only a partial marker at the end of a
 * delta is held back, which is at most a few characters. Numbers are rewritten
 * to the order the answer first uses them, so a reader sees 1, 2, 3 with no gaps.
 */
import type { Citation } from '@acb/schemas';
import type { RetrievedChunk } from '../store/store';

const COMPLETE = /\[(\d{1,2})\]/g;
/** An opening bracket at the very end: a marker whose closing bracket has not arrived. */
const PARTIAL = /\[\d{0,2}$/;

export class CitationFilter {
  private pending = '';
  private readonly assigned = new Map<number, number>();
  private readonly used: Citation[] = [];

  constructor(private readonly chunks: RetrievedChunk[]) {}

  /** Rewrites the markers in one delta and returns the text safe to send now. */
  push(text: string): string {
    const combined = this.pending + text;
    const held = PARTIAL.exec(combined);
    const cut = held ? held.index : combined.length;
    this.pending = combined.slice(cut);
    return this.rewrite(combined.slice(0, cut));
  }

  /** Whatever is left once the model stops, with any unfinished marker dropped. */
  flush(): string {
    const rest = this.rewrite(this.pending);
    this.pending = '';
    return rest.replace(PARTIAL, '');
  }

  /** The sources the answer actually cited, numbered as the reader sees them. */
  citations(): Citation[] {
    return this.used;
  }

  private rewrite(text: string): string {
    return text.replace(COMPLETE, (_whole, digits: string) => {
      const source = Number(digits);
      const chunk = this.chunks[source - 1];
      if (!chunk) return '';
      const existing = this.assigned.get(source);
      if (existing) return `[${existing}]`;
      const index = this.used.length + 1;
      this.assigned.set(source, index);
      this.used.push({
        index,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        section: chunk.section,
        chunkId: chunk.chunkId,
      });
      return `[${index}]`;
    });
  }
}

export interface ResolvedAnswer {
  text: string;
  citations: Citation[];
}

/** The same rules applied to a finished answer, which is what the eval harness checks. */
export function resolveCitations(answer: string, chunks: RetrievedChunk[]): ResolvedAnswer {
  const filter = new CitationFilter(chunks);
  const text = filter.push(answer) + filter.flush();
  return {
    text: text
      .replace(/ {2,}/g, ' ')
      .replace(/ ([.,;:])/g, '$1')
      .trim(),
    citations: filter.citations(),
  };
}
