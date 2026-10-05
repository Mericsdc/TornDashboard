import { createClient } from 'redis';
export interface Cache { kind: 'memory' | 'redis'; get(key: string): Promise<string | null>; set(key: string, value: string, ttl: number): Promise<void>; close(): Promise<void> }
export class MemoryCache implements Cache {
  readonly kind = 'memory'; private rows = new Map<string, { value: string; expires: number }>();
  async get(key: string): Promise<string | null> {
    const row = this.rows.get(key); if (!row || Date.now() > row.expires) { this.rows.delete(key); return null; } return row.value;
  }
  async set(key: string, value: string, ttl: number): Promise<void> { this.rows.set(key, { value, expires: Date.now() + ttl * 1000 }); }
  async close(): Promise<void> { this.rows.clear(); }
}
export async function createCache(url?: string): Promise<Cache> {
  if (!url) return new MemoryCache();
  const client = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: false } });
  client.on('error', () => { /* Propagate operation failures without logging connection URLs or credentials. */ });
  try { await client.connect(); } catch { client.destroy(); throw new Error('Redis unavailable; remove REDIS_URL for the memory fallback'); }
  return { kind: 'redis', get: key => client.get(`tcd:${key}`), set: async (key, value, ttl) => { await client.set(`tcd:${key}`, value, { EX: ttl }); }, close: async () => { await client.quit(); } };
}
