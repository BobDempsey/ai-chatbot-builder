/**
 * The bubble: the only thing the entry script draws, and the only CSS it
 * carries. It is written by hand rather than with Tailwind because the entry
 * has to stay a few kilobytes, and the prefixed stylesheet arrives with the
 * chat bundle instead.
 *
 * The chat bundle re-renders the same markup and the same class name from
 * React, so the swap from static button to live component is invisible.
 */

/** What a screen reader and a tooltip call the bubble. */
export const BUBBLE_LABEL = 'Open the chat';

export const BUBBLE_CLASS = 'acb-bubble';

/**
 * A host page reaches into a shadow tree through the inheritable properties and
 * through nothing else, so this resets exactly those on `:host`. They carry
 * `!important` because a host page's own `* { font-family: x !important }`
 * would otherwise win on the host element and inherit down from there.
 * Descendants are left alone, so the chat bundle's utilities still style
 * everything inside.
 *
 * The host element covers the viewport but takes no pointer events, so the page
 * under it stays clickable. The bubble and the panel switch them back on.
 */
export const BUBBLE_CSS = `
:host {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483000 !important;
  display: block !important;
  pointer-events: none !important;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif !important;
  font-size: 16px !important;
  font-weight: 400 !important;
  font-style: normal !important;
  font-variant: normal !important;
  line-height: 1.5 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
  text-align: left !important;
  text-indent: 0 !important;
  text-transform: none !important;
  text-shadow: none !important;
  white-space: normal !important;
  direction: ltr !important;
  visibility: visible !important;
  color: #16181d !important;
  --acb-bubble-accent: #2563eb;
  --acb-bubble-ink: #ffffff;
}
.acb-root { position: absolute; inset: 0; pointer-events: none; }
.${BUBBLE_CLASS} {
  position: absolute;
  right: 16px;
  bottom: 16px;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: var(--acb-bubble-accent);
  color: var(--acb-bubble-ink);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.22);
  cursor: pointer;
}
.${BUBBLE_CLASS}:focus-visible { outline: 2px solid var(--acb-bubble-accent); outline-offset: 3px; }
.${BUBBLE_CLASS}[hidden] { display: none; }
`;

/** A speech bubble, inline so the entry fetches nothing else. */
const ICON = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>`;

export function createBubbleButton(doc: Document = document): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = BUBBLE_CLASS;
  button.setAttribute('aria-label', BUBBLE_LABEL);
  button.setAttribute('aria-haspopup', 'dialog');
  button.title = BUBBLE_LABEL;
  button.innerHTML = ICON;
  return button;
}
