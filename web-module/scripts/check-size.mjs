import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const limit = 10 * 1024 * 1024;
const root = new URL('../dist/', import.meta.url);
const bytes = await directorySize(root.pathname);
console.log(`dist size: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
if (bytes > limit) {
  throw new Error(`Production build exceeds 10 MiB: ${bytes} bytes.`);
}

async function directorySize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(child);
    else total += (await stat(child)).size;
  }
  return total;
}
