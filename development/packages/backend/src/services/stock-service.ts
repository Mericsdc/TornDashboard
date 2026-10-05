import { estimateRestock, type RestockEstimate, type StockObservation } from '@tcd/shared';
import type { ObservationRepository } from '../storage/observations';
export interface StockHistoryResult { itemId: number; country: string; lastSeen: StockObservation | null; intervalHistory: number[]; prediction: RestockEstimate }
export interface StockHistoryService { observe(observation: StockObservation): Promise<StockHistoryResult>; history(itemId: number, country: string): Promise<StockHistoryResult> }
export class StockService implements StockHistoryService {
  constructor(private repository: ObservationRepository) {}
  async observe(observation: StockObservation): Promise<StockHistoryResult> { await this.repository.add(observation); return this.history(observation.itemId, observation.country); }
  async history(itemId: number, country: string): Promise<StockHistoryResult> {
    const rows = await this.repository.list(itemId, country); const prediction = estimateRestock(rows);
    return { itemId, country, lastSeen: rows.at(-1) || null, prediction, intervalHistory: prediction.kind === 'estimated' ? prediction.intervalHistory : [] };
  }
}
