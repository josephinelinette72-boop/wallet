/**
 * Parser checks for the property-share commands.
 * The contract's own math is covered by `npm run property:test`.
 * This file checks the pieces that run before a transaction exists:
 * how a share count is read, how a mock-dollar amount is read, and that the
 * handwritten ABI still matches the compiled contract.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseMockDollars, parseShareCount } from '../src/amounts.js';
import { parseCli } from '../src/flags.js';
import { PLACEHOLDER_DOCUMENT_HASH, propertyAbiSignature, propertyShareAbi, mockStablecoinAbi } from '../src/property.js';
import { propertyArtifactPath, stablecoinArtifactPath } from '../src/paths.js';

test('share counts are whole numbers and mock dollars have 6 decimals', () => {
  assert.equal(parseShareCount('250000'), 250_000n);
  assert.equal(parseMockDollars('1'), 1_000_000n);
  assert.equal(parseMockDollars('250.5'), 250_500_000n);
  assert.equal(parseMockDollars('1000'), 1_000_000_000n);

  assert.throws(() => parseShareCount('1.5'), /0 decimals/);
  assert.throws(() => parseShareCount('0'), /greater than zero/);
  assert.throws(() => parseMockDollars('0'), /greater than zero/);
  assert.throws(() => parseMockDollars('1.1234567'), /6 decimal/);
});

test('the placeholder document hash matches the Solidity test vector', () => {
  // keccak256 of the sentence in PropertyShare.t.sol and Deploy.s.sol.
  assert.equal(PLACEHOLDER_DOCUMENT_HASH, '0xf7fd2b8b423d93b9721bcd7657baea1fd683727e3aedeecc0e7a5d1be0812310');
});

test('the property command parser accepts the new flags and still has no password flag', () => {
  const parsed = parseCli([
    'property',
    'transfer',
    '--to',
    '0xabc',
    '--shares',
    '250000',
    '--amount',
    '10',
    '--property',
    '0xdef',
    '--yes',
  ]);
  assert.equal(parsed.command, 'property');
  assert.equal(parsed.sub, 'transfer');
  assert.equal(parsed.flags.shares, '250000');
  assert.equal(parsed.flags.amount, '10');
  assert.equal(parsed.flags.property, '0xdef');
  assert.equal(parsed.flags.yes, true);
  assert.equal('password' in parsed.flags, false);
});

type AbiItem = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: readonly { type?: string }[];
};

function compiledSignatures(artifactPath: string): Set<string> {
  const parsed = JSON.parse(readFileSync(artifactPath, 'utf8')) as { abi?: AbiItem[] };
  return new Set(
    (parsed.abi ?? []).map((item) => propertyAbiSignature(item)).filter((value): value is string => Boolean(value)),
  );
}

test('handwritten property ABI is a subset of the forge artifact', (t) => {
  const property = propertyArtifactPath();
  const stable = stablecoinArtifactPath();
  if (!existsSync(property) || !existsSync(stable)) {
    t.skip('compile with npm run property:build to enable this check');
    return;
  }
  const compiledProperty = compiledSignatures(property);
  const compiledStable = compiledSignatures(stable);
  for (const item of propertyShareAbi) {
    const signature = propertyAbiSignature(item);
    assert.ok(signature, 'every handwritten property entry should have a signature');
    assert.ok(compiledProperty.has(signature), `missing from PropertyShare artifact: ${signature}`);
  }
  for (const item of mockStablecoinAbi) {
    const signature = propertyAbiSignature(item);
    assert.ok(signature, 'every handwritten stablecoin entry should have a signature');
    assert.ok(compiledStable.has(signature), `missing from MockStablecoin artifact: ${signature}`);
  }
});
