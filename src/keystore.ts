/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The CLI's copy of the lockbox: a JSON file on disk.
 *
 * The encryption itself lives in `keystoreCrypto.ts`, because the web app
 * runs that same code in the browser and stores the JSON in IndexedDB.
 * This file only does the disk parts. MetaMask and hardware wallets import
 * the words, not this JSON. If you delete the file and still have the words
 * (and the BIP-39 passphrase, if you set one), you can import them again.
 *
 * The write is arranged so a crash mid-write cannot leave a half file in the
 * real location: we write a temp file, then rename it into place. Rename on
 * the same disk is atomic. The mode is 0600 (owner read/write only) and the
 * folder is 0700, which on WSL means other Linux users on this machine cannot
 * read the file.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { KeystoreError, parseKeystore, type KeystoreFile } from './keystoreCrypto.js';

export {
  KEYSTORE_KEY_WARNING,
  KEYSTORE_SCRYPT,
  KEYSTORE_WARNING,
  KeystoreError,
  decryptMnemonic,
  decryptMnemonicAsync,
  encryptMnemonic,
  encryptMnemonicAsync,
  encryptPrivateKey,
  encryptPrivateKeyAsync,
  keystoreSecretKind,
  parseKeystore,
  type EncryptOptions,
  type KeystoreFile,
  type SecretKind,
} from './keystoreCrypto.js';

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
