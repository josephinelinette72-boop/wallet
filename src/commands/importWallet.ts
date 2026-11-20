/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Encrypt a phrase the user already has.
 *
 * This is the recovery path: new computer, same words, new file password.
 * The words are checked (word list + checksum) before we ask for a password,
 * so a typo fails before any file is written. We do not print the words back.
 */
import { accountFromMnemonic } from '../account.js';
import { printRealFundsWarning } from '../banner.js';
import { assertValidMnemonic } from '../hd.js';
import { encryptMnemonic, saveKeystore } from '../keystore.js';
import { keystorePath } from '../paths.js';
import { chooseFilePassword, confirmReplace, promptHidden, promptVisible } from '../prompt.js';

export async function importCommand(force: boolean): Promise<void> {
  printRealFundsWarning();
  const filePath = keystorePath();
  await confirmReplace(filePath, force);

  console.log('Type the words in order. They will be visible as you type. Extra spaces are fine.');
  const typed = await promptVisible('12-word phrase: ');
  const mnemonic = assertValidMnemonic(typed);
  console.log('Checksum OK. These words are a valid BIP-39 phrase.');

  console.log('If these words were created with a BIP-39 passphrase, you must enter that same passphrase.');
  console.log('Press Enter if there was no passphrase.');
  const passphrase = await promptHidden('BIP-39 passphrase (Enter for none): ');

  console.log('Running scrypt to encrypt the words. A short pause is intentional.');
  const password = await chooseFilePassword(mnemonic);
  const file = encryptMnemonic(mnemonic, password, { usesPassphrase: passphrase.length > 0 });
  saveKeystore(file, filePath);

  const unlocked = accountFromMnemonic(mnemonic, 0, passphrase);
  console.log('');
  console.log('Keystore saved. The words are not stored in plaintext.');
  console.log(`File:    ${filePath}`);
  console.log(`Path:    ${unlocked.path}`);
  console.log(`Address: ${unlocked.address}`);
  console.log('Compare this address with the wallet you copied the words from.');
  console.log('A different address usually means a different passphrase, or a different derivation path.');
}
