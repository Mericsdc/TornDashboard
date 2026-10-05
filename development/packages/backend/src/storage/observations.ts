import { Pool } from 'pg';
import type { StockObservation } from '@tcd/shared';
export interface ObservationRepository {
  kind: 'memory' | 'postgres';
  add(observation: StockObservation): Promise<void>;
  list(itemId: number, country: string): Promise<StockObservation[]>;
  close(): Promise<void>;
}
export class MemoryObservations implements ObservationRepository {
  readonly kind = 'memory';
  private records = new Map<string, StockObservation[]>();
  async add(observation: StockObservation): Promise<void> {
    const key = `${observation.country}:${observation.itemId}`; const rows = this.records.get(key) || [];
    if (!rows.some(v => v.observedAt === observation.observedAt && v.source === observation.source)) rows.push(structuredClone(observation));
    rows.sort((a, b) => a.observedAt - b.observedAt); this.records.set(key, rows.slice(-1000));
    // Bound distinct item keys in the volatile development adapter.
    if (this.records.size > 5000) this.records.delete(this.records.keys().next().value!);
  }
  async list(itemId: number, country: string): Promise<StockObservation[]> { return structuredClone(this.records.get(`${country}:${itemId}`) || []); }
  async close(): Promise<void> { this.records.clear(); }
}
export class PostgresObservations implements ObservationRepository {
  readonly kind = 'postgres';
  constructor(private pool: Pool) {}
  async add(o: StockObservation): Promise<void> {
    await this.pool.query('INSERT INTO stock_observations (item_id,country,stock,observed_at,source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [o.itemId, o.country, o.stock, o.observedAt, o.source]);
  }
  async list(itemId: number, country: string): Promise<StockObservation[]> {
    const result = await this.pool.query<{ item_id: number; country: string; stock: number; observed_at: string; source: StockObservation['source'] }>(
      'SELECT item_id,country,stock,observed_at,source FROM stock_observations WHERE item_id=$1 AND country=$2 ORDER BY observed_at DESC LIMIT 1000', [itemId, country]);
    return result.rows.reverse().map(row => ({ itemId: row.item_id, country: row.country, stock: row.stock, observedAt: Number(row.observed_at), source: row.source }));
  }
  async close(): Promise<void> { await this.pool.end(); }
}
export async function createObservations(databaseUrl?: string): Promise<ObservationRepository> {
  if (!databaseUrl) return new MemoryObservations();
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 5 });
  try { await pool.query('SELECT item_id FROM stock_observations LIMIT 1'); return new PostgresObservations(pool); }
  catch { await pool.end(); throw new Error('PostgreSQL unavailable or schema missing; run npm run db:migrate'); }
}
