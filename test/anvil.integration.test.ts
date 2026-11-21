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
import { propertyArtifactPath, vaultArtifactPath } from '../src/paths.js';
import {
  encodeApproveStable,
  encodeClaimEth,
  encodeDepositEth,
  encodeDepositStable,
  encodeMintStable,
  encodePropertyDeploy,
  encodeSetAllowed,
  encodeStablecoinDeploy,
  encodeTransferShares,
  PLAY_DOLLARS_BASE_UNITS,
  prepareCall,
  prepareDeploy,
  readPropertyOverview,
} from '../src/property.js';
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

test('local anvil: property shares, a mid-stream sale, and a claim', { timeout: 60_000 }, async (t) => {
  if (!anvilInstalled()) {
    t.skip('anvil is not on PATH');
    return;
  }
  if (!existsSync(propertyArtifactPath())) {
    t.skip('compile with npm run property:build to cover the property commands');
    return;
  }

  const child: ChildProcess = spawn(
    'anvil',
    ['--host', '127.0.0.1', '--port', '18546', '--chain-id', '31337'],
    { stdio: 'ignore' },
  );
  t.after(() => {
    child.kill('SIGKILL');
  });

  const rpcUrl = 'http://127.0.0.1:18546';
  await waitForRpc(rpcUrl);
  const config = loadConfig({ CHAIN: 'anvil', ANVIL_RPC_URL: rpcUrl });
  const seller = accountFromMnemonic(PHRASE, 0);
  const buyer = accountFromMnemonic(PHRASE, 1);
  await fundAddress(config, seller.address, parseEther('2'));
  await fundAddress(config, buyer.address, parseEther('1'));

  const stableDeploy = await prepareDeploy({
    config,
    account: seller.account,
    path: seller.path,
    data: encodeStablecoinDeploy(seller.address),
    action: 'deploy mock dollar',
    note: 'test',
  });
  const stable = await stableDeploy.send();
  assert.ok(stable.contractAddress);

  const propertyDeploy = await prepareDeploy({
    config,
    account: seller.account,
    path: seller.path,
    data: encodePropertyDeploy({ stablecoin: stable.contractAddress, admin: seller.address }),
    action: 'deploy property',
    note: 'test',
  });
  const property = await propertyDeploy.send();
  assert.ok(property.contractAddress);
  const propertyAddress = property.contractAddress;

  const mint = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: stable.contractAddress,
    data: encodeMintStable(seller.address, PLAY_DOLLARS_BASE_UNITS),
    valueWei: 0n,
    action: 'mint',
    note: 'test',
  });
  await mint.send();

  const allow = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: propertyAddress,
    data: encodeSetAllowed(buyer.address, true),
    valueWei: 0n,
    action: 'allow',
    note: 'test',
  });
  await allow.send();

  const sale = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: propertyAddress,
    data: encodeTransferShares(buyer.address, 250_000n),
    valueWei: 0n,
    action: 'transfer',
    note: 'test',
  });
  await sale.send();

  const deposit = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: propertyAddress,
    data: encodeDepositEth(),
    valueWei: parseEther('1'),
    action: 'deposit',
    note: 'test',
  });
  await deposit.send();

  const resolved = { address: propertyAddress, source: 'test' };
  const sellerView = await readPropertyOverview({ config, property: resolved, who: seller.address });
  const buyerView = await readPropertyOverview({ config, property: resolved, who: buyer.address });
  assert.equal(sellerView.yourShares, 750_000n);
  assert.equal(buyerView.yourShares, 250_000n);
  assert.equal(sellerView.claimableEthWei, parseEther('0.75'));
  assert.equal(buyerView.claimableEthWei, parseEther('0.25'));

  const claim = await prepareCall({
    config,
    account: buyer.account,
    path: buyer.path,
    to: propertyAddress,
    data: encodeClaimEth(),
    valueWei: 0n,
    action: 'claim',
    note: 'test',
  });
  await claim.send();
  const buyerAfterClaim = await readPropertyOverview({ config, property: resolved, who: buyer.address });
  assert.equal(buyerAfterClaim.claimableEthWei, 0n);

  // Selling more shares does not move the rent the seller already earned.
  const secondSale = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: propertyAddress,
    data: encodeTransferShares(buyer.address, 250_000n),
    valueWei: 0n,
    action: 'transfer',
    note: 'test',
  });
  await secondSale.send();
  const sellerAfterSale = await readPropertyOverview({ config, property: resolved, who: seller.address });
  assert.equal(sellerAfterSale.yourShares, 500_000n);
  assert.equal(sellerAfterSale.claimableEthWei, parseEther('0.75'));

  const approve = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: stable.contractAddress,
    data: encodeApproveStable(propertyAddress, 1_000_000_000n),
    valueWei: 0n,
    action: 'approve',
    note: 'test',
  });
  await approve.send();
  const stableDeposit = await prepareCall({
    config,
    account: seller.account,
    path: seller.path,
    to: propertyAddress,
    data: encodeDepositStable(1_000_000_000n),
    valueWei: 0n,
    action: 'deposit stable',
    note: 'test',
  });
  await stableDeposit.send();
  const sellerDollars = await readPropertyOverview({ config, property: resolved, who: seller.address });
  const buyerDollars = await readPropertyOverview({ config, property: resolved, who: buyer.address });
  // 50/50 after the second sale. 1000 mock dollars, 6 decimals.
  assert.equal(sellerDollars.claimableStableBase, 500_000_000n);
  assert.equal(buyerDollars.claimableStableBase, 500_000_000n);
  // The ETH from the first round did not get paid out again.
  assert.equal(sellerDollars.claimableEthWei, parseEther('0.75'));
  assert.equal(buyerDollars.claimableEthWei, 0n);
});
