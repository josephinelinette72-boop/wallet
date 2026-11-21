/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Join our address math to viem's signer.
 *
 * viem knows how to sign transactions and EIP-191 messages. We still compute
 * the address ourselves in `address.ts` and refuse to continue if the two
 * answers differ. A disagreement would mean the key we are about to sign
 * with is not the key the user thinks they are using.
 *
 * viem keeps its own copy of the private key for as long as the account
 * object lives. Zeroing our temporary buffer does not reach into that copy.
 * The command holds the account only while it builds one signature, then
 * drops it. A hardware wallet avoids this by keeping the key off the
 * computer entirely. This program is for practice on Anvil.
 */
import { bytesToHex, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { addressFromPrivateKey } from './address.js';
import { derivePrivateKey, ethereumPath } from './hd.js';

export type UnlockedAccount = {
  account: PrivateKeyAccount;
  address: Hex;
  path: string;
};

export function accountFromMnemonic(mnemonic: string, index: number, passphrase = ''): UnlockedAccount {
  const path = ethereumPath(index);
  const key = derivePrivateKey(mnemonic, index, passphrase);
  try {
    const address = addressFromPrivateKey(key);
    const account = privateKeyToAccount(bytesToHex(key));
    if (account.address !== address) {
      throw new Error(
        'Internal check failed: the address from our keccak steps does not match viem. Refusing to continue.',
      );
    }
    return { account, address, path };
  } finally {
    key.fill(0);
  }
}
