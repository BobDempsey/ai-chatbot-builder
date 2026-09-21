/**
 * The env guard: it refuses to boot with a clear message rather than failing at
 * the first request, and it never prints a value.
 */
import { describe, expect, it } from 'vitest';
import { MissingEnvError, readEnv } from './env';

const FULL_ENV = {
  OPENAI_API_KEY: 'sk-test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  SUPABASE_DB_URL: 'postgres://user:pass@host:5432/postgres',
};

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
    expect(error.missing).toEqual(['SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
    expect(error.message).toContain('.env.example');
    expect(error.message).not.toContain('sk-test');
  });
});
