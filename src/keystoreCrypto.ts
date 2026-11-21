/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The lockbox for the 12 words. The CLI (`src/keystore.ts`) writes this JSON
 * to `.wallet/keystore.json`. The web app stores the same JSON in the
 * browser's IndexedDB. Neither copy is the backup. The paper is the backup.
 *
 * How the lock works, in both places:
 *
 * 1. scrypt stretches the password into a 32-byte key. A password is short,
 *    so we make each guess expensive on purpose. scrypt also asks for a lot
 *    of memory, which makes it harder to try millions of guesses on a GPU.
 *    The salt is random, so two files with the same password and the same
 *    words still look different.
 *
 * 2. AES-256-GCM encrypts the words with that key. GCM produces a tag. When
 *    we decrypt, the tag check fails if the password is wrong OR if any
 *    encrypted byte was edited. We do not store a separate password hash.
 *    The tag is the check.
 *
 * 3. Additional authenticated data (AAD) binds the visible JSON fields to
 *    that tag. Flipping `usesPassphrase` makes decryption fail, instead of
 *    quietly opening a different wallet.
 *
 * N = 2^14 is a moderate learning setting. Memory used is about 128 * N * r
 * bytes. With r = 8 and N = 16384 that is 16 MB.
 *
 * The math is @noble/hashes scrypt and @noble/ciphers AES-GCM, not Node's
 * `crypto` module, so the terminal and the browser run the same bytes. Those
 * libraries match Node's scrypt and AES-GCM on the same inputs. A file
 * written by `npm run wallet -- create` opens in the web app, and the other
 * way around. MetaMask still cannot import this JSON. It wants the words.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { scrypt, scryptAsync } from '@noble/hashes/scrypt.js';
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
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

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

export type EncryptOptions = {
  /** Override scrypt N. Tests pass a smaller power of two. The CLI and the page do not. */
  n?: number;
  usesPassphrase?: boolean;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function fromHex(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function readHex(value: unknown, expectedBytes: number | undefined, label: string): Uint8Array {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) {
    throw new KeystoreError(`The keystore field ${label} is not lowercase hex. Nothing was unlocked.`);
  }
  if (expectedBytes !== undefined && value.length !== expectedBytes * 2) {
    throw new KeystoreError(`The keystore field ${label} has the wrong length. Nothing was unlocked.`);
  }
  if (expectedBytes === undefined && value.length / 2 > MAX_CIPHERTEXT_BYTES) {
    throw new KeystoreError('The ciphertext is far larger than a 24-word phrase. Nothing was unlocked.');
  }
  return fromHex(value);
}

/**
 * The exact bytes covered by the GCM tag besides the ciphertext.
 * Field order is fixed here so reordering keys inside the JSON does not
 * change the tag. The password and the words are not included: this string
 * is rebuilt from fields anyone can read.
 */
function aadBytes(file: Pick<KeystoreFile, 'version' | 'warning' | 'kdf' | 'kdfparams' | 'cipher' | 'cipherparams' | 'usesPassphrase' | 'createdAt'>): Uint8Array {
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
  return textEncoder.encode(lines.join('\n'));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.getRandomValues) {
    throw new KeystoreError('This environment has no cryptographic random source. Nothing was saved.');
  }
  webcrypto.getRandomValues(bytes);
  return bytes;
}

function passwordBytes(password: string): Uint8Array {
  // NFC so the same password typed with a composed or decomposed accent
  // produces the same key. This is the file password, not the BIP-39
  // passphrase (that one is normalized with NFKD inside the seed function).
  return textEncoder.encode(password.normalize('NFC'));
}

function scryptOptions(n: number, onProgress?: (progress: number) => void) {
  return {
    N: n,
    r: KEYSTORE_SCRYPT.r,
    p: KEYSTORE_SCRYPT.p,
    dkLen: KEYSTORE_SCRYPT.dkLen,
    maxmem: SCRYPT_MAXMEM,
    onProgress,
  };
}

function seal(file: KeystoreFile, key: Uint8Array, plain: string): void {
  const iv = fromHex(file.cipherparams.iv);
  // noble's GCM appends the 16-byte tag. The JSON stores the two pieces
  // separately, which is the same layout Node's cipher uses.
  const packed = gcm(key, iv, aadBytes(file)).encrypt(textEncoder.encode(plain));
  file.cipherparams.tag = toHex(packed.subarray(packed.length - TAG_BYTES));
  file.ciphertext = toHex(packed.subarray(0, packed.length - TAG_BYTES));
  packed.fill(0);
}

