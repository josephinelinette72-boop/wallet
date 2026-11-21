/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Which Ethereum network a command talks to.
 *
 * Anvil is a program from Foundry. It runs a pretend Ethereum on your
 * computer, chain id 31337, with accounts full of play ETH. Nothing you do
 * there is visible to the public Ethereum network. It forgets everything
 * when you stop it.
 *
 * Sepolia is a public test network, chain id 11155111. The ETH there is
 * still play money, but the chain is shared and it remembers transactions.
 * Talking to it requires an RPC URL: the https address of a node. That URL
 * often contains an API key, so it belongs in `.env`, which git ignores.
 *
 * This file does not connect to anything. It only decides the settings.
 * `loadConfig` reads the object you pass in. The command-line program loads
 * `.env` first and then calls `loadConfig(process.env)`. Tests pass a fake
 * object so they never read your real `.env`.
 */
import { defineChain, type Chain } from 'viem';
import { sepolia } from 'viem/chains';

export type ChainChoice = 'anvil' | 'sepolia';

export type WalletConfig = {
  chainChoice: ChainChoice;
  chain: Chain;
  rpcUrl: string;
  /** Raw value from VAULT_ADDRESS, if the user set one. Not validated yet. */
  vaultAddressFromEnv?: string;
  /** Raw value from PROPERTY_ADDRESS, if the user set one. Not validated yet. */
  propertyAddressFromEnv?: string;
};

/**
 * We describe Anvil ourselves so the chain id and the currency are visible
 * in this file instead of hidden inside the library.
 *
 * 31337 is Anvil's factory default. Every tool in the Foundry docs uses it.
 * Ether has 18 decimals on every Ethereum network: 1 ETH = 10^18 wei.
 */
export const anvilChain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
});

const ALLOWED = new Set<ChainChoice>(['anvil', 'sepolia']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env, chainOverride?: string): WalletConfig {
  const requested = (chainOverride ?? env.CHAIN ?? 'anvil').trim().toLowerCase();

  if (!ALLOWED.has(requested as ChainChoice)) {
    throw new Error(
      `CHAIN=${requested || '(empty)'} is not allowed. This learning wallet only talks to "anvil" ` +
        '(a local practice chain) and "sepolia" (public testnet). It refuses mainnet so practice ' +
        'cannot spend ETH that has real value.',
    );
  }

  const chainChoice = requested as ChainChoice;

  if (chainChoice === 'anvil') {
    const rpcUrl = env.ANVIL_RPC_URL?.trim() || 'http://127.0.0.1:8545';
    return {
      chainChoice,
      chain: anvilChain,
      rpcUrl,
      vaultAddressFromEnv: blankToUndefined(env.VAULT_ADDRESS),
      propertyAddressFromEnv: blankToUndefined(env.PROPERTY_ADDRESS),
    };
  }

  const rpcUrl = env.SEPOLIA_RPC_URL?.trim() ?? '';
  if (rpcUrl.length === 0) {
    throw new Error(
      'CHAIN is sepolia, but SEPOLIA_RPC_URL is empty. Copy .env.example to .env and set a Sepolia RPC URL. ' +
        'This project does not include an API key. Nothing was sent.',
    );
  }

  return {
    chainChoice,
    // Use Sepolia's well-known chain id (11155111) from viem, but send every
    // request to the URL from .env. We do not fall back to a public RPC baked
    // into the library, because that would hide where the bytes are going.
    chain: sepolia,
    rpcUrl,
    vaultAddressFromEnv: blankToUndefined(env.VAULT_ADDRESS),
    propertyAddressFromEnv: blankToUndefined(env.PROPERTY_ADDRESS),
  };
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
