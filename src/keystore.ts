/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The lockbox for the 12 words.
 *
 * The words are the wallet. This file is only a convenience so you do not
 * retype them for every command. MetaMask and hardware wallets import the
 * words, not this JSON. If you delete the file and still have the words
 * (and the BIP-39 passphrase, if you set one), you can import them again.
 *
 * How the lock works:
 *
 * 1. scrypt stretches the password into a 32-byte key. A password is short,
 *    so we make each guess expensive on purpose. scrypt also asks for a lot
 *    of memory, which makes it harder to try millions of guesses on a GPU.
 *    The salt is random, so two files with the same password and the same
 *    words still look different, and an attacker cannot precompute one table
 *    of passwords and reuse it on every file.
 *
 * 2. AES-256-GCM encrypts the words with that key. GCM produces a tag. When
 *    we decrypt, the tag check fails if the password is wrong OR if any
 *    encrypted byte was edited. We do not store a separate password hash.
 *    The tag is the check. A wrong password and a damaged file produce the
 *    same error, which is what we want: the error text never contains the
 *    words or the password.
 *
 * 3. Additional authenticated data (AAD) binds the visible JSON fields to
 *    that tag. GCM already authenticates the ciphertext. It does not, by
 *    itself, care about the `usesPassphrase` flag sitting beside it. Putting
 *    that flag in the AAD means flipping it makes decryption fail, instead
 *    of quietly opening a different wallet (the empty-passphrase one).
 *
 * N = 2^14 is a moderate learning setting. A high-value wallet often uses a
 * larger N so guessing is slower, and unlocks get slower too. Memory used is
 * about 128 * N * r bytes. With r = 8 and N = 16384 that is 16 MB.
 *
 * This is the same shape as an Ethereum secret-storage keystore (scrypt, then
 * a cipher, then a check), with two teaching choices: we encrypt the whole
 * phrase rather than one private key, and we use AES-GCM's tag rather than a
 * keccak MAC. The JSON is not something MetaMask can import.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertValidMnemonic } from './hd.js';

export const KEYSTORE_SCRYPT = {
  n: 2 ** 14,
  r: 8,
  p: 1,
  dkLen: 32,
} as const;

export const KEYSTORE_WARNING =
  'Encrypted BIP-39 mnemonic for the learning wallet. Not plaintext. NEVER use a real-funds seed with this file.';

const MIN_N = 2 ** 10;
const MAX_N = 2 ** 18;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 4096;

export class KeystoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeystoreError';
  }
}

export type KeystoreFile = {
  version: 1;
  warning: string;
  kdf: 'scrypt';
  kdfparams: {
    n: number;
    r: number;
    p: number;
    dklen: number;
    salt: string;
  };
  cipher: 'aes-256-gcm';
  cipherparams: {
    iv: string;
    tag: string;
  };
  ciphertext: string;
  usesPassphrase: boolean;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPowerOfTwoN(n: number): void {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N || (n & (n - 1)) !== 0) {
    throw new KeystoreError(
      'The scrypt N parameter is not one this wallet will run. Nothing was unlocked.',
    );
  }
}

function readHex(value: unknown, expectedBytes: number | undefined, label: string): Buffer {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) {
    throw new KeystoreError(`The keystore field ${label} is not lowercase hex. Nothing was unlocked.`);
  }
  if (expectedBytes !== undefined && value.length !== expectedBytes * 2) {
    throw new KeystoreError(`The keystore field ${label} has the wrong length. Nothing was unlocked.`);
  }
  if (expectedBytes === undefined && value.length / 2 > MAX_CIPHERTEXT_BYTES) {
    throw new KeystoreError('The ciphertext is far larger than a 24-word phrase. Nothing was unlocked.');
  }
  return Buffer.from(value, 'hex');
}

/**
 * The exact bytes covered by the GCM tag besides the ciphertext.
 * Field order is fixed here so reordering keys inside the JSON does not
 * change the tag. The password and the words are not included: this string
 * is rebuilt from fields anyone can read.
 */
