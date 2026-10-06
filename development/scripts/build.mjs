import { build, context } from 'esbuild';
import { mkdir, copyFile, readFile, rm, watch, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { projectRoot, extensionRoot, promoteExtension } from './extension-runtime.mjs';

process.chdir(projectRoot);
const watching = process.argv.includes('--watch');
const staging = await mkdtemp(join(tmpdir(), 'torn-companion-build-'));
await mkdir('dist/preview', { recursive: true });
async function copyStatic() {
  await Promise.all([
    ...['manifest.json', 'options.html', 'offscreen.html', 'warning.wav', 'icon.svg', 'icon.png'].map(name => copyFile(`packages/extension/${name}`, `${staging}/${name}`)),
    copyFile('packages/extension/src/settings/options.css', `${staging}/options.css`),
    copyFile('packages/extension/demo/index.html', 'dist/preview/index.html')
  ]);
}
const shared = { bundle: true, target: 'chrome120', sourcemap: false, minify: !watching, loader: { '.css': 'text' }, logLevel: 'info' };
const dependencies = JSON.parse(await readFile('package.json', 'utf8')).dependencies;
const configs = [
  { ...shared, entryPoints: ['packages/extension/src/content/travel-page.ts'], outfile: `${staging}/travel-page.js`, format: 'iife' },
  { ...shared, entryPoints: ['packages/extension/src/offscreen/audio.ts'], outfile: `${staging}/offscreen.js`, format: 'iife' },
  { ...shared, entryPoints: ['packages/extension/src/core/bootstrap.ts'], outfile: `${staging}/content.js`, format: 'iife' },
  { ...shared, entryPoints: ['packages/extension/src/background/service-worker.ts'], outfile: `${staging}/service-worker.js`, format: 'esm' },
  { ...shared, entryPoints: ['packages/extension/src/settings/options.ts'], outfile: `${staging}/options.js`, format: 'esm' },
  { ...shared, entryPoints: ['packages/extension/demo/demo.ts'], outfile: 'dist/preview/demo.js', format: 'esm' },
  { bundle: true, platform: 'node', target: 'node24', format: 'esm', external: Object.keys(dependencies),
    entryPoints: ['packages/backend/src/server.ts'], outfile: 'dist/backend/server.js', sourcemap: true, logLevel: 'info' }
];

if (!watching) {
  try {
    await copyStatic();
    const results = await Promise.allSettled(configs.map(config => build(config)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const version = await promoteExtension(staging);
    await rm('dist/extension', { recursive: true, force: true });
    console.log(`Extension ${version} updated in ${extensionRoot}. Reload the existing Chrome extension, then Torn.`);
  } finally { await rm(staging, { recursive: true, force: true }); }
} else {
  const results = new Map(); let timer; let promotion = Promise.resolve();
  function publish() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (results.size !== configs.length || [...results.values()].some(errors => errors.length)) return;
      promotion = promotion.then(async () => {
        await copyStatic(); await promoteExtension(staging);
        console.log('Updated the same extension folder. Reload it in Chrome, then Torn.');
      }).catch(error => console.error('Installed extension retained:', error.message));
    }, 150);
  }
  await copyStatic();
  const contexts = await Promise.all(configs.map((config, index) => context({ ...config, plugins: [{
    name: 'publish-installed-extension', setup(buildContext) {
      buildContext.onStart(() => { results.delete(index); });
      buildContext.onEnd(result => { results.set(index, result.errors); publish(); });
    }
  }] })));
  await Promise.all(contexts.map(ctx => ctx.watch()));
  const abort = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    abort.abort(); clearTimeout(timer);
    void Promise.all(contexts.map(ctx => ctx.dispose())).then(() => promotion).then(() => rm(staging, { recursive: true, force: true })).then(() => process.exit(0));
  });
  void (async () => {
    try { for await (const event of watch('packages/extension', { recursive: true, signal: abort.signal })) if (event.filename && /(?:html|css|json)$/.test(event.filename)) publish(); }
    catch (error) { if (!abort.signal.aborted) console.error(error); }
  })();
}
