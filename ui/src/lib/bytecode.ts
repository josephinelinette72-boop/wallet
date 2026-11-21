/**
 * Compiled contract bytes, from the dev server.
 *
 * `npm run contracts:build` and `npm run property:build` write Foundry's
 * JSON on disk. The dev server reads `bytecode.object` out of those files
 * and the page deploys that. The same bytes are what the CLI reads in
 * `loadVaultBytecode` and `loadPropertyBytecode`.
 */
import type { Hex } from 'viem';

export type ContractArtifact = 'LearningVault' | 'PropertyShare' | 'MockStablecoin';

export async function fetchBytecode(name: ContractArtifact): Promise<Hex> {
  const response = await fetch(`/contracts/${name}.json`);
  let body: { bytecode?: string; error?: string } | undefined;
  try {
    body = (await response.json()) as { bytecode?: string; error?: string };
  } catch {
    body = undefined;
  }
  if (!response.ok || typeof body?.bytecode !== 'string' || !body.bytecode.startsWith('0x')) {
    throw new Error(
      body?.error ??
        `Could not load ${name} bytecode. Build it first. The vault command is npm run contracts:build. The property command is npm run property:build.`,
    );
  }
  return body.bytecode as Hex;
}
