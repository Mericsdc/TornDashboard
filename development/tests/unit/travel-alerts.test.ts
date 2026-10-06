import { describe, it, expect } from 'vitest';
import { bestProduct, calculateProfit, defaultState, emptyAlertMemory, evaluateAlerts, marketRows, type Snapshot, type StockItem } from '@tcd/shared';
const now = 1800000000000;
function item(patch: Partial<StockItem> = {}): StockItem { return { itemId: 1, name: 'Cherry Blossom', country: 'Japan', stock: 20, cost: 100, tornValue: 300, priceObservedAt: now, observedAt: now, restock: { kind: 'unknown', reason: 'No history' }, ...patch }; }
function snapshot(patch: Partial<Snapshot> = {}): Snapshot { return { source: 'live', provider: 'torn', generatedAt: now, war: null, chain: null, travel: { active: true, origin: 'Torn', destination: 'Japan', arrivesAt: now + 600000, observedAt: now }, player: { level: null }, targets: [], stocks: [item()], ...patch }; }
describe('travel destination, profit and filters', () => {
  it('ranks only fresh in-stock prices at the flight destination, including return flights', () => {
    const data = snapshot({ stocks: [item(), item({ itemId: 2, cost: 10, tornValue: 2000, stock: 0 }), item({ itemId: 3, country: 'UAE', tornValue: 5000 }), item({ itemId: 4, tornValue: 9000, priceObservedAt: now-3*3600000 })] });
    expect(bestProduct(data, now)?.itemId).toBe(1);
    expect(bestProduct({ ...data, travel: { ...data.travel!, destination: 'Torn', origin: 'Japan' } }, now)?.itemId).toBe(1);
    expect(bestProduct(snapshot({ stocks: [item({ tornValue: null })] }), now)).toBeUndefined();
  });
  it('lists all products and supports search, categories, stock and watched items', () => {
    const data = snapshot({ stocks: [item(), item({ itemId: 2, name: 'Monkey Plushie', stock: 0 }), item({ itemId: 3, name: 'Xanax', country: 'Switzerland' })] }), filters = defaultState().settings.market;
    expect(marketRows(data, filters, [], now).length).toBe(2);
    expect(marketRows(data, { ...filters, country: 'all' }, [], now).length).toBe(2);
    expect(marketRows(data, { ...filters, inStock: true }, [], now).length).toBe(1);
    expect(marketRows(data, { ...filters, category: 'plushies' }, [], now)[0]?.itemId).toBe(2);
    expect(marketRows(data, { ...filters, search: 'cherry' }, [], now)[0]?.itemId).toBe(1);
    expect(marketRows(data, { ...filters, favoritesOnly: true }, [], now)).toEqual([]);
  });
  it('calculates actual selected quantities and fees, preserving unknown prices', () => {
    expect(calculateProfit(100, 300, 10, 10)).toEqual({ purchase: 1000, grossValue: 3000, profit: 1700, roi: 170 });
    expect(calculateProfit(null, 300, 10)).toBeNull();
    expect(calculateProfit(100, 300, NaN)).toBeNull();
    expect(calculateProfit(100, 300, 1, NaN)).toBeNull();
  });
});
describe('Personal API alert delivery decisions', () => {
  it('warns on crossing 30s once across tabs/restarts, and rearms after a new hit', () => {
    const state = defaultState(), data = snapshot({ chain: { id: 1, startedAt: now-600000, count: 50, goal: 100, expiresAt: now+31000, observedAt: now } });
    let { memory, events } = evaluateAlerts(data, state, emptyAlertMemory(), now); expect(events).toEqual([]);
    ({ memory, events } = evaluateAlerts(data, state, memory, now+1000)); expect(events).toHaveLength(1);
    expect(evaluateAlerts(data, state, memory, now+2000).events).toHaveLength(0);
    expect(evaluateAlerts({ ...data, chain: { ...data.chain!, expiresAt: now+30500 } }, state, memory, now+2000).events).toHaveLength(0);
    expect(evaluateAlerts({ ...data, chain: { ...data.chain!, count: 51, expiresAt: now+30000 } }, state, memory, now).events).toHaveLength(1);
  });
  it('suppresses expired, stale, disabled and mock chain alerts', () => {
    const state = defaultState(), data = snapshot({ chain: { count: 50, goal: 100, expiresAt: now+20000, observedAt: now-60000 } });
    expect(evaluateAlerts(data, state, emptyAlertMemory(), now).events).toEqual([]);
    expect(evaluateAlerts({ ...data, source: 'mock' }, state, emptyAlertMemory(), now).events).toEqual([]);
    expect(evaluateAlerts({ ...data, chain: { ...data.chain!, expiresAt: now-1, observedAt: now } }, state, emptyAlertMemory(), now).events).toEqual([]);
  });
  it('alerts only on fresh below-to-above threshold transitions and rejects out-of-order data', () => {
    const state = defaultState(); state.favorites = [{ itemId: 1, country: 'Japan', name: 'Cherry Blossom', minimumStock: 5, alert: true }];
    let result = evaluateAlerts(snapshot({ stocks: [item({ stock: 8 })] }), state, emptyAlertMemory(), now); expect(result.events).toHaveLength(0);
    result = evaluateAlerts(snapshot({ stocks: [item({ stock: 0, observedAt: now+1000 })] }), state, result.memory, now+1000); expect(result.events).toHaveLength(0);
    result = evaluateAlerts(snapshot({ stocks: [item({ stock: 10, observedAt: now+2000 })] }), state, result.memory, now+2000); expect(result.events).toHaveLength(1);
    expect(evaluateAlerts(snapshot({ stocks: [item({ stock: 0, observedAt: now })] }), state, result.memory, now+3000).memory.stocks['Japan:1:5']?.available).toBe(true);
    expect(evaluateAlerts(snapshot({ stocks: [item({ stock: 10, observedAt: now+2000 })] }), state, result.memory, now+4000).events).toHaveLength(0);
  });
  it('labels a 30s restock reminder as estimated and deduplicates it', () => {
    const state = defaultState(); state.favorites = [{ itemId: 1, country: 'Japan', name: 'Cherry Blossom', minimumStock: 5, alert: true }];
    const data = snapshot({ stocks: [item({ stock: 0, restock: { kind: 'estimated', earliest: now+30000, latest: now+180000, confidence: 'low', samples: 2, lastSeenRestock: now-500000, intervalHistory: [600000,610000] } })] });
    const result = evaluateAlerts(data, state, emptyAlertMemory(), now); expect(result.events[0]?.title).toContain('estimated');
    expect(evaluateAlerts(data, state, result.memory, now+2000).events).toHaveLength(0);
  });
});
