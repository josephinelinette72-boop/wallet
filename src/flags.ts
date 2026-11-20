/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Read the command line.
 *
 * `npm run wallet -- send --to 0x... --eth 0.1` arrives here as
 * ['send', '--to', '0x...', '--eth', '0.1']. The `--` is consumed by npm
 * before Node starts, which is why the README is strict about it.
 *
 * There is no password flag. Passwords are read from the terminal later.
 */
import { parseArgs } from 'node:util';

export type Flags = {
  index: number;
  count: number;
  yes: boolean;
  force: boolean;
  to?: string;
  eth?: string;
  message?: string;
  signature?: string;
  address?: string;
  chain?: string;
  vault?: string;
};

export type ParsedCli = {
  command?: string;
  sub?: string;
  flags: Flags;
  help: boolean;
};

function wholeNumber(value: string | undefined, fallback: number, label: string, max: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a whole number written in digits, such as 0 or 1.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new Error(`${label} must be between 0 and ${max}.`);
  }
  return parsed;
}

export function parseCli(argv: string[]): ParsedCli {
  let values: {
    index?: string;
    count?: string;
    to?: string;
    eth?: string;
    message?: string;
    signature?: string;
    address?: string;
    chain?: string;
    vault?: string;
    force: boolean;
    yes: boolean;
    help: boolean;
  };
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        index: { type: 'string' },
        count: { type: 'string' },
        to: { type: 'string' },
        eth: { type: 'string' },
        message: { type: 'string' },
        signature: { type: 'string' },
        address: { type: 'string' },
        chain: { type: 'string' },
        vault: { type: 'string' },
        force: { type: 'boolean', default: false },
        yes: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the command.';
    throw new Error(`${message}\nRun: npm run wallet -- help`);
  }

  // The CLI cap is smaller than the BIP-32 maximum so a typo cannot ask the
  // machine to derive millions of keys. The library itself allows the full range.
  const flags: Flags = {
    index: wholeNumber(values.index, 0, '--index', 100),
    count: wholeNumber(values.count, 5, '--count', 20),
    yes: values.yes,
    force: values.force,
    to: values.to,
    eth: values.eth,
    message: values.message,
    signature: values.signature,
    address: values.address,
    chain: values.chain,
    vault: values.vault,
  };

  if (flags.count < 1) {
    throw new Error('--count must be at least 1.');
  }

  return {
    command: positionals[0],
    sub: positionals[1],
    flags,
    help: values.help,
  };
}

export const HELP = `
Learning wallet. Never use a seed phrase that controls real money.

  npm run wallet -- create
  npm run wallet -- import [--force]
  npm run wallet -- addresses [--count 5]
  npm run wallet -- balance [--index 0] [--address 0x...]
  npm run wallet -- fund --eth 1 [--index 0] [--address 0x...]
  npm run wallet -- send --to 0x... --eth 0.1 [--index 0] [--yes]
  npm run wallet -- sign --message "hello" [--index 0]
  npm run wallet -- verify --message "hello" --signature 0x... --address 0x...
  npm run wallet -- contract deploy [--index 0] [--yes]
  npm run wallet -- contract status [--index 0] [--address 0x...]
  npm run wallet -- contract deposit --eth 0.1 [--index 0] [--yes]
  npm run wallet -- contract withdraw --eth 0.1 [--index 0] [--yes]

The "--" is required. It tells npm that the words after it belong to the wallet.

--chain anvil|sepolia   override CHAIN from .env for one command
--index N               which address from the phrase (default 0)
--yes                   broadcast without typing YES (the fields are still printed)
--force                 allow create/import to replace an existing keystore
--vault 0x...           contract address for one command

Balances and verify do not need your words when you pass --address.
fund only works against local Anvil (chain id 31337). It spends from Anvil's
published textbook key, which is not a secret.
`.trim();
