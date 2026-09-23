/**
 * The bot's name, color, greeting and tone.
 *
 * The form validates with `botSettingsSchema` before anything is sent, which is
 * the same schema the API refuses with, so the message a reader sees is the
 * message the server would have given. A rejected save leaves the saved bot
 * untouched: the draft stays on screen to be corrected, and the preview chat
 * beside it keeps rendering the last values that were actually accepted.
 */
import { type BotSettings, botSettingsSchema, type Tone, toneSchema } from '@acb/schemas';
import { Button, Card, Input, Textarea } from '@acb/ui';
import { useId, useState } from 'react';
import { ApiError } from './api';

export interface SettingsPanelProps {
  settings: BotSettings;
  onSave: (settings: BotSettings) => Promise<void>;
}

type FieldErrors = Partial<Record<keyof BotSettings, string>>;

const TONE_LABELS: Record<Tone, string> = {
  friendly: 'Friendly',
  neutral: 'Neutral',
  formal: 'Formal',
};

export function SettingsPanel({ settings, onSave }: SettingsPanelProps) {
  const [draft, setDraft] = useState<BotSettings>(settings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    name: useId(),
    color: useId(),
    greeting: useId(),
    tone: useId(),
  };

  // A corpus swap or a reload replaces the saved bot, and the draft follows it
  // unless the reader is midway through an edit the server rejected. This is
  // adjusted during render rather than in an effect: a mount effect that is
  // still pending when the reader types runs after the keystroke and throws the
  // edit away, which a slow first render in CI made visible.
  const [synced, setSynced] = useState(settings);
  if (synced !== settings) {
    setSynced(settings);
    setDraft(settings);
  }

  const field = <K extends keyof BotSettings>(key: K, value: BotSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setStatus(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = botSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      const found: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BotSettings | undefined;
        if (key && !found[key]) found[key] = issue.message;
      }
      setErrors(found);
      setStatus('Nothing was saved. Fix the field named below and save again.');
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed.data);
      setErrors({});
      setStatus('Saved. The preview chat is using these settings.');
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : 'Nothing was saved. Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="acb:text-base acb:font-semibold acb:text-ink">Bot settings</h2>
      <p className="acb:mt-1 acb:text-xs acb:text-ink-muted">
        These apply to the preview below and to the widget on your own site.
      </p>

      <form onSubmit={submit} noValidate className="acb:mt-4 acb:space-y-4">
        <div className="acb:space-y-1">
          <label htmlFor={ids.name} className="acb:text-sm acb:font-medium acb:text-ink">
            Name
          </label>
          <Input
            id={ids.name}
            value={draft.name}
            onChange={(event) => field('name', event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          />
          <FieldError id={`${ids.name}-error`} message={errors.name} />
        </div>

        <div className="acb:space-y-1">
          <label htmlFor={ids.color} className="acb:text-sm acb:font-medium acb:text-ink">
            Accent color
          </label>
          <div className="acb:flex acb:items-center acb:gap-2">
            <Input
              id={ids.color}
              value={draft.accentColor}
              onChange={(event) => field('accentColor', event.target.value)}
              aria-invalid={errors.accentColor ? true : undefined}
              aria-describedby={errors.accentColor ? `${ids.color}-error` : undefined}
              className="acb:font-mono"
            />
            <span
              aria-hidden="true"
              className="acb:h-10 acb:w-10 acb:shrink-0 acb:rounded-md acb:border acb:border-line"
              style={{ background: /^#[0-9a-fA-F]{6}$/.test(draft.accentColor) ? draft.accentColor : 'transparent' }}
            />
          </div>
          <FieldError id={`${ids.color}-error`} message={errors.accentColor} />
        </div>

        <div className="acb:space-y-1">
          <label htmlFor={ids.greeting} className="acb:text-sm acb:font-medium acb:text-ink">
            Greeting
          </label>
          <Textarea
            id={ids.greeting}
            rows={3}
            value={draft.greeting}
            onChange={(event) => field('greeting', event.target.value)}
            aria-invalid={errors.greeting ? true : undefined}
            aria-describedby={errors.greeting ? `${ids.greeting}-error` : undefined}
          />
          <FieldError id={`${ids.greeting}-error`} message={errors.greeting} />
        </div>

        <div className="acb:space-y-1">
          <label htmlFor={ids.tone} className="acb:text-sm acb:font-medium acb:text-ink">
            Tone
          </label>
          <select
            id={ids.tone}
            value={draft.tone}
            onChange={(event) => field('tone', event.target.value as Tone)}
            className="acb:h-10 acb:w-full acb:rounded-md acb:border acb:border-line acb:bg-surface acb:px-3 acb:text-sm acb:text-ink"
          >
            {toneSchema.options.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABELS[tone]}
              </option>
            ))}
          </select>
        </div>

        <div className="acb:flex acb:items-center acb:gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving' : 'Save settings'}
          </Button>
          <p role="status" className="acb:text-xs acb:text-ink-muted">
            {status}
          </p>
        </div>
      </form>
    </Card>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="acb:text-xs acb:font-medium acb:text-ink">
      {message}
    </p>
  );
}
