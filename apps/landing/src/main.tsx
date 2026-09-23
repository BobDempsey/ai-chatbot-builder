/**
 * The landing page's entry. It mounts the page and nothing else; the widget is
 * created by the page itself, so this file stays the same whether the demo bot
 * comes from the fake route or the real one.
 */
import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './app';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Landing />
      <Analytics />
    </StrictMode>,
  );
}
