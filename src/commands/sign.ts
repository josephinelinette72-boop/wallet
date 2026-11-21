/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * EIP-191 personal signature.
 *
 * The signature proves the private key for this address saw this exact text.
 * It does not move ETH. The hash printed under it is what ECDSA actually
 * signed: keccak256 of the Ethereum message prefix plus the text.
 */
import { printRealFundsWarning } from '../banner.js';
import type { Flags } from '../flags.js';
import { signPersonalMessage } from '../messages.js';
import { unlockAccount } from '../unlock.js';

export async function signCommand(flags: Flags): Promise<void> {
  if (flags.message === undefined) {
    throw new Error('sign needs --message.\nExample: npm run wallet -- sign --message "hello"');
  }

  printRealFundsWarning();
  const unlocked = await unlockAccount(flags.index);
  const { signature, hash } = await signPersonalMessage(unlocked.account, flags.message);
  console.log(`Address:   ${unlocked.address}`);
  console.log(`Path:      ${unlocked.path}`);
  console.log(`Message:   ${flags.message}`);
  console.log(`EIP-191 hash: ${hash}`);
  console.log(`Signature: ${signature}`);
  console.log('');
  console.log('Anyone can check this with the verify command. Checking it does not reveal the private key.');
}
