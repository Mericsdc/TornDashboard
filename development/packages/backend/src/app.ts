import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createMockSnapshot, ObservationSchema, SnapshotSchema, type Scenario } from '@tcd/shared';
import { configFromEnv, originAllowed, type Config } from './config';
import { createObservations, type ObservationRepository } from './storage/observations';
import { createCache, type Cache } from './storage/cache';
import { StockService } from './services/stock-service';
import type { WebSocket } from 'ws';

const ScenarioSchema = z.object({ scenario: z.enum(['normal', 'travel', 'war']).default('normal') });
function sameToken(supplied: string, expected: string): boolean {
  return timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(expected).digest());
}
export async function buildApp(options: { config?: Config; repository?: ObservationRepository; cache?: Cache; logger?: boolean } = {}) {
  const config = options.config || configFromEnv();
  const repository = options.repository || await createObservations(config.databaseUrl);
  let cache: Cache;
  try { cache = options.cache || await createCache(config.redisUrl); } catch (error) { await repository.close(); throw error; }
  const stock = new StockService(repository);
  const app = Fastify({ bodyLimit: 16384, logger: options.logger ? {
    redact: ['req.headers.authorization'], serializers: { req: req => ({ method: req.method, url: String(req.url).split('?')[0] }) }
  } : false });
  const tickets = new Map<string, number>();
  const clients = new Set<WebSocket>();
  await app.register(cors, { origin: (origin, cb) => cb(null, originAllowed(origin, config)), methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] });
  await app.register(rateLimit, { max: 120, timeWindow: 60000 });
  await app.register(websocket, { options: { maxPayload: 4096 } });
  app.addHook('onRequest', async (request, reply) => {
    if (!originAllowed(request.headers.origin, config)) return reply.code(403).send({ error: 'Origin not allowed' });
    if (request.url.split('?')[0] === '/health' || request.method === 'OPTIONS') return;
    if (request.url.split('?')[0] === '/v1/stream') return; // Single-use ticket validated before upgrade.
    if (config.token && !sameToken(request.headers.authorization || '', `Bearer ${config.token}`)) return reply.code(401).send({ error: 'Unauthorized' });
  });
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff'); });
  async function snapshot(scenario: Scenario) {
    const key = `snapshot:${scenario}`; const cached = await cache.get(key);
    if (cached) { const parsed = SnapshotSchema.safeParse(JSON.parse(cached)); if (parsed.success) return parsed.data; }
    const value = createMockSnapshot(scenario); await cache.set(key, JSON.stringify(value), 5); return value;
  }
  app.get('/health', async () => ({ ok: true, version: '0.1.0', data: 'mock', storage: repository.kind, cache: cache.kind }));
  app.get('/v1/snapshot', async (request, reply) => {
    const parsed = ScenarioSchema.safeParse(request.query); if (!parsed.success) return reply.code(400).send({ error: 'Invalid scenario' });
    return snapshot(parsed.data.scenario);
  });
  app.post('/v1/observations', async (request, reply) => {
    const parsed = ObservationSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.observedAt > Date.now() + 5000 || parsed.data.observedAt < Date.now() - 30 * 86400000)
      return reply.code(400).send({ error: 'Invalid observation or timestamp outside the last 30 days' });
    const result = await stock.observe(parsed.data);
    clients.forEach(client => { if (client.readyState === 1) client.send(JSON.stringify({ type: 'stock.observed', itemId: result.itemId, country: result.country, history: result })); });
    return reply.code(201).send(result);
  });
  app.get('/v1/stocks/:itemId', async (request, reply) => {
    const params = z.object({ itemId: z.coerce.number().int().positive() }).safeParse(request.params);
    const query = z.object({ country: z.string().min(1).max(60) }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'Provide item ID and country' });
    return stock.history(params.data.itemId, query.data.country);
  });
  app.post('/v1/ws-ticket', async (_request, reply) => {
    for (const [key, expires] of tickets) if (expires < Date.now()) tickets.delete(key);
    if (tickets.size >= 1000) return reply.code(429).send({ error: 'Too many pending tickets' });
    const ticket = randomBytes(32).toString('hex'); tickets.set(ticket, Date.now() + 30000); return { ticket, expiresIn: 30 };
  });
  app.get('/v1/stream', {
    websocket: true,
    preValidation: async (request, reply) => {
      const query = z.object({ ticket: z.string().length(64), scenario: z.enum(['normal', 'travel', 'war']).default('normal') }).safeParse(request.query);
      if (!query.success) return reply.code(401).send({ error: 'Stream ticket required' });
      const expires = tickets.get(query.data.ticket); tickets.delete(query.data.ticket);
      if (!expires || expires < Date.now()) return reply.code(401).send({ error: 'Stream ticket expired or used' });
      if (clients.size >= 32) return reply.code(429).send({ error: 'Stream capacity reached' });
    }
  }, (socket, request) => {
    const { scenario } = ScenarioSchema.parse(request.query); clients.add(socket);
    // Attach handlers synchronously so messages cannot be lost during async setup.
    socket.on('message', data => { if (String(data) === 'ping') socket.send(JSON.stringify({ type: 'pong' })); });
    socket.on('error', () => { socket.close(); });
    const push = async () => {
      try { const value = await snapshot(scenario); if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'snapshot', snapshot: value })); }
      catch { socket.close(1011, 'Snapshot unavailable'); }
    };
    const interval = setInterval(() => { void push(); }, 10000); interval.unref();
    socket.on('close', () => { clearInterval(interval); clients.delete(socket); }); void push();
  });
  app.addHook('onClose', async () => { clients.forEach(socket => socket.terminate()); tickets.clear(); await Promise.all([repository.close(), cache.close()]); });
  app.setErrorHandler((error, _request, reply) => {
    const code = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const status = code >= 400 && code < 500 ? code : 500;
    reply.code(status).send({ error: status === 429 ? 'Rate limit exceeded' : status < 500 ? 'Request rejected' : 'Internal service error' });
  });
  return app;
}
