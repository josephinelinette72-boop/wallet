/**
 * Optional end-to-end check against a private Anvil on port 18545.
 *
 * It starts its own node so it does not touch an Anvil you already have on
 * port 8545. The phrase is the public test vector. If `anvil` is not on
 * PATH the test is skipped. `npm test` still passes; `forge test` covers the
 * contract without a node.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { parseEther } from 'viem';
import { accountFromMnemonic } from '../src/account.js';
import { fundAddress } from '../src/anvilDev.js';
import { makePublicClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';
import { vaultArtifactPath } from '../src/paths.js';
import { prepareEthTransfer } from '../src/transfer.js';
import { deployVault, prepareVaultWrite, readVaultStatus } from '../src/vault.js';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PORT = 18545;
const RPC_URL = `http://127.0.0.1:${PORT}`;

function anvilInstalled(): boolean {
  const result = spawnSync('anvil', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

async function waitForRpc(url: string): Promise<void> {
  const started = Date.now();
  let lastError = 'not started';
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (response.ok) {
        const body = (await response.json()) as { result?: string };
        if (body.result !== undefined && Number.parseInt(body.result, 16) === 31337) return;
        lastError = `chain id ${body.result ?? 'missing'}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'fetch failed';
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Anvil did not become ready on ${url}: ${lastError}`);
}

test('local anvil: fund, send, and use the vault when it is compiled', { timeout: 60_000 }, async (t) => {
  if (!anvilInstalled()) {
    t.skip('anvil is not on PATH');
    return;
  }

  const child: ChildProcess = spawn(
    'anvil',
    ['--host', '127.0.0.1', '--port', String(PORT), '--chain-id', '31337'],
    { stdio: 'ignore' },
  );
  t.after(() => {
    child.kill('SIGKILL');
  });

  await waitForRpc(RPC_URL);
  const config = loadConfig({ CHAIN: 'anvil', ANVIL_RPC_URL: RPC_URL });
  const first = accountFromMnemonic(PHRASE, 0);
  const second = accountFromMnemonic(PHRASE, 1);
  const publicClient = makePublicClient(config);

  const fundHash = await fundAddress(config, first.address, parseEther('2'));
  assert.equal(fundHash.startsWith('0x'), true);
  assert.equal(await publicClient.getBalance({ address: first.address }), parseEther('2'));

  const prepared = await prepareEthTransfer({
    config,
    account: first.account,
    path: first.path,
    to: second.address,
    valueWei: parseEther('0.5'),
  });
  assert.match(prepared.preview, /nonce/);
  assert.match(prepared.preview, /chain id 31337/);
  const sendHash = await prepared.send();
  assert.equal((await publicClient.getTransactionReceipt({ hash: sendHash })).status, 'success');
  assert.equal(await publicClient.getBalance({ address: second.address }), parseEther('0.5'));
  assert.equal(await publicClient.getTransactionCount({ address: first.address }), 1);

  if (!existsSync(vaultArtifactPath())) {
    t.diagnostic('vault artifact missing; run npm run contracts:build to cover deploy/deposit/withdraw');
    return;
  }

  const deployment = await deployVault({ config, account: first.account, path: first.path });
  const deployed = await deployment.send();
  const statusBefore = await readVaultStatus({
    config,
    vault: { address: deployed.address, source: 'test' },
    who: first.address,
  });
  assert.equal(statusBefore.yourSavedWei, 0n);

  const deposit = await prepareVaultWrite({
    config,
    account: first.account,
    vault: deployed.address,
    functionName: 'deposit',
    amountWei: parseEther('0.25'),
  });
  await deposit.send();

  const withdraw = await prepareVaultWrite({
    config,
    account: first.account,
    vault: deployed.address,
    functionName: 'withdraw',
    amountWei: parseEther('0.1'),
  });
  await withdraw.send();

  const statusAfter = await readVaultStatus({
    config,
    vault: { address: deployed.address, source: 'test' },
    who: first.address,
  });
  assert.equal(statusAfter.yourSavedWei, parseEther('0.15'));
  assert.equal(statusAfter.ledgerTotalWei, parseEther('0.15'));
  assert.equal(statusAfter.nodeBalanceWei, parseEther('0.15'));
});
