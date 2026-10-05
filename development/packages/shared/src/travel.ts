import type { Favorite, Settings, Snapshot, StockItem } from './contracts';
const FLOWERS = new Set(['Dahlia', 'Crocus', 'Orchid', 'Heather', 'Ceibo Flower', 'Edelweiss', 'Cherry Blossom', 'Peony', 'Tribulus Omanense', 'African Violet', 'Banana Orchid']);
export function freshStock(item: StockItem, now: number): boolean {
  return item.stock !== null && item.observedAt !== null && now - item.observedAt >= -30000 && now - item.observedAt <= 180000;
}
export function unitProfit(item: StockItem): number | null {
  return item.cost && item.tornValue ? item.tornValue - item.cost : null;
}
export function pricingFresh(item: StockItem, now: number): boolean {
  return Boolean(item.observedAt && now - item.observedAt >= -30000 && now - item.observedAt <= 180000 && item.priceObservedAt && now - item.priceObservedAt >= -30000 && now - item.priceObservedAt <= 2 * 3600000);
}
export function travelCountry(snapshot: Snapshot | null): string | null {
  const travel = snapshot?.travel;
  if (!travel?.active) return null;
  return travel.destination === 'Torn' ? travel.origin : travel.destination;
}
export function category(item: StockItem): 'flowers' | 'plushies' | 'other' {
  return FLOWERS.has(item.name) ? 'flowers' : item.name.endsWith(' Plushie') ? 'plushies' : 'other';
}
export function marketRows(snapshot: Snapshot, settings: Settings['market'], favorites: Favorite[], now: number): StockItem[] {
  const country = settings.country === 'auto' ? travelCountry(snapshot) : settings.country;
  return snapshot.stocks.filter(item => (!country || country === 'all' || item.country === country)
    && item.name.toLowerCase().includes(settings.search.toLowerCase())
    && (!settings.inStock || (freshStock(item, now) && (item.stock || 0) > 0))
    && (!settings.favoritesOnly || favorites.some(f => f.itemId === item.itemId && f.country === item.country))
    && (settings.category === 'all' || category(item) === settings.category))
    .sort((a, b) => {
      const score = (item: StockItem): number => {
        if (settings.sort === 'stock') return freshStock(item, now) ? item.stock || 0 : -Infinity;
        const profit = unitProfit(item);
        return profit === null || !pricingFresh(item, now) ? -Infinity : settings.sort === 'roi' ? profit / item.cost! : profit;
      };
      return (settings.sort === 'name' ? 0 : score(b) - score(a)) || a.name.localeCompare(b.name) || a.country.localeCompare(b.country);
    });
}
export function bestProduct(snapshot: Snapshot, now: number): StockItem | undefined {
  const country = travelCountry(snapshot);
  if (!country || ['Torn', 'Unknown destination', 'Unknown origin'].includes(country)) return undefined;
  return snapshot.stocks.filter(item => item.country === country && freshStock(item, now) && (item.stock || 0) > 0 && pricingFresh(item, now) && (unitProfit(item) ?? 0) > 0)
    .sort((a, b) => unitProfit(b)! - unitProfit(a)!)[0];
}
export function calculateProfit(cost: number | null | undefined, value: number | null | undefined, quantity: number, feePercent = 0) {
  if (!cost || !value || !Number.isFinite(cost) || !Number.isFinite(value) || !Number.isFinite(feePercent) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || feePercent < 0 || feePercent > 100) return null;
  const purchase = cost * quantity, grossValue = value * quantity, proceeds = grossValue * (1 - feePercent / 100);
  return { purchase, grossValue, profit: proceeds - purchase, roi: (proceeds - purchase) / purchase * 100 };
}