function aadBytes(file: Pick<KeystoreFile, 'version' | 'warning' | 'kdf' | 'kdfparams' | 'cipher' | 'cipherparams' | 'usesPassphrase' | 'createdAt'>): Buffer {
  const lines = [
    `version=${file.version}`,
    `warning=${file.warning}`,
    `kdf=${file.kdf}`,
    `n=${file.kdfparams.n}`,
    `r=${file.kdfparams.r}`,
    `p=${file.kdfparams.p}`,
    `dklen=${file.kdfparams.dklen}`,
    `salt=${file.kdfparams.salt}`,
    `cipher=${file.cipher}`,
    `iv=${file.cipherparams.iv}`,
    `usesPassphrase=${file.usesPassphrase ? 'yes' : 'no'}`,
    `createdAt=${file.createdAt}`,
  ];
  return Buffer.from(lines.join('\n'), 'utf8');
}

export function parseKeystore(value: unknown): KeystoreFile {
  if (!isRecord(value)) throw new KeystoreError('The keystore is not a JSON object. Nothing was unlocked.');
  if (value.version !== 1) throw new KeystoreError('This keystore version is not supported. Nothing was unlocked.');
  if (value.kdf !== 'scrypt') throw new KeystoreError('This keystore does not use scrypt. Nothing was unlocked.');
  if (value.cipher !== 'aes-256-gcm') {
    throw new KeystoreError('This keystore does not use AES-256-GCM. Nothing was unlocked.');
  }
  if (typeof value.usesPassphrase !== 'boolean') {
    throw new KeystoreError('The keystore is missing usesPassphrase. Nothing was unlocked.');
  }
  if (typeof value.warning !== 'string' || typeof value.createdAt !== 'string') {
    throw new KeystoreError('The keystore header is incomplete. Nothing was unlocked.');
  }
  if (!isRecord(value.kdfparams) || !isRecord(value.cipherparams)) {
    throw new KeystoreError('The keystore is missing its cipher parameters. Nothing was unlocked.');
  }

  const n = value.kdfparams.n;
  const r = value.kdfparams.r;
  const p = value.kdfparams.p;
  const dklen = value.kdfparams.dklen;
  if (typeof n !== 'number') throw new KeystoreError('The scrypt N parameter is missing. Nothing was unlocked.');
  assertPowerOfTwoN(n);
  // r and p are fixed. A tampered file must not be able to request a huge
  // memory multiplier. N is allowed to vary so tests can use a smaller cost,
  // and so a file written by an older run of this program still opens.
  if (r !== KEYSTORE_SCRYPT.r || p !== KEYSTORE_SCRYPT.p || dklen !== KEYSTORE_SCRYPT.dkLen) {
    throw new KeystoreError('The scrypt r, p, or dklen parameter is not one this wallet writes. Nothing was unlocked.');
  }

  const salt = readHex(value.kdfparams.salt, SALT_BYTES, 'salt');
  const iv = readHex(value.cipherparams.iv, IV_BYTES, 'iv');
  const tag = readHex(value.cipherparams.tag, TAG_BYTES, 'tag');
  const ciphertext = readHex(value.ciphertext, undefined, 'ciphertext');
  if (ciphertext.length === 0) throw new KeystoreError('The ciphertext is empty. Nothing was unlocked.');

  return {
    version: 1,
    warning: value.warning,
    kdf: 'scrypt',
    kdfparams: {
      n,
      r,
      p,
      dklen,
      salt: salt.toString('hex'),
    },
    cipher: 'aes-256-gcm',
    cipherparams: {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    },
    ciphertext: ciphertext.toString('hex'),
    usesPassphrase: value.usesPassphrase,
    createdAt: value.createdAt,
  };
}

export type EncryptOptions = {
  /** Override scrypt N. Tests pass a smaller power of two. The CLI does not. */
  n?: number;
  usesPassphrase?: boolean;
};

