/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Ask for the file password, decrypt the words, and hand them to one
 * callback. The callback must not print them. The words are not returned
 * to the command that called this, except as whatever the callback itself
 * returns (an address, a signature, a transaction hash).
 *
 * JavaScript cannot wipe a string. The phrase exists in memory until the
 * garbage collector reclaims it. We keep the window small by not storing it
 * on an object the rest of the program can see.
 */
import { existsSync } from 'node:fs';
import { accountFromMnemonic, type UnlockedAccount } from './account.js';
import { decryptMnemonic, loadKeystore } from './keystore.js';
import { keystorePath } from './paths.js';
import { promptHidden } from './prompt.js';

export async function withMnemonic<T>(
  fn: (secrets: { mnemonic: string; passphrase: string }) => Promise<T> | T,
  cwd = process.cwd(),
): Promise<T> {
  const filePath = keystorePath(cwd);
  if (!existsSync(filePath)) {
    throw new Error(
      `No keystore at ${filePath}.\n` +
        'Create one with: npm run wallet -- create\n' +
        'Or import words you already wrote down: npm run wallet -- import',
    );
  }

  const file = loadKeystore(filePath);
  console.log(`Keystore: ${filePath}`);
  console.log('The file password decrypts the words on this computer. It is not sent to the network.');
  console.log('Running scrypt next. A short pause is the password stretching doing its job.');
  const password = await promptHidden('File password: ');
  const mnemonic = decryptMnemonic(file, password);

  let passphrase = '';
  if (file.usesPassphrase) {
    console.log('This keystore was created with a BIP-39 passphrase. That is a different secret from the file password.');
    console.log('The words alone, without this passphrase, open a different wallet.');
    passphrase = await promptHidden('BIP-39 passphrase: ');
  }

  return fn({ mnemonic, passphrase });
}

export async function unlockAccount(index: number, cwd = process.cwd()): Promise<UnlockedAccount> {
  return withMnemonic(({ mnemonic, passphrase }) => accountFromMnemonic(mnemonic, index, passphrase), cwd);
}
