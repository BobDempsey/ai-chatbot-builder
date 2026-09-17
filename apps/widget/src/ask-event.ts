/**
 * The one name the entry script and the chat bundle both need, kept in a module
 * of its own so importing it costs the entry nothing.
 *
 * Any page may open the chat, optionally with a question already asked:
 *
 *   window.dispatchEvent(new CustomEvent('acb:ask', { detail: { question } }));
 *
 * The landing page's question box and its starting prompts send exactly this.
 * An empty question only opens the panel. Before the chat bundle exists the
 * entry handles the event; afterwards the panel does.
 */
export const ASK_EVENT = 'acb:ask';

export function questionOf(event: Event): string {
  const question = (event as CustomEvent<{ question?: unknown } | null>).detail?.question;
  return typeof question === 'string' ? question.trim() : '';
}

/** Opens the chat on whatever page the widget is embedded in. */
export function askWidget(question = ''): void {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question } }));
}
