/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Check an EIP-191 signature. No keystore, no password, no network.
 * The address is public, the message is public, and the signature is public.
 */
import type { Flags } from '../flags.js';
import { verifyPersonalMessage } from '../messages.js';

export async function verifyCommand(flags: Flags): Promise<void> {
  if (flags.message === undefined || !flags.signature || !flags.address) {
    throw new Error(
      'verify needs --message, --signature, and --address.\n' +
        'Example: npm run wallet -- verify --message "hello" --signature 0x... --address 0x...',
    );
  }

  const ok = await verifyPersonalMessage({
    address: flags.address,
    message: flags.message,
    signature: flags.signature,
  });

  if (!ok) {
    console.log('Not a valid signature for that address and that exact message.');
    console.log('A different capital letter in the message is a different message.');
    process.exitCode = 1;
    return;
  }

  console.log('Valid signature.');
  console.log(`Address ${flags.address} signed that exact message.`);
}
