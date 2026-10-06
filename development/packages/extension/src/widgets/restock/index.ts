import { canonicalCountry, travelCountry } from '@tcd/shared';
import { widget } from '../base';
import { el, note, stat, time } from '../../core/dom';
export const restock = widget({ id: 'restock', title: 'Restock', defaultPosition: 'right', defaultOrder: 70, modes: ['NORMAL', 'TRAVEL'] }, context => {
  if (!context.snapshot) return [note('Restock data unavailable')];
  const country = context.mode === 'TRAVEL' ? travelCountry(context.snapshot) : null;
  if (context.mode === 'TRAVEL' && !country) return [note('Destination unknown')];
  return context.state.favorites.filter(f => !country || canonicalCountry(f.country) === country).map(favorite => {
    const stock = context.snapshot?.stocks.find(v => v.itemId === favorite.itemId && v.country === favorite.country && v.name.toLowerCase() === favorite.name.toLowerCase());
    const row = el('div', 'restock-row'); row.append(el('strong', '', `${favorite.name} · ${favorite.country}`));
    if (!stock) { row.append(note('Unknown · no observation history')); return row; }
    if (stock.observedAt !== null && context.now - stock.observedAt > 180000) { row.append(note('Unknown · observations are stale')); return row; }
    if (stock.stock !== null && stock.stock >= favorite.minimumStock) { row.append(note(`Stock available · last observed ${stock.stock.toLocaleString()}`)); return row; }
    const prediction = stock.restock;
    if (prediction.kind === 'unknown') row.append(note(`Unknown · ${prediction.reason}`));
    if (prediction.kind === 'estimated') {
      if (prediction.latest <= context.now) row.append(note('Unknown · estimated window expired'));
      else row.append(el('div', 'eyebrow accent', 'ESTIMATED WINDOW'), stat('Local time', `~${time(prediction.earliest)}–${time(prediction.latest)}`),
        note(`Confidence: ${prediction.confidence} · ${prediction.samples} intervals`), note(`Last restock seen ${time(prediction.lastSeenRestock)}`));
    }
    if (prediction.kind === 'exact') row.append(el('div', 'eyebrow', 'EXACT · VERIFIED SOURCE'), stat('Scheduled time', time(prediction.at)), note(prediction.source));
    return row;
  });
});
