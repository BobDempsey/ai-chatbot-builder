/**
 * The About page's entry. It mounts the page and nothing else: no widget and
 * no session request, which the landing page's entry makes.
 */
import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { About } from './about';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <About />
      <Analytics />
    </StrictMode>,
  );
}
