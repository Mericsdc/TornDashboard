import type { Favorite, Settings, Snapshot, StockItem } from './contracts';
const FLOWERS = new Set(['Dahlia', 'Crocus', 'Orchid', 'Heather', 'Ceibo Flower', 'Edelweiss', 'Cherry Blossom', 'Peony', 'Tribulus Omanense', 'African Violet', 'Banana Orchid']);
export function freshStock(item: StockItem, now: number): boolean {
  return item.stock !== null && item.observedAt !== null && now - item.observedAt >= -30000 && now - item.observedAt <= 180000;
}
export function unitProfit(item: StockItem): number | null {
  return item.cost && item.tornValue ? item.tornValue - item.cost : null;
}
export function pricingFresh(item: StockItem, now: number): boolean {
  return Boolean(item.priceObservedAt && now - item.priceObservedAt >= -30000 && now - item.priceObservedAt <= 2 * 3600000);
}
export const COUNTRIES = ['Mexico', 'Hawaii', 'South Africa', 'Japan', 'China', 'Argentina', 'Switzerland', 'Canada', 'United Kingdom', 'UAE', 'Cayman Islands'] as const;
export function canonicalCountry(value: string | null | undefined): string | null {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  if (['dubai', 'united arab emirates', 'uae'].includes(text)) return 'UAE';
  if (['uk', 'united kingdom'].includes(text)) return 'United Kingdom';
  if (text === 'torn') return 'Torn';
  return COUNTRIES.find(country => country.toLowerCase() === text) || null;
}
export function travelCountry(snapshot: Snapshot | null): string | null {
  if (snapshot?.travelApp) return snapshot.travelApp.travel.marketContextCountry || snapshot.travelApp.previewCountry;
  const travel = snapshot?.travel;
  if (!travel?.active) return null;
  const destination = canonicalCountry(travel.destination);
  const country = destination === 'Torn' ? canonicalCountry(travel.origin) : destination;
  return country === 'Torn' ? null : country;
}
export function category(item: Pick<StockItem, 'name'>): 'flowers' | 'plushies' | 'other' {
  return FLOWERS.has(item.name) ? 'flowers' : item.name.endsWith(' Plushie') ? 'plushies' : 'other';
}
export function marketRows(snapshot: Snapshot, settings: Settings['market'], favorites: Favorite[], now: number): StockItem[] {
  const country = snapshot.travel?.active || settings.country === 'auto' ? travelCountry(snapshot) : settings.country === 'all' ? 'all' : canonicalCountry(settings.country);
  if (!country) return []; // An unknown destination must never expose unrelated countries.
  return snapshot.stocks.filter(item => (country === 'all' || canonicalCountry(item.country) === country)
    && item.name.toLowerCase().includes(settings.search.toLowerCase())
    && (!settings.inStock || (freshStock(item, now) && (item.stock || 0) > 0))
    && (!settings.favoritesOnly || favorites.some(f => f.itemId === item.itemId && f.country === item.country))
    && (settings.category === 'all' || category(item) === settings.category))
    .sort((a, b) => {
      const score = (item: StockItem): number => {
        if (settings.sort === 'stock') return freshStock(item, now) ? item.stock || 0 : -Infinity;
        const profit = unitProfit(item);
        return profit === null ? -Infinity : settings.sort === 'roi' ? profit / item.cost! : profit;
      };
      return (settings.sort === 'name' ? 0 : score(b) - score(a)) || a.name.localeCompare(b.name) || a.country.localeCompare(b.country);
    });
}
export function bestProduct(snapshot: Snapshot, now: number): StockItem | undefined {
  void now; const country = travelCountry(snapshot);
  if (!country || ['Torn', 'Unknown destination', 'Unknown origin'].includes(country)) return undefined;
  return snapshot.stocks.filter(item => item.country === country && (unitProfit(item) ?? 0) > 0)
    .sort((a, b) => unitProfit(b)! - unitProfit(a)!)[0];
}
export function calculateProfit(cost: number | null | undefined, value: number | null | undefined, quantity: number, feePercent = 0) {
  if (!cost || !value || !Number.isFinite(cost) || !Number.isFinite(value) || !Number.isFinite(feePercent) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || feePercent < 0 || feePercent > 100) return null;
  const purchase = cost * quantity, grossValue = value * quantity, proceeds = grossValue * (1 - feePercent / 100);
  return { purchase, grossValue, profit: proceeds - purchase, roi: (proceeds - purchase) / purchase * 100 };
}

export interface BagPlan { purchases: { item: StockItem; quantity: number }[]; quantity: number; cost: number; tornValue: number; profit: number; optimal: boolean }
/** Bounded bag knapsack. Budget states retain non-dominated cost/profit alternatives. */
export function optimizeBag(items: StockItem[], capacity: number, budget: number | null, feePercent: number, now: number): BagPlan | null {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100 || !Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100 || (budget !== null && (!Number.isFinite(budget) || budget < 0))) return null;
  type Plan = { cost: number; value: number; profit: number; counts: Map<StockItem, number> };
  const states: Plan[][] = Array.from({ length: capacity + 1 }, () => []);
  states[0]!.push({ cost: 0, value: 0, profit: 0, counts: new Map() });
  let optimal = true;
  for (const item of items.filter(i => freshStock(i, now) && pricingFresh(i, now) && i.cost && i.tornValue && i.tornValue * (1 - feePercent / 100) > i.cost)) {
    const profit = item.tornValue! * (1 - feePercent / 100) - item.cost!;
    const max = Math.min(capacity, item.stock!);
    for (let q = capacity; q >= 0; q--) {
      const prior = [...states[q]!];
      for (const plan of prior) for (let n = 1; n <= Math.min(max, capacity - q); n++) {
        const cost = plan.cost + item.cost! * n;
        if (budget !== null && cost > budget) break;
        const counts = new Map(plan.counts); counts.set(item, n);
        states[q + n]!.push({ cost, value: plan.value + item.tornValue! * n, profit: plan.profit + profit * n, counts });
      }
    }
    for (let q = 1; q <= capacity; q++) {
      const sorted = states[q]!.sort((a, b) => a.cost - b.cost || b.profit - a.profit);
      let best = -Infinity;
      states[q] = sorted.filter(plan => { if (plan.profit <= best) return false; best = plan.profit; return true; });
      if (states[q]!.length > 500) { optimal = false; states[q] = states[q]!.sort((a, b) => b.profit - a.profit).slice(0, 500); }
      if (budget === null) states[q] = states[q]!.sort((a,b) => b.profit-a.profit).slice(0,1);
    }
  }
  const best = states.flat().sort((a,b) => b.profit-a.profit || a.cost-b.cost)[0]!;
  return { purchases: [...best.counts].map(([item, quantity]) => ({ item, quantity })), quantity: [...best.counts.values()].reduce((a,b)=>a+b,0), cost: best.cost, tornValue: best.value, profit: best.profit, optimal };
}
