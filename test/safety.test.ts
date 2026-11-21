/**
 * Guards that must fail closed: wrong chain, public faucet, leaked RPC key.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEthAmount } from '../src/amounts.js';
import { ANVIL_DEV_ADDRESS, ANVIL_DEV_PRIVATE_KEY } from '../src/anvilDev.js';
import { addressFromPrivateKey } from '../src/address.js';
import { toFriendlyError } from '../src/client.js';
import { loadConfig } from '../src/config.js';
import { parseCli } from '../src/flags.js';
import { describeTransaction } from '../src/preview.js';
import { assertAnvilFaucetAllowed, assertExpectedChain, redactRpcUrl } from '../src/safety.js';

test('the default chain is local Anvil and mainnet is refused', () => {
  const config = loadConfig({});
  assert.equal(config.chainChoice, 'anvil');
  assert.equal(config.chain.id, 31337);
  assert.equal(config.rpcUrl, 'http://127.0.0.1:8545');

  assert.throws(() => loadConfig({ CHAIN: 'mainnet' }), /refuses mainnet/i);
  assert.throws(() => loadConfig({ CHAIN: 'ethereum' }), /only talks to/i);
  assert.throws(
    () => loadConfig({ CHAIN: 'sepolia' }),
    /SEPOLIA_RPC_URL is empty/,
  );
});

test('a chain flag overrides the environment, and a Sepolia URL is kept for the request only', () => {
  const config = loadConfig(
    { CHAIN: 'anvil', SEPOLIA_RPC_URL: 'https://eth-sepolia.g.alchemy.com/v2/super-secret-key' },
    'sepolia',
  );
  assert.equal(config.chainChoice, 'sepolia');
  assert.equal(config.chain.id, 11155111);
  assert.equal(config.rpcUrl.includes('super-secret-key'), true);
});

test('RPC URLs lose their API key before they are shown', () => {
  const url = 'https://user:pass@eth-sepolia.g.alchemy.com/v2/super-secret-key?apikey=another';
  const redacted = redactRpcUrl(url);
  assert.equal(redacted.includes('super-secret-key'), false);
  assert.equal(redacted.includes('another'), false);
  assert.equal(redacted.includes('user'), false);
  assert.match(redacted, /eth-sepolia\.g\.alchemy\.com/);

  const config = loadConfig({
    CHAIN: 'sepolia',
    SEPOLIA_RPC_URL: 'https://eth-sepolia.g.alchemy.com/v2/super-secret-key',
  });
  const error = toFriendlyError(
    new Error('HTTP request failed. URL: https://eth-sepolia.g.alchemy.com/v2/super-secret-key'),
    config,
  );
  assert.equal(error.message.includes('super-secret-key'), false);

  const refused = toFriendlyError(new Error('connect ECONNREFUSED 127.0.0.1:8545'), loadConfig({}));
  assert.match(refused.message, /anvil/i);
});

test('the faucet requires localhost and chain id 31337', () => {
  assert.doesNotThrow(() => assertAnvilFaucetAllowed(31337, 'http://127.0.0.1:8545'));
  assert.doesNotThrow(() => assertAnvilFaucetAllowed(31337, 'http://localhost:8545'));
  assert.throws(() => assertAnvilFaucetAllowed(31337, 'https://sepolia.example/v2/key'), /localhost/i);
  assert.throws(() => assertAnvilFaucetAllowed(11155111, 'http://127.0.0.1:8545'), /31337/);
  assert.throws(() => assertExpectedChain(31337, 1, 'Anvil'), /wrong network/);
  assert.doesNotThrow(() => assertExpectedChain(31337, 31337, 'Anvil'));
});

test('the published Anvil key derives the published Anvil address', () => {
  const key = Buffer.from(ANVIL_DEV_PRIVATE_KEY.slice(2), 'hex');
  assert.equal(addressFromPrivateKey(key), ANVIL_DEV_ADDRESS);
});

test('ETH amounts are wei integers, not JavaScript floats', () => {
  assert.equal(parseEthAmount('0.1'), 100000000000000000n);
  assert.equal(parseEthAmount('1'), 1000000000000000000n);
  assert.throws(() => parseEthAmount('1e18'), /decimal/);
  assert.throws(() => parseEthAmount('-1'), /decimal/);
  assert.throws(() => parseEthAmount('0'), /greater than zero/);
});

test('the transaction preview names the fields and has no private key slot', () => {
  const text = describeTransaction({
    action: 'Send ETH',
    chainName: 'Anvil',
    from: ANVIL_DEV_ADDRESS,
    path: "m/44'/60'/0'/0/0",
    to: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    valueWei: 1000000000000000000n,
    fields: {
      nonce: 3,
      gas: 21000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      chainId: 31337,
    },
  });

  assert.match(text, /nonce:\s+3/);
  assert.match(text, /chain id 31337/);
  assert.match(text, /21000/);
  assert.match(text, /gwei/);
  assert.match(text, /Nothing has been broadcast yet/);
  assert.equal(text.includes(ANVIL_DEV_PRIVATE_KEY), false);
  assert.equal(text.includes('1ab42cc41'), false);
});

test('the command parser keeps passwords off the flag list', () => {
  const parsed = parseCli(['send', '--to', '0xabc', '--eth', '0.1', '--yes', '--index', '2']);
  assert.equal(parsed.command, 'send');
  assert.equal(parsed.flags.eth, '0.1');
  assert.equal(parsed.flags.yes, true);
  assert.equal(parsed.flags.index, 2);
  assert.equal('password' in parsed.flags, false);

  const contract = parseCli(['contract', 'deposit', '--eth', '0.05']);
  assert.equal(contract.command, 'contract');
  assert.equal(contract.sub, 'deposit');
});
