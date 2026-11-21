/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The small server that sits next to the page during `npm run ui`.
 *
 * Two jobs, both local:
 *
 * 1. Forward JSON-RPC. The page asks `/rpc`. This process asks Anvil, or the
 *    Sepolia URL the page names in a header. The browser never opens a second
 *    port. That matters on WSL: the Windows browser can see Ubuntu's port
 *    5173, and this process (inside Ubuntu) can see Anvil on port 8545.
 *
 * 2. Hand the page the compiled contract bytecode, and nothing else from the
 *    Foundry artifact. The page needs those bytes to deploy. It does not need
 *    the compiler's metadata.
 *
 * This is not a public service. It runs on your computer when the dev server
 * runs, and it stops when you stop `npm run ui`. It does not log the RPC URL,
 * because a Sepolia URL often contains an API key.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import { isAllowedRpcTarget } from '../src/rpcTarget';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ARTIFACTS: Record<string, string> = {
  '/contracts/LearningVault.json': path.join('foundry', 'out', 'LearningVault.sol', 'LearningVault.json'),
  '/contracts/PropertyShare.json': path.join('property-token', 'out', 'PropertyShare.sol', 'PropertyShare.json'),
  '/contracts/MockStablecoin.json': path.join('property-token', 'out', 'MockStablecoin.sol', 'MockStablecoin.json'),
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function serveContract(pathname: string, res: http.ServerResponse): void {
  const relative = ARTIFACTS[pathname];
  if (!relative) {
    sendJson(res, 404, { error: 'Unknown contract.' });
    return;
  }
  const full = path.join(repoRoot, relative);
  if (!fs.existsSync(full)) {
    const hint = pathname.includes('LearningVault')
      ? 'npm run contracts:build'
      : 'npm run property:build';
    sendJson(res, 404, {
      error: `That contract has not been compiled yet. In the project folder run: ${hint}`,
    });
    return;
  }
  let parsed: { bytecode?: { object?: unknown } };
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as { bytecode?: { object?: unknown } };
  } catch {
    sendJson(res, 500, { error: 'The compiler output was not valid JSON. Build the contracts again.' });
    return;
  }
  const bytecode = parsed.bytecode?.object;
  if (typeof bytecode !== 'string' || !bytecode.startsWith('0x')) {
    sendJson(res, 500, { error: 'The compiler output had no bytecode. Build the contracts again.' });
    return;
  }
  sendJson(res, 200, { bytecode });
}

function proxyRpc(req: Connect.IncomingMessage, res: http.ServerResponse): void {
  if (req.method !== 'POST') {
    sendJson(res, 405, {
      error: 'This path forwards JSON-RPC for the page. Opening it in the address bar does nothing.',
    });
    return;
  }

  const header = req.headers['x-rpc-target'];
  const target = Array.isArray(header) ? header[0] : header;
  if (!target || !isAllowedRpcTarget(target)) {
    sendJson(res, 400, {
      error:
        'That RPC URL is not forwarded. Anvil must be http://127.0.0.1 or http://localhost with a port. Sepolia must be https.',
    });
    return;
  }

  const lib = target.startsWith('https:') ? https : http;
  const proxyReq = lib.request(
    target,
    { method: 'POST', headers: { 'content-type': 'application/json' }, timeout: 15_000 },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode ?? 502;
      res.setHeader('content-type', proxyRes.headers['content-type'] ?? 'application/json');
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('timeout')));
  proxyReq.on('error', () => {
    if (res.headersSent) return;
    sendJson(res, 502, {
      error: 'Could not reach the Ethereum node. If this is Anvil, start it in Ubuntu with: anvil',
    });
  });
  req.pipe(proxyReq);
}

function attach(middlewares: Connect.Server): void {
  middlewares.use((req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    if (pathname.startsWith('/contracts/')) {
      serveContract(pathname, res);
      return;
    }
    if (pathname !== '/rpc') {
      next();
      return;
    }
    proxyRpc(req, res);
  });
}

export function learningWalletDevServer(): Plugin {
  return {
    name: 'learning-wallet-dev-server',
    configureServer(server: ViteDevServer) {
      attach(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attach(server.middlewares);
    },
  };
}
