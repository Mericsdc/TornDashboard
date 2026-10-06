import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot, extensionRoot } from './extension-runtime.mjs';

const version = process.argv[2];
const current = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')).version;
const parts = value => value.split('.').map(Number);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || parts(version).some(part => part > 65535)) throw new Error('Use a Chrome-compatible version, for example npm run version:set -- 0.4.1');
const firstDifference = parts(version).findIndex((part, index) => part !== parts(current)[index]);
if (firstDifference < 0 || parts(version)[firstDifference] < parts(current)[firstDifference]) throw new Error(`Version must increase from ${current}`);
const paths = ['package.json', 'packages/extension/manifest.json', ...(await readdir(join(projectRoot, 'packages'))).map(name => `packages/${name}/package.json`)];
for (const filename of paths) {
  const absolute = join(projectRoot, filename); const contents = JSON.parse(await readFile(absolute, 'utf8')); contents.version = version;
  await writeFile(absolute, `${JSON.stringify(contents, null, 2)}\n`);
}
const lockFile = join(projectRoot, 'package-lock.json'); const lock = JSON.parse(await readFile(lockFile, 'utf8'));
lock.version = version;
for (const [name, contents] of Object.entries(lock.packages)) if (name === '' || /^packages\//.test(name)) contents.version = version;
await writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
const rootFile = join(extensionRoot, 'package.json'); const root = JSON.parse(await readFile(rootFile, 'utf8'));
root.version = version; await writeFile(rootFile, `${JSON.stringify(root, null, 2)}\n`);
console.log(`Source version ${current} → ${version}. Run npm run check, then npm run package.`);
