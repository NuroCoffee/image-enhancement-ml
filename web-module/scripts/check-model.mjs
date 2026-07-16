import { readFile, readdir } from 'node:fs/promises';

const modelDir = new URL('../public/model/', import.meta.url);
const files = await readdir(modelDir);
for (const required of ['model.json', 'model_metadata.json']) {
  if (!files.includes(required)) throw new Error(`Missing public/model/${required}`);
}
const model = JSON.parse(await readFile(new URL('model.json', modelDir), 'utf8'));
const paths = model.weightsManifest?.flatMap((group) => group.paths ?? []) ?? [];
if (paths.length === 0) throw new Error('model.json has no weight shard paths.');
for (const path of paths) {
  if (!files.includes(path)) throw new Error(`Missing public/model/${path}`);
}
console.log(`Model is complete: ${paths.length} shard(s).`);
