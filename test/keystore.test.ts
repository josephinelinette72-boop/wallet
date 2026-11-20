/**
 * The keystore must round-trip the phrase and must not contain it.
 * The phrase used here is the public test vector. The password is a test password.
 */
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { KEYSTORE_SCRYPT, decryptMnemonic, encryptMnemonic, parseKeystore, saveKeystore } from '../src/keystore.js';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = 'test-password';
const PASSPHRASE = 'correct horse';

test('default scrypt N is 2^14', () => {
  assert.equal(KEYSTORE_SCRYPT.n, 16384);
  assert.equal(KEYSTORE_SCRYPT.r, 8);
  assert.equal(KEYSTORE_SCRYPT.p, 1);
  assert.equal(KEYSTORE_SCRYPT.dkLen, 32);
});

test('encrypt then decrypt returns the phrase, and the file does not contain secrets', () => {
  const file = encryptMnemonic(PHRASE, PASSWORD, { n: 1024, usesPassphrase: true });
  const json = JSON.stringify(file);

  assert.equal(decryptMnemonic(file, PASSWORD), PHRASE);
  assert.equal(file.usesPassphrase, true);
  assert.equal(file.kdf, 'scrypt');
  assert.equal(file.cipher, 'aes-256-gcm');
  assert.equal(json.includes(PHRASE), false);
  assert.equal(json.includes(PASSWORD), false);
  assert.equal(json.includes(PASSPHRASE), false);
  assert.equal(json.includes('1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727'), false);
  assert.match(file.warning, /NEVER/);
});

test('two encryptions of the same phrase do not reuse the salt or the IV', () => {
  const first = encryptMnemonic(PHRASE, PASSWORD, { n: 1024 });
  const second = encryptMnemonic(PHRASE, PASSWORD, { n: 1024 });
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.kdfparams.salt, second.kdfparams.salt);
  assert.notEqual(first.cipherparams.iv, second.cipherparams.iv);
  assert.equal(decryptMnemonic(first, PASSWORD), PHRASE);
  assert.equal(decryptMnemonic(second, PASSWORD), PHRASE);
});

test('the real default scrypt cost can decrypt what it encrypted', () => {
  const file = encryptMnemonic(PHRASE, PASSWORD);
  assert.equal(file.kdfparams.n, 16384);
  assert.equal(decryptMnemonic(file, PASSWORD), PHRASE);
});

test('a wrong password and a tampered header both fail without echoing the password', () => {
  const file = encryptMnemonic(PHRASE, PASSWORD, { n: 1024 });

  assert.throws(
    () => decryptMnemonic(file, 'wrong-password'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(PASSWORD), false);
      assert.equal(error.message.includes(PHRASE), false);
      assert.match(error.message, /Wrong password/);
      return true;
    },
  );

  const flipped = {
    ...file,
    usesPassphrase: true,
  };
  assert.throws(() => decryptMnemonic(parseKeystore(flipped), PASSWORD));

  const editedWarning = { ...file, warning: `${file.warning} edited` };
  assert.throws(() => decryptMnemonic(parseKeystore(editedWarning), PASSWORD));

  const editedDate = { ...file, createdAt: '1999-01-01T00:00:00.000Z' };
  assert.throws(() => decryptMnemonic(parseKeystore(editedDate), PASSWORD));

  const ciphertext = file.ciphertext;
  const tamperedChar = ciphertext[0] === 'a' ? 'b' : 'a';
  const tampered = { ...file, ciphertext: `${tamperedChar}${ciphertext.slice(1)}` };
  assert.throws(() => decryptMnemonic(parseKeystore(tampered), PASSWORD));
});

test('a huge scrypt N in a file is refused before we run it', () => {
  const file = encryptMnemonic(PHRASE, PASSWORD, { n: 1024 });
  const hostile = { ...file, kdfparams: { ...file.kdfparams, n: 2 ** 30 } };
  assert.throws(() => parseKeystore(hostile), /scrypt N/i);
});

test('the keystore file is owner-read/write only', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'learning-wallet-'));
  const filePath = path.join(directory, '.wallet', 'keystore.json');
  saveKeystore(encryptMnemonic(PHRASE, PASSWORD, { n: 1024 }), filePath);

  assert.equal(statSync(filePath).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(filePath)).mode & 0o777, 0o700);

  const saved = readFileSync(filePath, 'utf8');
  assert.equal(saved.includes(PHRASE), false);
  assert.equal(decryptMnemonic(parseKeystore(JSON.parse(saved)), PASSWORD), PHRASE);

  // A world-readable mode must not survive saveKeystore. Rewrite and recheck.
  chmodSync(filePath, 0o644);
  saveKeystore(parseKeystore(JSON.parse(saved)), filePath);
  assert.equal(statSync(filePath).mode & 0o777, 0o600);
});

test('reordering JSON keys still decrypts, because the tag is bound to values not key order', () => {
  const file = encryptMnemonic(PHRASE, PASSWORD, { n: 1024 });
  const reordered = {
    createdAt: file.createdAt,
    usesPassphrase: file.usesPassphrase,
    ciphertext: file.ciphertext,
    cipherparams: { tag: file.cipherparams.tag, iv: file.cipherparams.iv },
    cipher: file.cipher,
    kdfparams: {
      salt: file.kdfparams.salt,
      dklen: file.kdfparams.dklen,
      p: file.kdfparams.p,
      r: file.kdfparams.r,
      n: file.kdfparams.n,
    },
    kdf: file.kdf,
    warning: file.warning,
    version: file.version,
  };
  const directory = mkdtempSync(path.join(tmpdir(), 'learning-wallet-order-'));
  const filePath = path.join(directory, 'keystore.json');
  writeFileSync(filePath, JSON.stringify(reordered));
  assert.equal(decryptMnemonic(parseKeystore(JSON.parse(readFileSync(filePath, 'utf8'))), PASSWORD), PHRASE);
});
