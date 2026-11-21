/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * List receiving addresses from the saved phrase.
 *
 * Every line is the same words taken down a path that differs only in the
 * last number. Sharing an address does not reveal the words or the private
 * key. This command prints addresses only.
 */
import { accountFromMnemonic } from '../account.js';
import { withMnemonic } from '../unlock.js';
import type { Flags } from '../flags.js';

export async function addressesCommand(flags: Flags): Promise<void> {
  console.log('These addresses all come from one phrase. Only the last number in the path changes.');
  console.log('Private keys are not printed.');
  console.log('');

  await withMnemonic(async ({ mnemonic, passphrase }) => {
    for (let index = 0; index < flags.count; index += 1) {
      const unlocked = accountFromMnemonic(mnemonic, index, passphrase);
      console.log(`index ${index}`);
      console.log(`  path:    ${unlocked.path}`);
      console.log(`  address: ${unlocked.address}`);
    }
  });
}
