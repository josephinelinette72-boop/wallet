/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Where files live on disk.
 *
 * The wallet always reads and writes relative to the folder you ran the
 * command from (`process.cwd()`). Run the commands from the project folder
 * so the keystore ends up at `<project>/.wallet/keystore.json` and not in
 * some other directory you happened to be standing in.
 *
 * `.wallet` starts with a dot, the Unix convention for "hidden". Git ignores
 * the whole folder. The keystore is encrypted, and the vault file is only an
 * address, but neither belongs in a commit.
 */
import path from 'node:path';

export function walletDir(cwd = process.cwd()): string {
  return path.join(cwd, '.wallet');
}

export function keystorePath(cwd = process.cwd()): string {
  return path.join(walletDir(cwd), 'keystore.json');
}

export function vaultRecordPath(cwd = process.cwd()): string {
  return path.join(walletDir(cwd), 'vault.json');
}

export function vaultArtifactPath(projectRoot = process.cwd()): string {
  // Foundry writes one JSON file per contract. `bytecode.object` in that file
  // is the bytes we send when we deploy. It does not exist until `forge build`.
  return path.join(projectRoot, 'foundry', 'out', 'LearningVault.sol', 'LearningVault.json');
}

export function propertyRecordPath(cwd = process.cwd()): string {
  return path.join(walletDir(cwd), 'property.json');
}

export function propertyArtifactPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, 'property-token', 'out', 'PropertyShare.sol', 'PropertyShare.json');
}

export function stablecoinArtifactPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, 'property-token', 'out', 'MockStablecoin.sol', 'MockStablecoin.json');
}
