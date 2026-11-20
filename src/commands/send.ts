/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Sign and broadcast an ETH transfer.
 *
 * The preview is printed first. The signature is made only after YES (or
 * after --yes). The private key never appears in the preview.
 */
import { parseUserAddress } from '../address.js';
import { parseEthAmount } from '../amounts.js';
import { printRealFundsWarning } from '../banner.js';
import { loadConfig } from '../config.js';
import type { Flags } from '../flags.js';
import { confirmYes } from '../prompt.js';
import { prepareEthTransfer } from '../transfer.js';
import { unlockAccount } from '../unlock.js';

export async function sendCommand(flags: Flags): Promise<void> {
  if (!flags.to || !flags.eth) {
    throw new Error('send needs --to and --eth.\nExample: npm run wallet -- send --to 0x... --eth 0.1');
  }

  printRealFundsWarning();
  const config = loadConfig(process.env, flags.chain);
  const to = parseUserAddress(flags.to);
  const valueWei = parseEthAmount(flags.eth);
  const unlocked = await unlockAccount(flags.index);
  const prepared = await prepareEthTransfer({
    config,
    account: unlocked.account,
    path: unlocked.path,
    to,
    valueWei,
  });

  console.log(prepared.preview);
  await confirmYes(flags.yes);
  const hash = await prepared.send();
  console.log(`Broadcast. Transaction hash: ${hash}`);
  console.log('The hash is public. It identifies the transaction. It is not a key.');
}