function open(file: KeystoreFile, key: Uint8Array): string {
  const iv = fromHex(file.cipherparams.iv);
  const tag = readHex(file.cipherparams.tag, TAG_BYTES, 'tag');
  const ciphertext = readHex(file.ciphertext, undefined, 'ciphertext');
  const packed = new Uint8Array(ciphertext.length + tag.length);
  packed.set(ciphertext, 0);
  packed.set(tag, ciphertext.length);
  try {
    const plain = gcm(key, iv, aadBytes(file)).decrypt(packed);
    const mnemonic = textDecoder.decode(plain);
    plain.fill(0);
    return mnemonic;
  } catch {
    throw new KeystoreError(
      'Wrong password, or the keystore file was changed. Nothing was unlocked. Run the command again to retry.',
    );
  } finally {
    packed.fill(0);
  }
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
  readHex(value.cipherparams.tag, TAG_BYTES, 'tag');
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
      salt: toHex(salt),
    },
    cipher: 'aes-256-gcm',
    cipherparams: {
      iv: toHex(iv),
      tag: value.cipherparams.tag as string,
    },
    ciphertext: toHex(ciphertext),
    usesPassphrase: value.usesPassphrase,
    createdAt: value.createdAt,
  };
}

function blankFile(options: EncryptOptions): { file: KeystoreFile; n: number } {
  const n = options.n ?? KEYSTORE_SCRYPT.n;
  assertPowerOfTwoN(n);
  // A new salt and a new IV every time. Reusing an IV with the same key
  // breaks AES-GCM. A random 96-bit IV is the standard GCM size.
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
      salt: toHex(salt),
    },
    cipher: 'aes-256-gcm',
    cipherparams: {
      iv: toHex(iv),
      tag: '',
    },
    ciphertext: '',
    usesPassphrase: options.usesPassphrase ?? false,
    createdAt: new Date().toISOString(),
  };
  return { file, n };
}

function assertPassword(password: string): void {
  if (password.normalize('NFC').length === 0) {
    throw new KeystoreError('The file password is empty. Nothing was saved.');
  }
}

export function encryptMnemonic(mnemonic: string, password: string, options: EncryptOptions = {}): KeystoreFile {
  const normalized = assertValidMnemonic(mnemonic);
  assertPassword(password);
  const { file, n } = blankFile(options);
  const secret = passwordBytes(password);
  const key = scrypt(secret, fromHex(file.kdfparams.salt), scryptOptions(n));
  try {
    seal(file, key, normalized);
    return file;
  } finally {
    key.fill(0);
    secret.fill(0);
  }
}

/**
 * Same lock as `encryptMnemonic`, but scrypt yields to the page between
 * chunks so the "this pause is on purpose" message can paint. The CLI uses
 * the synchronous function. The bytes that come out are the same.
 */
export async function encryptMnemonicAsync(
  mnemonic: string,
  password: string,
  options: EncryptOptions = {},
  onProgress?: (progress: number) => void,
): Promise<KeystoreFile> {
  const normalized = assertValidMnemonic(mnemonic);
  assertPassword(password);
  const { file, n } = blankFile(options);
  const secret = passwordBytes(password);
  const key = await scryptAsync(secret, fromHex(file.kdfparams.salt), {
    ...scryptOptions(n, onProgress),
    asyncTick: 10,
  });
  try {
    seal(file, key, normalized);
    return file;
  } finally {
    key.fill(0);
    secret.fill(0);
  }
}

export function decryptMnemonic(file: KeystoreFile, password: string): string {
  const secret = passwordBytes(password);
  const key = scrypt(secret, fromHex(file.kdfparams.salt), scryptOptions(file.kdfparams.n));
  try {
    return open(file, key);
  } finally {
    key.fill(0);
    secret.fill(0);
  }
}

export async function decryptMnemonicAsync(
  file: KeystoreFile,
  password: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const secret = passwordBytes(password);
  const key = await scryptAsync(secret, fromHex(file.kdfparams.salt), {
    ...scryptOptions(file.kdfparams.n, onProgress),
    asyncTick: 10,
  });
  try {
    return open(file, key);
  } finally {
    key.fill(0);
    secret.fill(0);
  }
}