export function encryptMnemonic(mnemonic: string, password: string, options: EncryptOptions = {}): KeystoreFile {
  const normalized = assertValidMnemonic(mnemonic);
  if (password.normalize('NFC').length === 0) {
    throw new KeystoreError('The file password is empty. Nothing was saved.');
  }

  const n = options.n ?? KEYSTORE_SCRYPT.n;
  assertPowerOfTwoN(n);

  // A new salt and a new IV every time. Reusing an IV with the same key
  // breaks AES-GCM. A random 96-bit IV is the standard GCM size. The salt
  // stops one scrypt rainbow table from working on every keystore.
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const file: KeystoreFile = {
    version: 1,
    warning: KEYSTORE_WARNING,
    kdf: 'scrypt',
    kdfparams: {
      n,
      r: KEYSTORE_SCRYPT.r,
      p: KEYSTORE_SCRYPT.p,
      dklen: KEYSTORE_SCRYPT.dkLen,
      salt: salt.toString('hex'),
    },
    cipher: 'aes-256-gcm',
    cipherparams: {
      iv: iv.toString('hex'),
      tag: '',
    },
    ciphertext: '',
    usesPassphrase: options.usesPassphrase ?? false,
    createdAt: new Date().toISOString(),
  };

  // NFC so the same password typed with a composed or decomposed accent
  // produces the same key. This is our file password, not the BIP-39
  // passphrase (that one is normalized with NFKD inside the seed function).
  const passwordBytes = Buffer.from(password.normalize('NFC'), 'utf8');
  const key = scryptSync(passwordBytes, salt, KEYSTORE_SCRYPT.dkLen, {
    N: n,
    r: KEYSTORE_SCRYPT.r,
    p: KEYSTORE_SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });

  try {
    const cipher: CipherGCM = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aadBytes(file));
    const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    file.cipherparams.tag = cipher.getAuthTag().toString('hex');
    file.ciphertext = ciphertext.toString('hex');
    ciphertext.fill(0);
    return file;
  } finally {
    key.fill(0);
    passwordBytes.fill(0);
  }
}

export function decryptMnemonic(file: KeystoreFile, password: string): string {
  const passwordBytes = Buffer.from(password.normalize('NFC'), 'utf8');
  const salt = readHex(file.kdfparams.salt, SALT_BYTES, 'salt');
  const iv = readHex(file.cipherparams.iv, IV_BYTES, 'iv');
  const tag = readHex(file.cipherparams.tag, TAG_BYTES, 'tag');
  const ciphertext = readHex(file.ciphertext, undefined, 'ciphertext');

  const key = scryptSync(passwordBytes, salt, file.kdfparams.dklen, {
    N: file.kdfparams.n,
    r: file.kdfparams.r,
    p: file.kdfparams.p,
    maxmem: 256 * 1024 * 1024,
  });

  try {
    const decipher: DecipherGCM = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aadBytes(file));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const mnemonic = plain.toString('utf8');
    plain.fill(0);
    return mnemonic;
  } catch {
    // OpenSSL's message is "unable to authenticate data". We replace it so
    // the terminal shows one calm sentence and never a fragment of plaintext.
    throw new KeystoreError(
      'Wrong password, or the keystore file was changed. Nothing was unlocked. Run the command again to retry.',
    );
  } finally {
    key.fill(0);
    passwordBytes.fill(0);
  }
}

export function loadKeystore(filePath: string): KeystoreFile {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    throw new KeystoreError(
      `No keystore at ${filePath}.\n` +
        'Create one with: npm run wallet -- create\n' +
        'Or import words you already wrote down: npm run wallet -- import',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new KeystoreError('The keystore file is not valid JSON. It was not opened.');
  }
  return parseKeystore(parsed);
}

/**
 * Write the JSON so a crash mid-write cannot leave a half file in the
 * real location: we write a temp file, then rename it into place. Rename
 * on the same disk is atomic. The mode is 0600 (owner read/write only)
 * and the folder is 0700, which on WSL means other Linux users on this
 * machine cannot read the file.
 */
export function saveKeystore(file: KeystoreFile, filePath: string): void {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const tmp = `${filePath}.tmp`;
  const json = `${JSON.stringify(file, null, 2)}\n`;
  try {
    writeFileSync(tmp, json, { mode: 0o600, flag: 'w' });
    chmodSync(tmp, 0o600);
    renameSync(tmp, filePath);
    chmodSync(filePath, 0o600);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // The temp file may not exist. The original error is the one to report.
    }
    const message = error instanceof Error ? error.message : 'unknown write error';
    throw new KeystoreError(`Could not write the keystore: ${message}`);
  }
}
