/**
 * One sentence for the screen. Node errors, viem errors, and our own errors
 * all come through here so a raw stack never replaces the explanation.
 * The phrase is scrubbed out if it ever leaked into a message.
 */
import { scrub } from './session';

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Something went wrong. Nothing was sent.';
  const cleaned = scrub(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return 'Something went wrong. Nothing was sent.';
  return cleaned.length > 700 ? `${cleaned.slice(0, 700)}…` : cleaned;
}
