/**
 * Stand-in for Node's `fs` when Vite builds the web app.
 *
 * `src/vault.ts` and `src/property.ts` import `node:fs` because the CLI reads
 * compiled bytecode and writes `.wallet/*.json`. The browser has no disk.
 * Vite swaps this file in so those modules can still be imported. The page
 * never calls these functions. It keeps the keystore in IndexedDB and asks
 * the dev server for bytecode.
 *
 * If one of them is called, the error names the mistake instead of crashing
 * with "fs is not defined".
 */
function noDisk(name: string): never {
  throw new Error(
    `The web app cannot use Node's ${name}. The keystore stays in this browser. ` +
      'Bytecode is loaded from the dev server, not from a file.',
  );
}

export const readFileSync = (): never => noDisk('readFileSync');
export const writeFileSync = (): never => noDisk('writeFileSync');
export const mkdirSync = (): never => noDisk('mkdirSync');
export const chmodSync = (): never => noDisk('chmodSync');
export const renameSync = (): never => noDisk('renameSync');
export const unlinkSync = (): never => noDisk('unlinkSync');
export const existsSync = (): never => noDisk('existsSync');
