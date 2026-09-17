/**
 * Slice C's landing page entry. Phase 0 leaves the shape the plan calls for,
 * a headline, a question box and starting prompts, with no behavior behind it.
 */
import { Button, Card, Input, themeStyle } from '@acb/ui';
import { DEFAULT_BOT_SETTINGS } from '@acb/schemas';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const PROMPTS = ['How do refunds work?', 'What is in the employee handbook?', 'What can I cook with chicken and rice?'];

function App() {
  return (
    <main style={themeStyle(DEFAULT_BOT_SETTINGS)} className="acb:mx-auto acb:max-w-2xl acb:space-y-6 acb:p-6 acb:pt-20">
      <h1 className="acb:text-3xl acb:font-semibold acb:text-ink">Ask your docs anything.</h1>
      <Card className="acb:space-y-3">
        <Input aria-label="Ask a question" placeholder="Ask a question" />
        <div className="acb:flex acb:flex-wrap acb:gap-2">
          {PROMPTS.map((prompt) => (
            <Button key={prompt} variant="outline" size="sm">
              {prompt}
            </Button>
          ))}
        </div>
      </Card>
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
