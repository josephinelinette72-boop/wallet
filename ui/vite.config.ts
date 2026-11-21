/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Vite serves the page on every network interface, port 5173, so a browser
 * on Windows can open the Ubuntu dev server at http://localhost:5173.
 *
 * The alias `@wallet` points at `src/`, the CLI. The page imports those
 * files instead of copying them. `node:fs` and `node:path` are swapped for
 * shims only in the page bundle. The dev-server plugin itself keeps using
 * Node's real `fs`, because it is the process that reads bytecode from disk.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { learningWalletDevServer } from './devServerPlugin';

const here = path.dirname(fileURLToPath(import.meta.url));

function browserNodeShims(): Plugin {
  const fsShim = path.resolve(here, 'src/shims/node-fs.ts');
  const pathShim = path.resolve(here, 'src/shims/node-path.ts');
  return {
    name: 'learning-wallet-browser-shims',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'node:fs') return fsShim;
      if (id === 'node:path') return pathShim;
      return null;
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [browserNodeShims(), react(), tailwindcss(), learningWalletDevServer()],
  resolve: {
    alias: {
      '@wallet': path.resolve(here, '../src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [path.resolve(here, '..')],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
