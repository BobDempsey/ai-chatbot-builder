/**
 * Slice B's entry. It mounts `App` and nothing else, so the whole dashboard can
 * be rendered in a test without a DOM the browser built first.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
