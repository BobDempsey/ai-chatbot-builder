/**
 * Splitting a document into the units retrieval searches and citations point at.
 *
 * A citation has to open a section, so the heading in force where a chunk
 * starts is stored on the chunk rather than reconstructed when an answer is
 * written. Chunks break on headings first and on size second, because a break
 * that lands mid-topic retrieves worse than a slightly short chunk.
 *
 * The overlap carries the tail of the previous chunk forward, so a sentence
 * that straddles a boundary is still whole somewhere.
 */

export interface Chunk {
  ordinal: number;
  section: string;
  content: string;
}

export interface ChunkOptions {
  /** Characters a chunk aims for. Tuned against the seeded corpora in task 4.21. */
  targetChars: number;
  /** Characters of the previous chunk repeated at the start of the next one. */
  overlapChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { targetChars: 900, overlapChars: 150 };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;

interface Block {
  heading: string;
  text: string;
}

/** Paragraphs, each tagged with the nearest heading above it. */
function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let heading = '';
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ heading, text });
    buffer = [];
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const match = HEADING.exec(line);
    if (match) {
      flush();
      heading = match[2] as string;
      continue;
    }
    if (line.trim() === '') flush();
    else buffer.push(line);
  }
  flush();
  return blocks;
}

/** The last whole words of a chunk, used as the next chunk's run-up. */
function tailOf(text: string, chars: number): string {
  if (chars <= 0 || text.length <= chars) return text;
  const tail = text.slice(text.length - chars);
  const boundary = tail.search(/\s/);
  return boundary === -1 ? tail : tail.slice(boundary + 1);
}

/** Splits a single block that is already longer than the target. */
function splitLongBlock(text: string, options: ChunkOptions): string[] {
  const pieces: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > options.targetChars) {
      pieces.push(current);
      current = `${tailOf(current, options.overlapChars)} ${sentence}`.trim();
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

export function chunkMarkdown(markdown: string, options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = '';
  let current = '';

  const push = () => {
    if (!current.trim()) return;
    chunks.push({ ordinal: chunks.length, section: heading, content: current.trim() });
    current = '';
  };

  for (const block of toBlocks(markdown)) {
    // A new section always starts a new chunk: a citation names one section.
    if (block.heading !== heading) {
      push();
      heading = block.heading;
    }
    if (block.text.length > options.targetChars) {
      push();
      for (const piece of splitLongBlock(block.text, options)) {
        chunks.push({ ordinal: chunks.length, section: heading, content: piece });
      }
      continue;
    }
    if (current && current.length + block.text.length + 2 > options.targetChars) {
      const overlap = tailOf(current, options.overlapChars);
      push();
      current = overlap ? `${overlap}\n\n${block.text}` : block.text;
      continue;
    }
    current = current ? `${current}\n\n${block.text}` : block.text;
  }
  push();
  return chunks;
}
