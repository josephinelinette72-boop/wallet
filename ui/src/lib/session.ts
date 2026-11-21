/**
 * The unlocked secret, held in this module and nowhere else.
 *
 * It is not React state, so it is not sitting on a context object the rest
 * of the page can print by accident. It is not written to localStorage or
 * IndexedDB. Locking sets this back to empty. JavaScript cannot wipe a
 * string; it lives until the garbage collector takes it.
 *
 * A phrase session can derive many accounts. A private-key session is one
 * account, index 0. The password is not stored at all.
 */
import { accountFromSecret, type UnlockedAccount } from '@wallet/account';
import { scrubSecrets } from '@wallet/safety';
import type { Hex } from 'viem';

type Session =
  | { kind: 'mnemonic'; mnemonic: string; passphrase: string }
  | { kind: 'private-key'; privateKey: Hex };

let session: Session | null = null;

export function openSession(mnemonic: string, passphrase: string): void {
  session = { kind: 'mnemonic', mnemonic, passphrase };
}

export function openPrivateKeySession(privateKey: Hex): void {
  session = { kind: 'private-key', privateKey };
}

export function closeSession(): void {
  session = null;
}

export function hasSession(): boolean {
  return session !== null;
}

export function sessionKind(): 'mnemonic' | 'private-key' | null {
  return session?.kind ?? null;
}

/** Derive one account. The caller should drop the object when the click is done. */
export function accountAt(index: number): UnlockedAccount {
  if (!session) {
    throw new Error('The wallet is locked. Unlock it with the file password. Nothing was signed.');
  }
  return accountFromSecret(session, index);
}

/**
 * Remove the secret from a message before it is shown.
 * A short passphrase (under 8 characters) is not scrubbed by the shared
 * helper, on purpose: that helper ignores tiny strings so it does not eat
 * ordinary words. Do not put the passphrase in an error.
 */
export function scrub(text: string): string {
  if (!session) return text;
  if (session.kind === 'private-key') {
    return scrubSecrets(text, [session.privateKey, session.privateKey.slice(2)]);
  }
  return scrubSecrets(text, [session.mnemonic, session.passphrase]);
}
