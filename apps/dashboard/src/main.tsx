/**
 * Slice B's entry. Phase 0 leaves it as a shell that proves the toolchain
 * works: the shared components render, the prefixed stylesheet loads, and the
 * fake route answers. Slice B replaces the body of `App` with the real screens.
 */
import { Answer, Button, Card, themeStyle } from '@acb/ui';
import { DEFAULT_BOT_SETTINGS } from '@acb/schemas';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main style={themeStyle(DEFAULT_BOT_SETTINGS)} className="acb:mx-auto acb:max-w-3xl acb:space-y-4 acb:p-6">
      <h1 className="acb:text-xl acb:font-semibold acb:text-ink">Dashboard</h1>
      <Card>
        <Answer text="Phase 0 shell. Slice B builds the settings, preview chat, logs, ratings and gaps here." />
      </Card>
      <Button>Shared button</Button>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
