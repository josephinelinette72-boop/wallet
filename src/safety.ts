/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Small pure checks that keep practice commands from reaching a real network.
 * They do not talk to the network themselves. Callers pass in the chain id
 * the node reported and the URL we are about to use.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Hide the secret-looking parts of an RPC URL before it is printed.
 *
 * Providers such as Alchemy and Infura put the API key in the path
 * (`/v2/<key>`) or in the query string (`?apikey=`). The host name is enough
 * to tell a learner which provider they configured.
 */
export function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    if (parsed.pathname.length > 1) {
      parsed.pathname = '/[redacted]';
    }
    if (parsed.search.length > 0) {
      parsed.search = '?[redacted]';
    }
    return parsed.toString();
  } catch {
    return '[unreadable rpc url]';
  }
}

export function scrubSecrets(text: string, secrets: string[]): string {
  let cleaned = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    cleaned = cleaned.split(secret).join('[redacted]');
    try {
      const parsed = new URL(secret);
      if (parsed.pathname.length > 1) {
        cleaned = cleaned.split(parsed.pathname).join('/[redacted]');
      }
      if (parsed.search.length > 1) {
        cleaned = cleaned.split(parsed.search).join('?[redacted]');
      }
    } catch {
      // Not a URL. The split above is the whole scrub.
    }
  }
  return cleaned;
}

/**
 * Stop when the node we reached is not the network the user asked for.
 *
 * A signature contains the chain id (EIP-155). Checking before we sign means
 * a mis-typed RPC URL cannot send an Anvil practice transaction to Sepolia,
 * or worse, to a node whose chain id is 1 (mainnet).
 */
export function assertExpectedChain(expectedChainId: number, actualChainId: number, chainName: string): void {
  if (actualChainId !== expectedChainId) {
    throw new Error(
      `The node reports chain id ${actualChainId}, but ${chainName} uses chain id ${expectedChainId}. ` +
        'The wallet stopped so it would not sign for the wrong network.',
    );
  }
}

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

/**
 * The faucet spends from Anvil's published textbook key. That key is safe
 * only on a node that is both local and using Anvil's default chain id.
 * Either check on its own is not enough: a public server can claim to be
 * chain 31337, and a local node can be pointed at a fork of another chain.
 */
export function assertAnvilFaucetAllowed(chainId: number, rpcUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(rpcUrl).hostname;
  } catch {
    throw new Error('The Anvil faucet needs an http://127.0.0.1 RPC URL. This one could not be read.');
  }

  if (!isLocalHostname(hostname) || chainId !== 31337) {
    throw new Error(
      'The faucet spends from the published Anvil test key. It only runs when the RPC host is this computer ' +
        '(localhost or 127.0.0.1) and the node reports chain id 31337. Nothing was sent.',
    );
  }
}
