/**
 * The TypeScript ABI is what the wallet sends. The Solidity file is what
 * Foundry compiles. This test compares them once the artifact exists, so a
 * renamed function cannot ship in only one of the two places.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { vaultArtifactPath } from '../src/paths.js';
import { learningVaultAbi } from '../src/vault.js';

type AbiItem = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { type?: string }[];
};

function signature(item: AbiItem): string | undefined {
  if (item.type === 'constructor') return 'constructor';
  if (!item.name || (item.type !== 'function' && item.type !== 'event')) return undefined;
  const inputs = (item.inputs ?? []).map((input) => input.type ?? '').join(',');
  if (item.type === 'event') return `event ${item.name}(${inputs})`;
  return `function ${item.name}(${inputs}) ${item.stateMutability ?? ''}`;
}

test('handwritten ABI matches the forge artifact when the contract is compiled', (t) => {
  const artifact = vaultArtifactPath();
  if (!existsSync(artifact)) {
    t.skip('compile with npm run contracts:build to enable this check');
    return;
  }

  const parsed = JSON.parse(readFileSync(artifact, 'utf8')) as { abi?: AbiItem[] };
  const compiled = new Set((parsed.abi ?? []).map(signature).filter((value): value is string => Boolean(value)));
  const handwritten = new Set(
    (learningVaultAbi as readonly unknown[])
      .map((item) => signature(item as AbiItem))
      .filter((value): value is string => Boolean(value)),
  );

  assert.deepEqual([...handwritten].sort(), [...compiled].sort());
});
