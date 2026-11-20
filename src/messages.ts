/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Sign and check an EIP-191 personal message.
 *
 * ECDSA signs a 32-byte hash, not the raw text. For a personal message the
 * hash is keccak256 of a prefix plus the text:
 *
 *   "\x19Ethereum Signed Message:\n" + decimal length of the text + the text
 *
 * The "\x19" byte and the words "Ethereum Signed Message" are what keep this
 * signature in its own world. A transaction hash does not start with that
 * prefix, so a message signature cannot be replayed as a transaction, and a
 * transaction signature cannot be presented as this message.
 *
 * viem's `signMessage` / `verifyMessage` / `hashMessage` implement that
 * prefix. We do not re-code the hash, because a one-byte difference would
 * make signatures no other wallet could check.
 *
 * Verification uses only the address, the text, and the signature. It does
 * not need the private key. Anyone can run it.
 */
import { hashMessage, verifyMessage, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { parseUserAddress } from './address.js';

export function assertSignableMessage(message: string): string {
  if (message.length === 0) {
    throw new Error('Type a message to sign. An empty message is too easy to confuse with a blank line.');
  }
  return message;
}

export async function signPersonalMessage(
  account: PrivateKeyAccount,
  message: string,
): Promise<{ signature: Hex; hash: Hex }> {
  const text = assertSignableMessage(message);
  const hash = hashMessage(text);
  const signature = await account.signMessage({ message: text });
  return { signature, hash };
}

export async function verifyPersonalMessage(input: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  const text = assertSignableMessage(input.message);
  const address = parseUserAddress(input.address);
  const signature = input.signature.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error('A signature is hex and starts with 0x.');
  }

  try {
    return await verifyMessage({
      address,
      message: text,
      signature: signature as Hex,
    });
  } catch {
    throw new Error('That signature could not be read. It should be the 0x hex printed by the sign command.');
  }
}
