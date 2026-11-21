/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Create a new phrase, make the user write it down, then encrypt it.
 *
 * The words are shown once, on purpose, because a backup that was never
 * written down is not a backup. They are not written to a log file. After
 * the keystore is saved we clear the visible screen. The terminal's
 * scrollback may still contain them; closing the window is the practical fix
 * on a shared computer.
 */
import { accountFromMnemonic } from '../account.js';
import { printRealFundsWarning } from '../banner.js';
import { createMnemonic } from '../hd.js';
import { encryptMnemonic, saveKeystore } from '../keystore.js';
import { keystorePath } from '../paths.js';
import { chooseFilePassword, confirmReplace, promptHidden, promptVisible } from '../prompt.js';

export async function createCommand(force: boolean): Promise<void> {
  printRealFundsWarning();
  const filePath = keystorePath();
  await confirmReplace(filePath, force);

  console.log('Generating 12 words from 16 random bytes (128 bits).');
  console.log('Those bits are the whole secret. The words are just a way to write the bits down.');
  const mnemonic = createMnemonic();
  const words = mnemonic.split(' ');

  console.log('');
  console.log('Write these words on paper, in order. Do not screenshot them.');
  console.log('');
  words.forEach((word, index) => {
    console.log(`${String(index + 1).padStart(2, ' ')}. ${word}`);
  });
  console.log('');
  console.log('One line, for checking the paper copy:');
  console.log(mnemonic);
  console.log('');

  const typed = await promptVisible('Type the 12 words back, separated by spaces: ');
  if (typed.trim().toLowerCase().split(/\s+/).join(' ') !== mnemonic) {
    throw new Error(
      'That did not match. Nothing was saved. The words above were not written to disk. ' +
        'If you already copied them onto paper, you can import them. Otherwise run create again for a new phrase.',
    );
  }

  const passphrase = await askPassphrase();
  console.log('Running scrypt to encrypt the words. A short pause is intentional.');
  const password = await chooseFilePassword(mnemonic);
  const file = encryptMnemonic(mnemonic, password, { usesPassphrase: passphrase.length > 0 });
  saveKeystore(file, filePath);

  const unlocked = accountFromMnemonic(mnemonic, 0, passphrase);
  console.clear();
  printRealFundsWarning();
  console.log('Keystore saved. The 12 words are not stored in plaintext.');
  console.log(`File:    ${filePath}`);
  console.log(`Path:    ${unlocked.path}`);
  console.log(`Address: ${unlocked.address}`);
  console.log('');
  console.log('The words will not be shown again. The paper backup is the recovery method.');
  console.log('Open the JSON file if you want to see that the words are not sitting in it.');
  if (passphrase.length > 0) {
    console.log('You set a BIP-39 passphrase. The 12 words without it open a different wallet.');
  }
  console.log('Closing this terminal clears the words from view. Scrollback may still hold them.');
}

async function askPassphrase(): Promise<string> {
  console.log('An optional BIP-39 passphrase is mixed into the seed. It is not one of the 12 words.');
  console.log('Press Enter to skip it. If you set one and forget it, the words alone open an empty wallet.');
  const answer = await promptVisible('Type yes to add a BIP-39 passphrase, or press Enter to skip: ');
  if (answer.trim() === '') return '';
  if (answer.trim().toLowerCase() !== 'yes') {
    throw new Error('Type yes, or press Enter to skip. Nothing was saved.');
  }

  const first = await promptHidden('BIP-39 passphrase: ');
  if (first.length === 0) {
    throw new Error('The passphrase was empty. Nothing was saved.');
  }
  const second = await promptHidden('Type the same BIP-39 passphrase again: ');
  if (first !== second) {
    throw new Error('The two passphrases did not match. Nothing was saved.');
  }
  return first;
}
