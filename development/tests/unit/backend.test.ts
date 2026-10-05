import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../packages/backend/src/app';
import { configFromEnv, type Config } from '../../packages/backend/src/config';
import { mockObservations } from '@tcd/shared';
import WebSocket from 'ws';
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const config: Config = { host: '127.0.0.1', port: 0, token: '', allowedOrigins: [] };
async function appFor(extra: Partial<Config> = {}) { const app = await buildApp({ config: { ...config, ...extra } }); apps.push(app); return app; }
describe('companion API', () => {
  it('starts without databases and marks every scenario mock', async () => {
    const app = await appFor(); const health = await app.inject('/health');
    expect(health.json()).toMatchObject({ ok: true, storage: 'memory', cache: 'memory', data: 'mock' });
    for (const scenario of ['normal', 'travel', 'war']) {
      const result = await app.inject(`/v1/snapshot?scenario=${scenario}`); expect(result.statusCode).toBe(200); expect(result.json().source).toBe('mock'); expect(result.json().targets[0].battleStats).toBeNull();
    }
    expect((await app.inject('/v1/snapshot?scenario=evil')).statusCode).toBe(400);
  });
  it('records observation history and returns estimated, not exact, restocks', async () => {
    const app = await appFor(); const rows = mockObservations(206, 'Switzerland');
    for (const observation of rows) expect((await app.inject({ method: 'POST', url: '/v1/observations', payload: observation })).statusCode).toBe(201);
    const history = (await app.inject('/v1/stocks/206?country=Switzerland')).json();
    expect(history.prediction.kind).toBe('estimated'); expect(history.intervalHistory).toHaveLength(6); expect(history.lastSeen.stock).toBe(0);
    expect((await app.inject({ method: 'POST', url: '/v1/observations', payload: { ...rows[0], stock: -1 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/observations', payload: { ...rows[0], observedAt: Date.now() + 60000 } })).statusCode).toBe(400);
  });
  it('checks auth and rejects web origins, including on writes', async () => {
    const app = await appFor({ token: 'test-token', allowedOrigins: [`chrome-extension://${'a'.repeat(32)}`] });
    expect((await app.inject('/v1/snapshot')).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/snapshot', headers: { authorization: 'Bearer test-token' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/ws-ticket', headers: { authorization: 'Bearer test-token', origin: 'https://www.torn.com' } })).statusCode).toBe(403);
    expect((await app.inject('/v1/stream?ticket=invalid')).statusCode).toBe(401);
  });
  it('streams snapshots over WebSocket and rejects ticket reuse', async () => {
    const app = await appFor(); const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const { ticket } = (await app.inject({ method: 'POST', url: '/v1/ws-ticket' })).json();
    const url = `${address.replace('http:', 'ws:')}/v1/stream?ticket=${ticket}&scenario=war`;
    const socket = new WebSocket(url);
    const first = await new Promise<string>((resolve, reject) => { socket.once('message', value => resolve(String(value))); socket.once('error', reject); });
    expect(JSON.parse(first).snapshot.war.active).toBe(true);
    const reused = await app.inject(`/v1/stream?ticket=${ticket}&scenario=war`); expect(reused.statusCode).toBe(401); socket.close();
  });
  it('requires credentials and origins before network binding', () => {
    expect(() => configFromEnv({ HOST: '0.0.0.0' })).toThrow('COMPANION_TOKEN');
    expect(() => configFromEnv({ HOST: '0.0.0.0', COMPANION_TOKEN: 'x'.repeat(32) })).toThrow('ALLOWED_ORIGINS');
  });
  it('preserves HTTP validation errors for malformed and oversized bodies', async () => {
    const app = await appFor();
    expect((await app.inject({ method: 'POST', url: '/v1/observations', headers: { 'content-type': 'application/json' }, payload: '{' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/observations', payload: { country: 'x'.repeat(20000) } })).statusCode).toBe(413);
  });
});
