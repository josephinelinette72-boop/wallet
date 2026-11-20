/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The connection to a node.
 *
 * An Ethereum wallet does not store balances. A node does. We send the node
 * JSON-RPC requests over HTTP ("eth_getBalance", "eth_sendRawTransaction",
 * and so on). viem builds those requests. The URL is the only place they go.
 *
 * Before any signature we ask the node for its chain id and compare it with
 * the network the command was aimed at. See `assertExpectedChain`.
 */
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { WalletConfig } from './config.js';
import { assertExpectedChain, redactRpcUrl, scrubSecrets } from './safety.js';

export function makePublicClient(config: WalletConfig): PublicClient {
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl, {
      // One retry, then a clear error. A missing Anvil should not spin for a minute.
      timeout: 10_000,
      retryCount: 1,
    }),
  });
}

export function makeWalletClient(config: WalletConfig, account: PrivateKeyAccount): WalletClient {
  return createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
}

export async function assertNodeIsExpectedChain(publicClient: PublicClient, config: WalletConfig): Promise<void> {
  let actual: number;
  try {
    actual = await publicClient.getChainId();
  } catch (error) {
    throw toFriendlyError(error, config);
  }
  assertExpectedChain(config.chain.id, actual, config.chain.name);
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `\n${error.cause.message}` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}

function looksLikeConnectionProblem(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('enotfound')
  );
}

/**
 * Turn a node error into one sentence that is safe to print.
 * RPC URLs are scrubbed because they may contain an API key.
 */
export function toFriendlyError(error: unknown, config: WalletConfig): Error {
  const raw = scrubSecrets(errorText(error), [config.rpcUrl]);

  if (looksLikeConnectionProblem(raw)) {
    const where = redactRpcUrl(config.rpcUrl);
    if (config.chainChoice === 'anvil') {
      return new Error(
        `Could not reach Anvil at ${where}. Start it in another Ubuntu terminal with: anvil`,
      );
    }
    return new Error(`Could not reach the Sepolia RPC at ${where}. Check SEPOLIA_RPC_URL in .env.`);
  }

  if (raw.toLowerCase().includes('insufficient funds')) {
    if (config.chainChoice === 'anvil') {
      return new Error(
        'This account does not have enough ETH to cover the amount plus the fee. ' +
          'On Anvil, add play ETH with: npm run wallet -- fund --eth 1',
      );
    }
    return new Error(
      'This account does not have enough Sepolia ETH to cover the amount plus the fee. Use a faucet, then try again.',
    );
  }

  if (raw.toLowerCase().includes('nonce too low')) {
    return new Error(
      'The node already has a transaction with this nonce. Wait a moment and run the command again. It will ask for the next nonce.',
    );
  }

  return new Error(raw);
}
