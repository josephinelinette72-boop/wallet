/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Commands for the Solidity contract in foundry/src/LearningVault.sol.
 *
 *   deploy    create the contract. The bytecode comes from `forge build`.
 *   status    free reads: balanceOf(you) and the ETH sitting on the contract.
 *   deposit   a payable transaction. ETH moves in the value field.
 *   withdraw  a transaction whose value is 0. The contract sends the ETH.
 */
import { formatEther } from 'viem';
import { parseUserAddress } from '../address.js';
import { parseEthAmount } from '../amounts.js';
import { printRealFundsWarning } from '../banner.js';
import { loadConfig } from '../config.js';
import type { Flags } from '../flags.js';
import { confirmYes } from '../prompt.js';
import { unlockAccount } from '../unlock.js';
import {
  deployVault,
  prepareVaultWrite,
  readVaultStatus,
  resolveVaultAddress,
  saveVaultRecord,
} from '../vault.js';

export async function contractCommand(sub: string | undefined, flags: Flags): Promise<void> {
  if (sub === 'deploy') {
    await deploy(flags);
    return;
  }
  if (sub === 'status') {
    await status(flags);
    return;
  }
  if (sub === 'deposit' || sub === 'withdraw') {
    await write(sub, flags);
    return;
  }

  throw new Error(
    'contract needs a subcommand: deploy, status, deposit, or withdraw.\n' +
      'Examples:\n' +
      '  npm run wallet -- contract deploy\n' +
      '  npm run wallet -- contract status\n' +
      '  npm run wallet -- contract deposit --eth 0.1\n' +
      '  npm run wallet -- contract withdraw --eth 0.05',
  );
}

async function deploy(flags: Flags): Promise<void> {
  printRealFundsWarning();
  const config = loadConfig(process.env, flags.chain);
  const unlocked = await unlockAccount(flags.index);
  const prepared = await deployVault({
    config,
    account: unlocked.account,
    path: unlocked.path,
  });
  console.log(prepared.preview);
  await confirmYes(flags.yes);
  const { hash, address } = await prepared.send();
  const filePath = saveVaultRecord({
    address,
    chainId: config.chain.id,
    deployedAt: new Date().toISOString(),
  });
  console.log(`LearningVault deployed at ${address}`);
  console.log(`Transaction hash: ${hash}`);
  console.log(`Saved the address to ${filePath}`);
  console.log('Stopping Anvil forgets the contract. The keystore file remains. Deploy again after a restart.');
  console.log('Try: npm run wallet -- contract status');
}

async function status(flags: Flags): Promise<void> {
  const config = loadConfig(process.env, flags.chain);
  const unlocked = flags.address ? undefined : await unlockAccount(flags.index);
  const who = flags.address ? parseUserAddress(flags.address) : unlocked!.address;
  const vault = resolveVaultAddress({ config, flag: flags.vault });
  const snapshot = await readVaultStatus({ config, vault, who });

  console.log(`Vault:   ${snapshot.address}`);
  console.log(`Source:  ${snapshot.source}`);
  console.log(`Network: ${config.chain.name} (chain id ${config.chain.id})`);
  if (unlocked) console.log(`Path:    ${unlocked.path}`);
  console.log(`You:     ${who}`);
  console.log(`Your saved balance (balanceOf): ${formatEther(snapshot.yourSavedWei)} ETH`);
  console.log(`                            ${snapshot.yourSavedWei.toString()} wei`);
  console.log(`Contract totalEth() view:       ${formatEther(snapshot.ledgerTotalWei)} ETH`);
  console.log(`Node balance of the contract:   ${formatEther(snapshot.nodeBalanceWei)} ETH`);
  console.log('');
  console.log('balanceOf is the contract\'s ledger: how much you are allowed to withdraw.');
  console.log('totalEth() and the node balance are the ETH actually sitting on the contract.');
  console.log('They match when every wei arrived through deposit and left through withdraw.');
  console.log('These are free reads. No signature, no fee, no nonce.');
}

async function write(functionName: 'deposit' | 'withdraw', flags: Flags): Promise<void> {
  if (!flags.eth) {
    throw new Error(`contract ${functionName} needs --eth.\nExample: npm run wallet -- contract ${functionName} --eth 0.1`);
  }

  printRealFundsWarning();
  const config = loadConfig(process.env, flags.chain);
  const amountWei = parseEthAmount(flags.eth);
  const unlocked = await unlockAccount(flags.index);
  const vault = resolveVaultAddress({ config, flag: flags.vault });
  const prepared = await prepareVaultWrite({
    config,
    account: unlocked.account,
    path: unlocked.path,
    vault: vault.address,
    functionName,
    amountWei,
  });
  console.log(`Vault from ${vault.source}: ${vault.address}`);
  console.log(prepared.preview);
  await confirmYes(flags.yes);
  const hash = await prepared.send();
  console.log(`Broadcast. Transaction hash: ${hash}`);
}
