/**
 * Class joining, with later Tailwind utilities winning over earlier ones.
 * `tailwind-merge` is told about the `acb:` prefix, or it treats every class as
 * unknown and stops deduplicating.
 */
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({ prefix: 'acb' });

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
