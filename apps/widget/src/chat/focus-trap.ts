/**
 * Keyboard containment for the open panel, written here rather than taken from
 * the shared `Dialog`.
 *
 * Radix's dialog is the right component in the dashboard, but it locks scroll
 * by setting styles on `document.body` and inserting a rule into
 * `document.head`. On a host page that is a visible change to somebody else's
 * document, which the widget spec forbids, so the widget traps focus itself and
 * leaves the page alone.
 *
 * Inside a shadow root the focused node is `shadowRoot.activeElement`, not
 * `document.activeElement`, which reports the host element instead.
 */
import { type RefObject, useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function focusableWithin(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.hasAttribute('hidden') && element.tabIndex !== -1,
  );
}

/** What has focus now, whether the panel sits in a shadow tree or the document. */
export function activeWithin(panel: HTMLElement): Element | null {
  const root = panel.getRootNode();
  return root instanceof ShadowRoot || root instanceof Document ? root.activeElement : null;
}

/**
 * Escape closes, and Tab stays inside while the panel is open. Both are bound
 * to the panel rather than the document, so a host page's own key handling is
 * untouched while the chat is shut.
 */
export function useFocusTrap(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = focusableWithin(element);
      if (stops.length === 0) return;
      const first = stops[0] as HTMLElement;
      const last = stops[stops.length - 1] as HTMLElement;
      const active = activeWithin(element);
      if (event.shiftKey && (active === first || !element.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [open, panel, onClose]);
}
