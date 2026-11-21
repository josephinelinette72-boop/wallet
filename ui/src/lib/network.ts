/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * How the page chooses Anvil or Sepolia, and how its requests reach the node.
 *
 * `loadConfig` is the CLI's function. It refuses any chain name except
 * anvil and sepolia. The page calls it with the URLs from the network panel
 * instead of reading a `.env` file.
 *
 * `installBrowserRpcProxy` replaces viem's fetch. The URL string stays the
 * real node URL, so the faucet still sees 127.0.0.1 and the chain-id check
 * still sees whatever the node reports. The bytes travel to `/rpc` on this
 * page's origin. The dev server forwards them. See `ui/devServerPlugin.ts`.
 */
import { setRpcFetch } from '@wallet/client';
import { loadConfig, type ChainChoice, type WalletConfig } from '@wallet/config';
import { isAllowedRpcTarget } from '@wallet/rpcTarget';

export function installBrowserRpcProxy(): void {
  setRpcFetch((input, init) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return fetch(`${window.location.origin}/rpc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rpc-target': target,
      },
      body: init?.body,
      signal: init?.signal,
    });
  });
}

export function browserConfig(choice: ChainChoice, anvilUrl: string, sepoliaUrl: string): WalletConfig {
  return loadConfig(
    {
      CHAIN: choice,
      ANVIL_RPC_URL: anvilUrl.trim(),
      SEPOLIA_RPC_URL: sepoliaUrl.trim(),
    },
    choice,
  );
}

export function rpcProblem(url: string): string | null {
  if (isAllowedRpcTarget(url)) return null;
  return 'Anvil must be http://127.0.0.1 or http://localhost with a port, such as http://127.0.0.1:8545. A Sepolia URL must start with https://. Nothing was sent.';
}
