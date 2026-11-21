/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Private key -> Ethereum address.
 *
 * Three ideas are stacked here:
 *
 * 1. secp256k1. The private key is a random integer. The public key is that
 *    integer times a fixed point G on the curve y^2 = x^3 + 7. "Times" means
 *    elliptic-curve point addition, repeated. It is easy to go from private
 *    to public and not feasible to go backwards. That one-way step is the
 *    whole reason a wallet can publish an address and keep the spending key.
 *
 * 2. keccak256. Ethereum hashes the public key with keccak256 (the original
 *    Keccak, not the later NIST SHA3, which uses a different padding). The
 *    address is the last 20 bytes of that hash. Bitcoin uses a different
 *    hash recipe, which is why the same private key has a different address
 *    there.
 *
 * 3. EIP-55. The address is only 40 hex characters, so a single typo would
 *    otherwise point at a different account. EIP-55 capitalizes some letters
 *    based on a hash of the lowercase address. Wallets reject a mixed-case
 *    address whose capitals do not match. All-lowercase and all-uppercase
 *    are still accepted: those forms simply carry no checksum.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak256, stringToBytes, type Hex } from 'viem';

/** Uncompressed public key: 0x04 || X (32 bytes) || Y (32 bytes). */
export function uncompressedPublicKey(privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error('An Ethereum private key is 32 bytes.');
  }

  // `false` asks for the uncompressed form. The compressed form is 33 bytes
  // (a prefix plus X only) and is what Bitcoin shows people. Ethereum's
  // address hash uses X and Y with the prefix removed, so we start from the
  // long form.
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error('secp256k1 did not return an uncompressed public key.');
  }
  return uncompressed;
}

/**
 * Apply the EIP-55 checksum.
 *
 * `address` may include 0x and may be any case. The hash input is the
 * lowercase hex *characters* (ASCII), not the raw 20 address bytes. Hashing
 * the bytes instead of the characters is a common bug and produces capitals
 * no other wallet will accept.
 */
export function applyEip55(address: string): Hex {
  const lower = address.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(lower)) {
    throw new Error('An Ethereum address is 20 bytes: 0x followed by 40 hex characters.');
  }

  const hash = keccak256(stringToBytes(lower)).slice(2);
  let checksummed = '0x';
  for (let i = 0; i < lower.length; i += 1) {
    const character = lower[i];
    const nibbleChar = hash[i];
    if (character === undefined || nibbleChar === undefined) {
      throw new Error('The checksum hash was shorter than the address.');
    }
    const nibble = Number.parseInt(nibbleChar, 16);
    // The spec says: uppercase the letter when the top bit of this nibble is
    // set. For a value 0-15, that bit is set exactly when the value is >= 8.
    checksummed += nibble >= 8 ? character.toUpperCase() : character;
  }
  return checksummed as Hex;
}

export function addressFromPrivateKey(privateKey: Uint8Array): Hex {
  const uncompressed = uncompressedPublicKey(privateKey);
  // Drop the 0x04 prefix. Hash the remaining 64 bytes.
  const hash = keccak256(uncompressed.subarray(1));
  // keccak256 returns 32 bytes (64 hex chars). The address is the last 20.
  const raw = `0x${hash.slice(-40)}`;
  return applyEip55(raw);
}

/**
 * Read an address a person typed.
 *
 * Mixed case must match EIP-55, which is how a typo gets caught. All-lower
 * and all-upper carry no checksum, so they are accepted and then returned
 * in checksummed form. We do not print a "corrected" address when the hex
 * itself is wrong: the checksum can detect a typo, but it cannot know which
 * character the person meant, and suggesting a different account would be
 * dangerous.
 */
export function parseUserAddress(input: string): Hex {
  const trimmed = input.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error('An Ethereum address looks like 0x followed by 40 hex characters. Nothing was sent.');
  }

  const checksummed = applyEip55(trimmed);
  const body = trimmed.slice(2);
  const allLower = trimmed === `0x${body.toLowerCase()}`;
  const allUpper = trimmed === `0x${body.toUpperCase()}`;
  if (!allLower && !allUpper && trimmed !== checksummed) {
    throw new Error(
      'That address has a bad EIP-55 checksum (the capitals do not match the hex). ' +
        'Check it for a typo. Nothing was sent.',
    );
  }
  return checksummed;
}
