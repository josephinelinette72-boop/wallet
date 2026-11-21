/**
 * Stand-in for Node's `path` when Vite builds the web app.
 *
 * See `node-fs.ts`. The shared contract modules import `path` only to build
 * filenames for the CLI. The page does not call these.
 */
const pathShim = {
  join(...parts: string[]): string {
    return parts.join('/');
  },
  dirname(file: string): string {
    const parts = file.split('/');
    parts.pop();
    return parts.join('/');
  },
};

export default pathShim;
