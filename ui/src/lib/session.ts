/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The unlocked phrase, held in this module and nowhere else.
 *
 * It is not React state, so it is not sitting on a context object the rest
 * of the page can print by accident. It is not written to localStorage or
 * IndexedDB. Locking sets this back to empty. JavaScript cannot wipe a
 * string; it lives until the garbage collector takes it. That is the same
 * limit the CLI documents in `src/unlock.ts`.
 *
 * The password is not stored at all. scrypt already checked it.
 */
import { accountFromMnemonic, type UnlockedAccount } from '@wallet/account';
import { scrubSecrets } from '@wallet/safety';

type Session = {
  mnemonic: string;
  passphrase: string;
};

let session: Session | null = null;

export function openSession(mnemonic: string, passphrase: string): void {
  session = { mnemonic, passphrase };
}

export function closeSession(): void {
  session = null;
}

export function hasSession(): boolean {
  return session !== null;
}

/** Derive one account. The caller should drop the object when the click is done. */
export function accountAt(index: number): UnlockedAccount {
  if (!session) {
    throw new Error('The wallet is locked. Unlock it with the file password. Nothing was signed.');
  }
  return accountFromMnemonic(session.mnemonic, index, session.passphrase);
}

/**
 * Remove the phrase from a message before it is shown.
 * A short passphrase (under 8 characters) is not scrubbed by the shared
 * helper, on purpose: that helper ignores tiny strings so it does not eat
 * ordinary words. Do not put the passphrase in an error.
 */
export function scrub(text: string): string {
  if (!session) return text;
  return scrubSecrets(text, [session.mnemonic, session.passphrase]);
}
