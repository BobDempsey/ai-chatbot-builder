/**
 * Phase 0's checks: the env guard refuses to boot with a clear message, and the
 * fake route honours the schemas well enough for slices B and C to build on.
 */
import { chatEventSchema, documentSchema, MAX_BODY_BYTES } from '@acb/schemas';
import { describe, expect, it } from 'vitest';
import { MissingEnvError, readEnv } from './env';
import { createFakeApi } from './fake/route';

const FULL_ENV = {
  OPENAI_API_KEY: 'sk-test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
};

const api = createFakeApi({ delayMs: 0 });

async function events(message: string) {
  const response = await api.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const text = await response.text();
  return text
    .trim()
    .split('\n')
    .map((l) => chatEventSchema.parse(JSON.parse(l)));
}

describe('env guard', () => {
  it('accepts a complete environment', () => {
    expect(readEnv(FULL_ENV).OPENAI_API_KEY).toBe('sk-test');
  });

  it('names every missing variable and never the values', () => {
    let thrown: unknown;
    try {
      readEnv({ OPENAI_API_KEY: 'sk-test' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MissingEnvError);
    const error = thrown as MissingEnvError;
    expect(error.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
    expect(error.message).toContain('.env.example');
    expect(error.message).not.toContain('sk-test');
  });
});

describe('fake answer route', () => {
  it('streams deltas, then citations, then done', async () => {
    const stream = await events('How do refunds work?');
    expect(stream.filter((e) => e.type === 'delta').length).toBeGreaterThan(1);
    expect(stream.at(-2)).toMatchObject({ type: 'citations' });
    expect(stream.at(-1)).toMatchObject({ type: 'done' });
  });

  it('declines a question the canned corpus does not cover', async () => {
    const stream = await events('Do you support SAML?');
    expect(stream).toHaveLength(1);
    expect(stream[0]).toMatchObject({ type: 'declined' });
  });

  it('refuses an oversized body before parsing it', async () => {
    const response = await api.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(413);
  });

  it('refuses an empty question', async () => {
    const response = await api.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('question') });
  });

  it('returns documents that satisfy the shared schema', async () => {
    const response = await api.request('/api/documents');
    const body = (await response.json()) as { documents: unknown[] };
    expect(body.documents.length).toBeGreaterThan(0);
    for (const doc of body.documents) expect(() => documentSchema.parse(doc)).not.toThrow();
  });

  it('refuses a malformed handoff email', async () => {
    const response = await api.request('/api/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: '00000000-0000-4000-8000-000000000050', email: 'not-an-email' }),
    });
    expect(response.status).toBe(400);
  });
});
