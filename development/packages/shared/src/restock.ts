import type { RestockEstimate, StockObservation } from './contracts';

/** Observed zero -> positive transitions bound events; polling times are never exact restock times. */
export function estimateRestock(observations: StockObservation[], now = Date.now()): RestockEstimate {
  const ordered = [...observations].sort((a, b) => a.observedAt - b.observedAt);
  const first = ordered[0];
  if (!first) return { kind: 'unknown', reason: 'No stock observations' };
  const rows = ordered.filter((v, i, all) => v.country === first.country && v.itemId === first.itemId &&
    v.observedAt <= now && (i === 0 || v.observedAt !== all[i - 1]?.observedAt));
  const events: { at: number; uncertainty: number }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1]; const current = rows[i];
    if (previous && current && previous.stock === 0 && current.stock > 0 && current.observedAt - previous.observedAt <= 10 * 60000)
      events.push({ at: current.observedAt, uncertainty: current.observedAt - previous.observedAt });
  }
  if (events.length < 3) return { kind: 'unknown', reason: 'Need at least three observed restocks' };
  const intervals = events.slice(1).map((v, i) => v.at - events[i]!.at).filter(v => v >= 60000).slice(-12);
  const last = events.at(-1)!;
  if (intervals.length < 2) return { kind: 'unknown', reason: 'Insufficient interval history' };
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const spread = Math.max(60000, ...intervals.map(v => Math.abs(v - median)), ...events.map(v => v.uncertainty));
  const earliest = last.at + Math.max(60000, median - spread);
  const latest = last.at + median + spread;
  if (now > latest || now - (rows.at(-1)?.observedAt ?? 0) > 15 * 60000)
    return { kind: 'unknown', reason: 'Prediction expired or stock observations are stale' };
  return { kind: 'estimated', earliest, latest, lastSeenRestock: last.at, intervalHistory: intervals, samples: intervals.length,
    confidence: intervals.length >= 6 && spread / median < 0.15 ? 'high' : intervals.length >= 3 && spread / median < 0.3 ? 'medium' : 'low' };
}
