/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Words -> seed -> one private key.
 *
 * BIP-39 turns entropy into words, then turns the words into a 64-byte seed.
 * BIP-32 grows a tree of keys from that seed. BIP-44 names one branch of the
 * tree for Ethereum:
 *
 *   m / 44' / 60' / 0' / 0 / i
 *
 *   m     the master key, made from the seed
 *   44'   purpose: "this tree follows BIP-44"
 *   60'   coin type: Ethereum, from the SLIP-44 registry. Bitcoin is 0'.
 *   0'    account: the first account. A wallet can keep more than one.
 *   0     change: 0 is the receiving chain. Bitcoin uses 1 for change.
 *         Ethereum wallets almost always stay on 0.
 *   i     address index: 0, then 1, then 2, ... from the same words
 *
 * A quote mark means a *hardened* child. Hardened derivation mixes in the
 * parent private key, so a leaked parent public key cannot be used to derive
 * those children. The first three steps are hardened. The last two are not,
 * which is what lets a watch-only wallet derive addresses from an xpub.
 * This program always starts from the words, so it does not need an xpub.
 *
 * The quote is a notation, not a character stored in the key. Under the hood
 * a hardened index is the number plus 2^31.
 *
 * Libraries do the hashing. Writing SHA-256, PBKDF2, HMAC, or secp256k1 by
 * hand is a common way to build a wallet that disagrees with every other
 * wallet, which is a polite way to say "the coins are gone".
 */
import { randomBytes } from 'node:crypto';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

/**
 * Collapse spaces and lowercase the words.
 *
 * BIP-39 words are lowercase English. Extra spaces and capitals are typing
 * noise, not part of the phrase. The words themselves, and their order, are
 * the secret.
 */
export function normalizeMnemonic(raw: string): string {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Accept a phrase only when every word is in the list and the checksum matches.
 *
 * The checksum is why a random sentence of dictionary words usually fails.
 * For 12 words the entropy is 128 bits and the checksum is the first 4 bits
 * of SHA-256(entropy). Those 4 bits are folded into the last word. The check
 * is short on purpose: it catches many typos and still misses some. It is
 * not a correction tool, so we do not suggest a replacement word.
 */
export function assertValidMnemonic(raw: string): string {
  const normalized = normalizeMnemonic(raw);
  const words = normalized.length === 0 ? [] : normalized.split(' ');
  const allowed = new Set(wordlist);
  const unknown = words.filter((word) => !allowed.has(word));

  if (unknown.length > 0) {
    throw new Error(
      `These words are not in the English BIP-39 list: ${unknown.join(', ')}. ` +
        'Check the spelling. Nothing was saved.',
    );
  }

  if (!WORD_COUNTS.has(words.length)) {
    throw new Error(
      `A BIP-39 phrase is 12, 15, 18, 21, or 24 words. You entered ${words.length}. Nothing was saved.`,
    );
  }

  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error(
      'Those are real BIP-39 words, but the checksum does not match. A word is in the wrong place, ' +
        'or the last word is wrong. Nothing was saved.',
    );
  }

  return normalized;
}

/**
 * 12 words from 16 bytes of operating-system randomness.
 *
 * 16 bytes = 128 bits. BIP-39 appends a 4-bit checksum and splits the
 * 132 bits into 12 groups of 11. Each group is an index into the 2048-word
 * English list (2^11 = 2048).
 *
 * `randomBytes` reads the OS CSPRNG (`/dev/urandom` on Linux). `Math.random`
 * is a predictable formula and must never be used for keys. We ask the
 * library to encode our bytes so this function, not a helper buried in a
 * dependency, is the place the entropy is created.
 */
export function createMnemonic(): string {
  const entropy = randomBytes(16);
  try {
    return mnemonicFromEntropy(entropy);
  } finally {
    entropy.fill(0);
  }
}

export function mnemonicFromEntropy(entropy: Uint8Array): string {
  if (entropy.length < 16 || entropy.length > 32 || entropy.length % 4 !== 0) {
    throw new Error('BIP-39 entropy must be 16, 20, 24, 28, or 32 bytes.');
  }
  return entropyToMnemonic(entropy, wordlist);
}

/**
 * BIP-39 seed.
 *
 * PBKDF2-HMAC-SHA512, 2048 rounds, 64-byte output.
 * Password = the phrase (NFKD). Salt = the letters "mnemonic" plus the
 * optional passphrase (NFKD). An empty passphrase is what wallets use when
 * you do not set one. The passphrase is not one of the 12 words. The official
 * test vectors use the example passphrase "TREZOR"; that is not a default.
 *
 * @scure/bip39 applies the NFKD normalization the spec requires. We do not
 * normalize the passphrase ourselves first, because a second, different
 * normalization would change the seed.
 */
export function seedFromMnemonic(mnemonic: string, passphrase = ''): Uint8Array {
  const normalized = assertValidMnemonic(mnemonic);
  return Uint8Array.from(mnemonicToSeedSync(normalized, passphrase));
}

export function assertAddressIndex(index: number): void {
  // The last step of m/44'/60'/0'/0/i is not hardened, so i must be below 2^31.
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error('The address index must be a whole number from 0 up to 2147483647.');
  }
}

/** The MetaMask / BIP-44 Ethereum path for address number `index`. */
export function ethereumPath(index: number): string {
  assertAddressIndex(index);
  return `m/44'/60'/0'/0/${index}`;
}

/**
 * Derive one 32-byte private key.
 *
 * BIP-32 builds the master key by computing HMAC-SHA512 with the key string
 * "Bitcoin seed" and the data equal to the 64-byte BIP-39 seed. The left 32
 * bytes are the master private key and the right 32 bytes are the chain
 * code. Ethereum uses that same "Bitcoin seed" string. Changing it would
 * create a wallet no other software could restore.
 *
 * The caller receives a copy of the key bytes and is responsible for the
 * secret. This function wipes the seed and asks the HD node to drop its copy.
 * JavaScript strings (the phrase) cannot be wiped; they live until the
 * garbage collector reclaims them.
 */
export function derivePrivateKeyAtPath(mnemonic: string, path: string, passphrase = ''): Uint8Array {
  if (!path.startsWith('m/')) {
    throw new Error('A derivation path starts with m/, which means the master key.');
  }

  const seed = seedFromMnemonic(mnemonic, passphrase);
  try {
    const master = HDKey.fromMasterSeed(seed);
    const child = master.derive(path);
    master.wipePrivateData();

    if (child.privateKey === null) {
      throw new Error('This path did not produce a private key.');
    }

    const key = new Uint8Array(child.privateKey);
    child.wipePrivateData();
    return key;
  } finally {
    seed.fill(0);
  }
}

export function derivePrivateKey(mnemonic: string, index: number, passphrase = ''): Uint8Array {
  return derivePrivateKeyAtPath(mnemonic, ethereumPath(index), passphrase);
}
