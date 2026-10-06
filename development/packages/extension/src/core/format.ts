export const money = (value: number | null | undefined): string => value === null || value === undefined ? 'Unavailable' : `$${Math.round(value).toLocaleString()}`;
export function priceAge(at: number | null | undefined, now: number): string {
  if (!at) return 'Price observation unavailable';
  const age=Math.max(0,now-at),minutes=Math.floor(age/60000);
  return age>2*3600000 ? `Last known price · ${Math.floor(age/3600000)}h old` : age>30*60000 ? `⚠ ${minutes}m old` : `Updated ${minutes}m ago`;
}
