import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { runtimeFiles, readRuntime, promoteExtension } from '../../scripts/extension-runtime.mjs';
import { makeZip } from '../../scripts/package.mjs';

async function fixture(directory, version) {
  await mkdir(directory, { recursive: true });
  for (const name of runtimeFiles) await writeFile(join(directory, name), name === 'manifest.json' ? JSON.stringify({ manifest_version: 3, version, background: { service_worker: 'service-worker.js' }, options_page: 'options.html', content_scripts: [{ js: ['content.js'] }] }) : `asset-${version}-${name}`);
}
describe('installed extension distribution', () => {
  it('replaces the same runtime while retaining local source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torndashboard-test-'));
    try {
      const stage = join(root, 'stage'), installed = join(root, 'installed');
      await fixture(stage, '0.3.2'); await fixture(installed, '0.3.1'); await writeFile(join(installed, 'README.md'), 'keep source');
      expect(await promoteExtension(stage, installed)).toBe('0.3.2');
      expect((await readRuntime(installed)).manifest.version).toBe('0.3.2');
      expect(await readFile(join(installed, 'README.md'), 'utf8')).toBe('keep source');
      expect((await readdir(installed)).filter(name => name.startsWith('.'))).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects an incomplete build before changing installed assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torndashboard-test-'));
    try {
      const stage = join(root, 'stage'), installed = join(root, 'installed');
      await fixture(stage, '0.3.2'); await fixture(installed, '0.3.1'); await rm(join(stage, 'options.js'));
      await expect(promoteExtension(stage, installed)).rejects.toThrow();
      expect((await readRuntime(installed)).manifest.version).toBe('0.3.1');
      expect(await readFile(join(installed, 'content.js'), 'utf8')).toBe('asset-0.3.1-content.js');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('packages only runtime assets and independently verifies ZIP contents and checksums', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torndashboard-test-'));
    try {
      await fixture(root, '0.3.1'); await writeFile(join(root, '.env'), 'TEST_ONLY_SECRET');
      const { files } = await readRuntime(root), archive = join(root, 'extension.zip');
      await writeFile(archive, makeZip(files));
      expect(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n')).toEqual(runtimeFiles);
      expect(execFileSync('unzip', ['-p', archive, 'manifest.json'], { encoding: 'utf8' })).toBe(files.get('manifest.json').toString());
      expect(execFileSync('unzip', ['-t', archive], { encoding: 'utf8' })).toContain('No errors detected');
      expect(makeZip(files).equals(makeZip(files))).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
