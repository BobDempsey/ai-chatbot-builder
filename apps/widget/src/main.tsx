/**
 * Slice C's widget entry. Phase 0 proves only the part that is hard to change
 * later: the widget renders inside a shadow root, with the prefixed stylesheet
 * injected into that root rather than into the host page.
 */
import { Answer, Button, themeStyle } from '@acb/ui';
import { DEFAULT_BOT_SETTINGS } from '@acb/schemas';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './styles.css?inline';

function Bubble() {
  return (
    <div style={themeStyle(DEFAULT_BOT_SETTINGS)} className="acb:fixed acb:right-4 acb:bottom-4 acb:space-y-2">
      <Answer text="Phase 0 shell. Slice C builds the bubble, the lazy loader and the chat here." />
      <Button>Ask a question</Button>
    </div>
  );
}

export function mount(host: HTMLElement): void {
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  const mountPoint = document.createElement('div');
  shadow.append(mountPoint);
  createRoot(mountPoint).render(
    <StrictMode>
      <Bubble />
    </StrictMode>,
  );
}

const root = document.getElementById('root');
if (root) mount(root);
