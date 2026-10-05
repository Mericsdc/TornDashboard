import { readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { extensionRoot, projectRoot, readRuntime } from './extension-runtime.mjs';

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Deterministic ZIP: fixed timestamp, an asset allowlist and no enclosing folder.
export function makeZip(files) {
  const local = []; const central = []; let offset = 0;
  for (const [name, data] of files) {
    const filename = Buffer.from(name); const packed = deflateRawSync(data); const crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(packed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, filename, packed); central.push(directory, filename); offset += header.length + filename.length + packed.length;
  }
  const directory = Buffer.concat(central); const footer = Buffer.alloc(22); footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(files.size, 8); footer.writeUInt16LE(files.size, 10); footer.writeUInt32LE(directory.length, 12); footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, footer]);
}

export async function packageExtension() {
  const { files, manifest } = await readRuntime(extensionRoot);
  const expected = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')).version;
  if (manifest.version !== expected) throw new Error('Run build first: package and extension versions differ');
  const destination = join(projectRoot, 'dist', 'TornDashboard.zip');
  await mkdir(join(projectRoot, 'dist'), { recursive: true });
  const archive = makeZip(files);
  await writeFile(`${destination}.tmp`, archive); await rename(`${destination}.tmp`, destination);
  await writeFile(join(projectRoot, 'dist', 'SHA256SUMS'), `${createHash('sha256').update(archive).digest('hex')}  TornDashboard.zip\n`);
  return destination;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(await packageExtension()); }
  catch (error) { await rm(join(projectRoot, 'dist', 'TornDashboard.zip.tmp'), { force: true }); console.error(error.message); process.exitCode = 1; }
}
