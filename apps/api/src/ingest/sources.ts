/**
 * Turning the three accepted sources into plain text.
 *
 * Each extractor either returns text or throws {@link UnreadableSourceError}
 * with one sentence naming the reason. The route turns that into a refusal and
 * creates no document, which is what "no partial document" means: a source is
 * read before any row exists.
 *
 * Both extractors are injectable so the upload route can be tested without a
 * PDF parser or a network.
 */
import { extractText } from 'unpdf';

export class UnreadableSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableSourceError';
  }
}

export type PdfExtractor = (bytes: Uint8Array) => Promise<string>;
export type UrlExtractor = (url: string) => Promise<{ title: string; text: string }>;

/** unpdf wraps pdf.js, which reads a PDF's text without a native dependency. */
export const extractPdfText: PdfExtractor = async (bytes) => {
  let text: string;
  try {
    const result = await extractText(bytes, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
  } catch {
    throw new UnreadableSourceError('That file could not be read as a PDF. Try exporting it again, or paste the text instead.');
  }
  const cleaned = text.replace(/[ \t]+\n/g, '\n').trim();
  if (!cleaned) {
    throw new UnreadableSourceError('That PDF has no text to index. A scanned page needs to be run through OCR first.');
  }
  return cleaned;
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(html: string): string {
  return html.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (ENTITIES[name]) return ENTITIES[name];
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return whole;
  });
}

/**
 * Readable text from a help-center page. Headings become Markdown headings so
 * the chunker keeps the page's sections, which is what a citation links to.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const stripped = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const main = /<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i.exec(stripped);
  const body = main?.[1] ?? /<body[^>]*>([\s\S]*?)<\/body>/i.exec(stripped)?.[1] ?? stripped;
  const text = decodeEntities(
    body
      .replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_whole, level: string, inner: string) => `\n\n${'#'.repeat(Number(level))} ${inner.replace(/<[^>]+>/g, ' ')}\n\n`,
      )
      .replace(/<(p|div|section|li|tr|br)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: decodeEntities(titleMatch?.[1] ?? '').trim(), text };
}

/** How long a help-center fetch may take before it is treated as unreachable. */
const URL_FETCH_TIMEOUT_MS = 8_000;

export const fetchUrlText: UrlExtractor = async (url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new UnreadableSourceError('Only http and https addresses can be fetched.');
  }
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
      headers: { accept: 'text/html,text/plain' },
    });
  } catch {
    throw new UnreadableSourceError('That page could not be reached. Check the address and try again.');
  }
  if (!response.ok) {
    throw new UnreadableSourceError('That page could not be reached. Check the address and try again.');
  }
  const html = await response.text();
  const { title, text } = htmlToText(html);
  if (!text) {
    throw new UnreadableSourceError('That page has no readable text to index.');
  }
  return { title: title || parsed.hostname + parsed.pathname, text };
};
