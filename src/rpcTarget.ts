/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Which RPC URLs the web app's dev server is willing to forward.
 *
 * The page in the browser cannot call Anvil directly. A Windows browser and
 * Ubuntu do not share "this computer", and browsers also block the call
 * (CORS). The Vite server, which is running inside Ubuntu next to Anvil,
 * forwards JSON-RPC for the page. This check is the allow-list for that
 * forwarder.
 *
 *   http  is allowed only for localhost, so the forwarder cannot be aimed
 *         at some other machine on the network.
 *   https is allowed for a named host, which is how Sepolia providers work.
 *         A URL with a username or password is refused. API keys belong in
 *         the path or the query string, and the page redacts those before
 *         showing the URL.
 *
 * The CLI does not use this. It talks to the RPC URL itself.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isAllowedRpcTarget(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username.length > 0 || url.password.length > 0) return false;

  if (url.protocol === 'http:') {
    if (!LOCAL_HOSTS.has(url.hostname)) return false;
    const port = Number(url.port);
    return Number.isInteger(port) && port > 0 && port < 65536;
  }

  if (url.protocol === 'https:') {
    // An https URL pointed at this computer is not a Sepolia provider.
    if (LOCAL_HOSTS.has(url.hostname)) return false;
    if (!url.hostname.includes('.')) return false;
    return true;
  }

  return false;
}
