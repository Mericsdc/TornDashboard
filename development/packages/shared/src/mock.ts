import { estimateRestock } from './restock';
import type { Scenario, Snapshot, StockObservation } from './contracts';
const DEMO_PRODUCTS = [{ itemId: 206, name: 'Xanax', country: 'Switzerland' }, { itemId: 268, name: 'Cherry Blossom', country: 'Japan' }, { itemId: 269, name: 'Monkey Plushie', country: 'Japan' }];

export function mockObservations(itemId: number, country: string, now = Date.now()): StockObservation[] {
  const rows: StockObservation[] = [];
  for (let i = 6; i >= 0; i--) {
    const at = now - 12 * 60000 - i * 25 * 60000;
    rows.push({ itemId, country, stock: 0, observedAt: at - 60000, source: 'mock' }, { itemId, country, stock: 300, observedAt: at, source: 'mock' });
  }
  rows.push({ itemId, country, stock: 0, observedAt: now - 60000, source: 'mock' });
  return rows;
}
export function createMockSnapshot(scenario: Scenario = 'normal', now = Date.now()): Snapshot {
  return {
    source: 'mock', generatedAt: now, player: { level: 37 },
    war: { active: scenario === 'war', opponent: 'Demo • Nightwatch', score: 1245, targetScore: 1510, endsAt: now + 85 * 60000 },
    chain: { count: 47, goal: 50, expiresAt: now + 4 * 60000 },
    travel: { active: scenario === 'travel', destination: 'Japan', origin: 'Torn', observedAt: now, arrivesAt: now + 64 * 60000 },
    targets: [
      { id: 9000001, name: 'Demo • Raven', level: 31, status: 'Okay', activity: 'offline', observedAt: now, hospitalUntil: null, wins: 4, losses: 0, battleStats: null },
      { id: 9000002, name: 'Demo • Copper', level: 42, status: 'Okay', activity: 'idle', observedAt: now, hospitalUntil: null, wins: null, losses: null, battleStats: null },
      { id: 9000003, name: 'Demo • North', level: 26, status: 'Hospital', activity: 'online', observedAt: now, hospitalUntil: now + 81000, wins: 2, losses: 1, battleStats: null },
      { id: 9000004, name: 'Demo • Ember', level: null, status: 'Hospital', activity: 'unknown', observedAt: now, hospitalUntil: now + 188000, wins: null, losses: null, battleStats: null },
      { id: 9000005, name: 'Demo • Ash', level: 55, status: 'Traveling', activity: 'offline', observedAt: now, hospitalUntil: null, wins: 1, losses: 3, battleStats: null }
    ],
    stocks: DEMO_PRODUCTS.map((favorite, index) => ({ itemId: favorite.itemId, country: favorite.country, name: favorite.name,
      cost: 1000, tornValue: index === 1 ? 19000 : 21000, priceObservedAt: now,
      stock: index === 1 ? 147 : 0, observedAt: now - 60000,
      restock: index === 1 ? { kind: 'unknown' as const, reason: 'Currently in stock at last observation' } : estimateRestock(mockObservations(favorite.itemId, favorite.country, now), now) }))
  };
}
