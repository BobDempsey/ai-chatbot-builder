/**
 * The bot's appearance and voice. One shape drives the settings form, the
 * preview chat and the embedded widget, so what the owner saves is what a
 * visitor sees.
 */
import { z } from 'zod';

/** A CSS hex color. Anything else is refused with the field named. */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color, such as #2563eb.');

export const toneSchema = z.enum(['friendly', 'neutral', 'formal']);
export type Tone = z.infer<typeof toneSchema>;

export const botSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Give the bot a name.').max(40),
  accentColor: hexColorSchema,
  greeting: z.string().trim().min(1, 'Write a greeting.').max(200),
  tone: toneSchema,
});
export type BotSettings = z.infer<typeof botSettingsSchema>;

export const botSchema = botSettingsSchema.extend({
  id: z.uuid(),
  /** The id the embed script carries. It grants asking questions, nothing else. */
  publicId: z.uuid(),
});
export type Bot = z.infer<typeof botSchema>;

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  name: 'Northwind Support',
  accentColor: '#2563eb',
  greeting: 'Hi. Ask me anything about the docs I have been given.',
  tone: 'friendly',
};
