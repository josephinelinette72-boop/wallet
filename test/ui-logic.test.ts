/**
 * The web app uses these modules directly. The checks below are the ones
 * the page depends on: the lockbox round-trips, the addresses match the CLI's
 * published vectors, and the rent percents match the property lesson.
 *
 * The phrase is the public BIP-39 test vector. It is not a secret.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEther } from 'viem';
import { addressFromPrivateKey } from '../src/address.js';
import { derivePrivateKey, ethereumPath } from '../src/hd.js';
import {
  decryptMnemonic,
  decryptMnemonicAsync,
  encryptMnemonic,
  encryptMnemonicAsync,
} from '../src/keystoreCrypto.js';
import { assertFilePassword, assertPasswordsMatch } from '../src/passwordRules.js';
import {
  capTableSummary,
  earnedRent,
  formatEthDisplay,
  formatSharePercent,
  formatStableDisplay,
  investorCount,
  proRataRent,
  rentEarnedToDate,
  RENT_PRECISION,
  sumAmounts,
} from '../src/payout.js';
import { adminActionsAllowed, deployAllowed, propertyRole } from '../src/roles.js';
import { isAllowedRpcTarget } from '../src/rpcTarget.js';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = 'test-password';
const INDEX_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const INDEX_1 = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0';

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

test('the browser keystore round-trips, and a sync file opens with the async unlock', async () => {
  const file = encryptMnemonic(PHRASE, PASSWORD, { n: 1024, usesPassphrase: false });
  assert.equal(decryptMnemonic(file, PASSWORD), PHRASE);
  assert.equal(await decryptMnemonicAsync(file, PASSWORD), PHRASE);
  assert.equal(JSON.stringify(file).includes(PHRASE), false);
  assert.equal(JSON.stringify(file).includes(PASSWORD), false);

  const asyncFile = await encryptMnemonicAsync(PHRASE, PASSWORD, { n: 1024 });
  assert.equal(decryptMnemonic(asyncFile, PASSWORD), PHRASE);

  await assert.rejects(decryptMnemonicAsync(file, 'wrong-password'), /Wrong password/);
});

test('derivation for the page matches the CLI vectors', () => {
  assert.equal(ethereumPath(0), "m/44'/60'/0'/0/0");
  assert.equal(ethereumPath(1), "m/44'/60'/0'/0/1");
  const first = derivePrivateKey(PHRASE, 0);
  const second = derivePrivateKey(PHRASE, 1);
  try {
    assert.equal(hex(first), '1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727');
    assert.equal(addressFromPrivateKey(first), INDEX_0);
    assert.equal(addressFromPrivateKey(second), INDEX_1);
  } finally {
    first.fill(0);
    second.fill(0);
  }
});

test('share percents and rent slices match the property lesson', () => {
  const supply = 1_000_000n;
  assert.equal(formatSharePercent(250_000n, supply), '25%');
  assert.equal(formatSharePercent(750_000n, supply), '75%');
  assert.equal(formatSharePercent(500_000n, supply), '50%');
  assert.equal(formatSharePercent(1n, supply), '0.0001%');
  assert.equal(formatSharePercent(0n, supply), '0%');

  const oneEth = parseEther('1');
  const alice = proRataRent(oneEth, 750_000n, supply);
  const bob = proRataRent(oneEth, 250_000n, supply);
  assert.equal(alice, parseEther('0.75'));
  assert.equal(bob, parseEther('0.25'));
  assert.equal(alice + bob, oneEth);
  assert.equal(formatEthDisplay(alice), '0.75 ETH');
  assert.equal(formatStableDisplay(500_000_000n), '500 mUSD');

  // After the first 1 ETH, reward-per-share is deposit * 1e18 / supply.
  const firstCredit = (oneEth * RENT_PRECISION) / supply;
  // A transfer snapshots Alice at 750000 shares, so her unclaimed stays 0.75 ETH
  // when she later holds 500000. The next 1 ETH, split 50/50, adds 0.5 ETH.
  const secondCredit = firstCredit;
  const aliceAfter = earnedRent({
    shares: 500_000n,
    rewardPerShare: firstCredit + secondCredit,
    paidPerShare: firstCredit,
    unclaimed: alice,
  });
  const bobAfter = earnedRent({
    shares: 500_000n,
    rewardPerShare: firstCredit + secondCredit,
    paidPerShare: firstCredit,
    unclaimed: 0n,
  });
  assert.equal(aliceAfter, parseEther('1.25'));
  assert.equal(bobAfter, parseEther('0.5'));
  assert.equal(formatEthDisplay(aliceAfter), '1.25 ETH');
});

test('investor stats match a two-investor rental', () => {
  const supply = 1_000_000n;
  const holders = [
    { shares: 600_000n },
    { shares: 250_000n },
    { shares: 150_000n },
    { shares: 0n },
  ];
  assert.equal(investorCount(holders), 3);
  const summary = capTableSummary(holders, supply);
  assert.equal(summary.investors, 3);
  assert.equal(summary.largestPercent, '60%');

  // Alice was paid 0.25 ETH already and can still claim 0.5 ETH.
  assert.equal(rentEarnedToDate(parseEther('0.25'), parseEther('0.5')), parseEther('0.75'));
  assert.equal(sumAmounts([parseEther('0.25'), parseEther('0.5')]), parseEther('0.75'));
  // Claiming does not create new rent. The total stays 0.75.
  assert.equal(rentEarnedToDate(parseEther('0.75'), 0n), parseEther('0.75'));
  assert.throws(() => rentEarnedToDate(-1n, 0n), /negative/);
});

test('admin buttons follow the contract role', () => {
  assert.equal(propertyRole({ propertyDeployed: false, youAreManager: false }), 'not-deployed');
  assert.equal(deployAllowed('not-deployed'), true);
  assert.equal(adminActionsAllowed('not-deployed'), false);

  assert.equal(propertyRole({ propertyDeployed: true, youAreManager: true }), 'manager');
  assert.equal(adminActionsAllowed('manager'), true);
  assert.equal(deployAllowed('manager'), true);

  assert.equal(propertyRole({ propertyDeployed: true, youAreManager: false }), 'investor');
  assert.equal(adminActionsAllowed('investor'), false);
  assert.equal(deployAllowed('investor'), false);
});

test('the dev-server forwarder allows local Anvil and https Sepolia only', () => {
  assert.equal(isAllowedRpcTarget('http://127.0.0.1:8545'), true);
  assert.equal(isAllowedRpcTarget('http://localhost:8546'), true);
  assert.equal(isAllowedRpcTarget('https://eth-sepolia.g.alchemy.com/v2/example'), true);
  assert.equal(isAllowedRpcTarget('http://1.2.3.4:8545'), false);
  assert.equal(isAllowedRpcTarget('https://127.0.0.1:8545'), false);
  assert.equal(isAllowedRpcTarget('http://user:secret@127.0.0.1:8545'), false);
  assert.equal(isAllowedRpcTarget('not a url'), false);
});

test('the file password rules match the CLI sentences', () => {
  assert.throws(() => assertFilePassword('short', PHRASE), /at least 8 characters/);
  assert.throws(() => assertFilePassword(PHRASE, PHRASE), /different from the 12 words/);
  assert.throws(() => assertPasswordsMatch('abcdefgh', 'abcdefgi'), /did not match/);
  assert.doesNotThrow(() => assertFilePassword('abcdefgh', PHRASE));
});
