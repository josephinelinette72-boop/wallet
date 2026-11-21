/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The front door. `npm run wallet -- <command>` runs this file.
 *
 * Each command lives in src/commands/. This file only:
 *   1. loads .env (so SEPOLIA_RPC_URL can exist without being typed every time)
 *   2. parses flags
 *   3. calls the command
 *   4. prints one safe error line if something throws
 *
 * Error objects in this program are written so their messages do not contain
 * a mnemonic, a password, or a private key. Do not attach those values to an
 * Error. The DEBUG=1 stack trace shows function names, not those secrets.
 */
import dotenv from 'dotenv';
import { addressesCommand } from './commands/addresses.js';
import { balanceCommand } from './commands/balance.js';
import { contractCommand } from './commands/contract.js';
import { createCommand } from './commands/create.js';
import { fundCommand } from './commands/fund.js';
import { importCommand } from './commands/importWallet.js';
import { propertyCommand } from './commands/property.js';
import { sendCommand } from './commands/send.js';
import { signCommand } from './commands/sign.js';
import { verifyCommand } from './commands/verify.js';
import { HELP, parseCli } from './flags.js';

dotenv.config();

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2));
  if (!parsed.command || parsed.command === 'help' || parsed.help) {
    console.log(HELP);
    return;
  }

  switch (parsed.command) {
    case 'create':
      await createCommand(parsed.flags.force);
      return;
    case 'import':
      await importCommand(parsed.flags.force);
      return;
    case 'addresses':
      await addressesCommand(parsed.flags);
      return;
    case 'balance':
      await balanceCommand(parsed.flags);
      return;
    case 'fund':
      await fundCommand(parsed.flags);
      return;
    case 'send':
      await sendCommand(parsed.flags);
      return;
    case 'sign':
      await signCommand(parsed.flags);
      return;
    case 'verify':
      await verifyCommand(parsed.flags);
      return;
    case 'contract':
      await contractCommand(parsed.sub, parsed.flags);
      return;
    case 'property':
      await propertyCommand(parsed.sub, parsed.flags);
      return;
    default:
      console.log(HELP);
      throw new Error(`Unknown command "${parsed.command}".`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('');
  console.error(message);
  if (process.env.DEBUG === '1' && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
