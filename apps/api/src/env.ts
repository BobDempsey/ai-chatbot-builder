/**
 * The environment the API needs, checked once at boot rather than discovered
 * at the first request. A missing key is a deployment mistake, and the clearest
 * moment to say so is before anything serves.
 *
 * Values are never logged. The message names which variables are missing and
 * nothing else.
 */
import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
});

export type Env = z.infer<typeof envSchema>;

export class MissingEnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `The API cannot start. Set ${missing.join(', ')} in .env (copy .env.example), ` +
        'or as Sensitive environment variables in the Vercel project.',
    );
    this.name = 'MissingEnvError';
  }
}

/** Throws {@link MissingEnvError} naming every variable that is missing. */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const missing = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();
  throw new MissingEnvError(missing);
}
