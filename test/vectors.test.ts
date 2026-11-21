/**
 * Published answers. These expected values were not computed by this wallet.
 *
 * The BIP-39 seeds are the official English vectors from
 * https://github.com/trezor/python-mnemonic/blob/master/vectors.json
 * Every vector there uses the passphrase "TREZOR". That word is an example
 * passphrase, not a default. An empty passphrase is what you get when you
 * press Enter in this wallet.
 *
 * The Ethereum addresses are the well-known BIP-44 results for the same
 * phrase with an empty passphrase, checked with Foundry's `cast wallet`
 * (a different codebase from the TypeScript libraries used here):
 *
 *   m/44'/60'/0'/0/0
 *     key     1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727
 *     address 0x9858EfFD232B4033E47d90003D41EC34EcaEda94
 *   m/44'/60'/0'/0/1
 *     key     9a983cb3d832fbde5ab49d692b7a8bf5b5d232479c99333d0fc8e1d21f1b55b6
 *     address 0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0
 *
 * With the passphrase TREZOR, cast derives
 *   key     62f1d86b246c81bdd8f6c166d56896a4a5e1eddbcaebe06480e5c0bc74c28224
 *   address 0x9c32F71D4DB8Fb9e1A58B0a80dF79935e7256FA6
 *
 * These keys are public. Anyone can derive them. Never send funds to them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { addressFromPrivateKey, applyEip55, parseUserAddress, uncompressedPublicKey } from '../src/address.js';
import {
  assertValidMnemonic,
  createMnemonic,
  derivePrivateKey,
  derivePrivateKeyAtPath,
  ethereumPath,
  mnemonicFromEntropy,
  seedFromMnemonic,
} from '../src/hd.js';

const ABANDON =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const ABANDON_TREZOR_SEED =
  'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04';

const LEGAL_WINNER =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

const LEGAL_WINNER_TREZOR_SEED =
  '2e8905819b8723fe2c1d161860e5ee1830318dbf49a83bd451cfb8440c28bd6fa457fe1296106559a3c80937a1c1069be3a3a5bd381ee6260e8d9739fce1f607';

const INDEX_0_KEY = '1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727';
const INDEX_0_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const INDEX_1_KEY = '9a983cb3d832fbde5ab49d692b7a8bf5b5d232479c99333d0fc8e1d21f1b55b6';
const INDEX_1_ADDRESS = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0';
const TREZOR_KEY = '62f1d86b246c81bdd8f6c166d56896a4a5e1eddbcaebe06480e5c0bc74c28224';
const TREZOR_ADDRESS = '0x9c32F71D4DB8Fb9e1A58B0a80dF79935e7256FA6';

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

test('128 zero bits become the abandon...about phrase', () => {
  const entropy = new Uint8Array(16);
  assert.equal(mnemonicFromEntropy(entropy), ABANDON);
});

test('flipping one entropy bit changes the phrase, because the checksum covers the entropy', () => {
  const flipped = new Uint8Array(16);
  flipped[15] = 1;
  assert.notEqual(mnemonicFromEntropy(flipped), ABANDON);
});

test('BIP-39 official seed vectors use the passphrase TREZOR', () => {
  const abandonSeed = seedFromMnemonic(ABANDON, 'TREZOR');
  const legalSeed = seedFromMnemonic(LEGAL_WINNER, 'TREZOR');
  try {
    assert.equal(hex(abandonSeed), ABANDON_TREZOR_SEED);
    assert.equal(hex(legalSeed), LEGAL_WINNER_TREZOR_SEED);
  } finally {
    abandonSeed.fill(0);
    legalSeed.fill(0);
  }
});

test('the standard Ethereum path is m/44\'/60\'/0\'/0/i', () => {
  assert.equal(ethereumPath(0), "m/44'/60'/0'/0/0");
  assert.equal(ethereumPath(1), "m/44'/60'/0'/0/1");
});

test('empty-passphrase BIP-44 derivation matches the published Ethereum keys and addresses', () => {
  const first = derivePrivateKey(ABANDON, 0);
  const second = derivePrivateKey(ABANDON, 1);
  try {
    assert.equal(hex(first), INDEX_0_KEY);
    assert.equal(hex(second), INDEX_1_KEY);
    assert.equal(addressFromPrivateKey(first), INDEX_0_ADDRESS);
    assert.equal(addressFromPrivateKey(second), INDEX_1_ADDRESS);
  } finally {
    first.fill(0);
    second.fill(0);
  }
});

test('the TREZOR passphrase derives a different key than an empty passphrase', () => {
  const key = derivePrivateKey(ABANDON, 0, 'TREZOR');
  try {
    assert.equal(hex(key), TREZOR_KEY);
    assert.equal(addressFromPrivateKey(key), TREZOR_ADDRESS);
    assert.notEqual(TREZOR_ADDRESS, INDEX_0_ADDRESS);
  } finally {
    key.fill(0);
  }
});

test('coin type 60 (Ethereum) is not coin type 0 (Bitcoin)', () => {
  const ethereum = derivePrivateKeyAtPath(ABANDON, "m/44'/60'/0'/0/0");
  const bitcoin = derivePrivateKeyAtPath(ABANDON, "m/44'/0'/0'/0/0");
  try {
    assert.notEqual(hex(ethereum), hex(bitcoin));
  } finally {
    ethereum.fill(0);
    bitcoin.fill(0);
  }
});

test('extra spaces and capitals still recover the published address', () => {
  const messy = `  Abandon   ABANDON abandon abandon abandon abandon abandon abandon abandon abandon abandon about `;
  assert.equal(assertValidMnemonic(messy), ABANDON);
  const key = derivePrivateKey(messy, 0);
  try {
    assert.equal(addressFromPrivateKey(key), INDEX_0_ADDRESS);
  } finally {
    key.fill(0);
  }
});

test('a wrong last word fails the checksum and the error does not echo the phrase', () => {
  const broken = ABANDON.replace(/about$/, 'abandon');
  assert.throws(
    () => derivePrivateKey(broken, 0),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /checksum/);
      assert.equal(error.message.includes(broken), false);
      return true;
    },
  );
});

test('an unknown word is named, and the rest of the phrase is not copied into the error', () => {
  assert.throws(
    () => assertValidMnemonic(`${ABANDON.split(' ').slice(0, 11).join(' ')} notaword`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /notaword/);
      assert.equal(error.message.includes('abandon abandon'), false);
      return true;
    },
  );
});

test('createMnemonic returns 12 valid words and does not repeat the previous phrase', () => {
  const first = createMnemonic();
  const second = createMnemonic();
  assert.equal(first.split(' ').length, 12);
  assert.equal(assertValidMnemonic(first), first);
  assert.notEqual(first, second);
});

test('the published private key has a 65-byte uncompressed public key and the published address', () => {
  const key = Buffer.from(INDEX_0_KEY, 'hex');
  const uncompressed = uncompressedPublicKey(key);
  assert.equal(uncompressed.length, 65);
  assert.equal(uncompressed[0], 0x04);
  assert.equal(addressFromPrivateKey(key), INDEX_0_ADDRESS);
  assert.equal(privateKeyToAccount(`0x${INDEX_0_KEY}`).address, INDEX_0_ADDRESS);
});

test('EIP-55 mixed-case vectors match the specification and viem', () => {
  const vectors = [
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    '0x52908400098527886E0F7030069857D2E4169EE7',
    '0x8617E340B3D01FA5F11F306F4090FD50E238070D',
    '0xde709f2102306220921060314715629080e2fb77',
    '0x27b1fdb04752bbc536007a920d24acb045561c26',
  ];

  for (const vector of vectors) {
    assert.equal(applyEip55(vector.toLowerCase()), vector);
    assert.equal(getAddress(vector.toLowerCase()), vector);
    assert.equal(parseUserAddress(vector), vector);
    assert.equal(parseUserAddress(vector.toLowerCase()), vector);
    assert.equal(parseUserAddress(`0x${vector.slice(2).toUpperCase()}`), vector);
  }
});

test('a single wrong capital is rejected and no replacement address is suggested', () => {
  const good = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  // Index 4 is the first letter that EIP-55 capitalized. Lowering it keeps
  // the hex account the same and breaks only the checksum.
  const bad = `${good.slice(0, 4)}${good[4]!.toLowerCase()}${good.slice(5)}`;
  assert.notEqual(bad, good);
  assert.throws(
    () => parseUserAddress(bad),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /checksum/i);
      assert.equal(error.message.includes(good), false);
      return true;
    },
  );
});
