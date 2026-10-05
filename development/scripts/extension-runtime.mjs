import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const extensionRoot = resolve(projectRoot, '..');
// Only packaged assets may be replaced or distributed. Source and secrets stay out of ZIPs.
export const runtimeFiles = Object.freeze([
  'content.js', 'service-worker.js', 'options.js', 'options.html', 'options.css',
  'offscreen.js', 'offscreen.html', 'warning.wav', 'icon.svg', 'icon.png', 'manifest.json'
]);

export async function readRuntime(directory) {
  const files = new Map(await Promise.all(runtimeFiles.map(async name => [name, await readFile(join(directory, name))])));
  const manifest = JSON.parse(files.get('manifest.json').toString());
  if (manifest.manifest_version !== 3 || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version)) throw new Error('Invalid MV3 manifest/version');
  if (manifest.update_url || manifest.externally_connectable) throw new Error('Unsupported external update/message channel');
  const referenced = [manifest.background?.service_worker, manifest.options_page, ...manifest.content_scripts.flatMap(script => script.js)];
  if (referenced.some(name => !files.has(name))) throw new Error('Manifest references an unpackaged asset');
  if ([...files.values()].some(contents => contents.length === 0)) throw new Error('Empty runtime asset');
  return { files, manifest };
}

export async function promoteExtension(staging, destination = extensionRoot) {
  const runtime = await readRuntime(staging);
  await mkdir(destination, { recursive: true });
  const previous = new Map(await Promise.all(runtimeFiles.map(async name => {
    try { return [name, await readFile(join(destination, name))]; }
    catch (error) { if (error.code !== 'ENOENT') throw error; return [name, null]; }
  })));
  const nonce = randomUUID(); const changed = [];
  try {
    for (const name of runtimeFiles) await writeFile(join(destination, `.${name}.${nonce}`), runtime.files.get(name));
    // Publish manifest last so Chrome sees the new version after its assets are ready.
    for (const name of runtimeFiles) {
      await rename(join(destination, `.${name}.${nonce}`), join(destination, name)); changed.push(name);
    }
  } catch (error) {
    for (const name of changed.reverse()) {
      const contents = previous.get(name);
      if (contents === null) await rm(join(destination, name), { force: true });
      else await writeFile(join(destination, name), contents);
    }
    throw error;
  } finally {
    await Promise.all(runtimeFiles.map(name => rm(join(destination, `.${name}.${nonce}`), { force: true })));
  }
  return runtime.manifest.version;
}
