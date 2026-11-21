/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Give an address some Anvil play ETH, paid by Anvil's published textbook account.
 *
 * The safety checks live in `fundAddress`: localhost, and chain id 31337.
 * Passing --address skips the keystore, because the faucet key is the sender
 * and the destination is already known.
 */
import { formatEther } from 'viem';
import { parseUserAddress } from '../address.js';
import { parseEthAmount } from '../amounts.js';
import { fundAddress } from '../anvilDev.js';
import { printRealFundsWarning } from '../banner.js';
import { loadConfig } from '../config.js';
import type { Flags } from '../flags.js';
import { unlockAccount } from '../unlock.js';

export async function fundCommand(flags: Flags): Promise<void> {
  if (!flags.eth) {
    throw new Error('fund needs --eth.\nExample: npm run wallet -- fund --eth 1');
  }

  printRealFundsWarning();
  console.log('This spends from Anvil account 0. That private key is published with Anvil. It is not yours.');
  const config = loadConfig(process.env, flags.chain);
  const valueWei = parseEthAmount(flags.eth);
  const destination = flags.address ? parseUserAddress(flags.address) : (await unlockAccount(flags.index)).address;
  const hash = await fundAddress(config, destination, valueWei);
  console.log(`Sent ${formatEther(valueWei)} play ETH to ${destination}.`);
  console.log(`Transaction hash: ${hash}`);
}
