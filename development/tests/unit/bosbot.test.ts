import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SnapshotSchema, createMockSnapshot } from '@tcd/shared';
import { BosbotApi } from '../../packages/extension/src/services/bosbot-api';
describe('Python BOSBOT → TypeScript snapshot contract', () => {
  it('accepts the complete fixture exported by the actual BOSBOT adapter', () => {
    const snapshot = SnapshotSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/bosbot-snapshot.json', import.meta.url), 'utf8')));
    expect(snapshot.provider).toBe('bosbot'); expect(snapshot.source).toBe('live');
    expect(snapshot.targets[0]?.battleStats).toBeNull(); expect(snapshot.chain?.expiresAt).toBeNull();
    expect(snapshot.travel?.destination).toBe('Japan'); expect(snapshot.favorites?.[0]?.minimumStock).toBe(7);
    expect(snapshot.stocks[0]?.restock.kind).toBe('estimated');
  });
  it('rejects approval URLs that could redirect a browser to another origin', async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ pairingId: 'test_pairing_0000000000000', pollingSecret: 'test_secret_0000000000000000', expiresAt: Date.now() + 300000, verificationUrl: 'https://evil.test/extension/connect?pairingId=test_pairing_0000000000000' }), { headers: { 'Content-Type': 'application/json' } });
    try { await expect(new BosbotApi('https://bosbot.test', 'a'.repeat(32)).start()).rejects.toThrow('invalid approval address'); }
    finally { globalThis.fetch = previous; }
  });
  it('rejects mock payloads on the live BOSBOT path and never echoes provider error text', async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => new Response('key-in-error', { status: 401 });
    try {
      await expect(new BosbotApi('https://bosbot.test', 'a'.repeat(32), 'TEST_ONLY').snapshot()).rejects.toThrow('expired, revoked or denied');
      globalThis.fetch = async () => new Response(JSON.stringify(createMockSnapshot('war')), { headers: { 'Content-Type': 'application/json' } });
      await expect(new BosbotApi('https://bosbot.test', 'a'.repeat(32), 'TEST_ONLY').snapshot()).rejects.toThrow('live data feed');
    }
    finally { globalThis.fetch = previous; }
  });
});
