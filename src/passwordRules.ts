/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The rules for the file password. The CLI asks in the terminal
 * (`src/prompt.ts`). The web app asks in a form. The sentences are the same
 * so a person who uses both sees one explanation.
 *
 * The password is not the 12 words. It only encrypts the copy on this
 * computer (a file for the CLI, IndexedDB for the page). Forgetting it is
 * fixed by importing the words. Forgetting the words is not fixable.
 */

export function assertFilePassword(password: string, mnemonic: string): void {
  if (password.length < 8) {
    throw new Error('Use at least 8 characters for the file password. Nothing was saved.');
  }
  if (password.normalize('NFC') === mnemonic.normalize('NFC')) {
    throw new Error('The file password must be different from the 12 words. Nothing was saved.');
  }
}

export function assertPasswordsMatch(first: string, second: string): void {
  if (first !== second) {
    throw new Error('The two passwords did not match. Nothing was saved.');
  }
}
