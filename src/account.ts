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
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { addressFromPrivateKey, parsePrivateKey } from './address.js';
import { derivePrivateKey, ethereumPath } from './hd.js';

export type UnlockedAccount = {
  account: PrivateKeyAccount;
  address: Hex;
  path: string;
};

/** Shown in previews instead of a BIP-44 path. This account was not derived. */
export const RAW_KEY_PATH = 'raw key';

export type WalletSecret =
  | { kind: 'mnemonic'; mnemonic: string; passphrase: string }
  | { kind: 'private-key'; privateKey: Hex };

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

/** One imported key. There is no derivation path and no second account. */
export function accountFromPrivateKey(privateKey: Hex): UnlockedAccount {
  const normalized = parsePrivateKey(privateKey);
  const bytes = hexToBytes(normalized);
  try {
    const address = addressFromPrivateKey(bytes);
    const account = privateKeyToAccount(normalized);
    if (account.address !== address) {
      throw new Error(
        'Internal check failed: the address from our keccak steps does not match viem. Refusing to continue.',
      );
    }
    return { account, address, path: RAW_KEY_PATH };
  } finally {
    bytes.fill(0);
  }
}

/**
 * The account a signature should use.
 *
 * A phrase can grow index 0, 1, 2, … A raw key is only index 0. Asking for
 * another index is refused so a key-only wallet cannot pretend to derive.
 */
export function accountFromSecret(secret: WalletSecret, index: number): UnlockedAccount {
  if (secret.kind === 'private-key') {
    if (index !== 0) {
      throw new Error('This wallet holds one private key. It cannot derive another account.');
    }
    return accountFromPrivateKey(secret.privateKey);
  }
  return accountFromMnemonic(secret.mnemonic, index, secret.passphrase);
}
