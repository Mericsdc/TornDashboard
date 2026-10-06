import { widget } from '../base';
import { duration, el, note, stat } from '../../core/dom';
export const travelStatus = widget({ id: 'travel-status', title: 'Travel Status', defaultPosition: 'left', defaultOrder: 50, modes: ['NORMAL', 'TRAVEL'] }, context => {
  const travel = context.snapshot?.travel; if (!travel) return [note(context.snapshot?.issues?.travel || 'Travel data unavailable')];
  if (travel.observedAt && context.now - travel.observedAt > 120000) return [note('Travel observation stale · waiting for Torn API')];
  if (travel.state === 'Abroad') return [el('div', 'route', `✈ ${travel.destination}`), note(travel.description || 'Currently abroad')];
  return travel.active ? [el('div', 'route', `✈ ${travel.origin} → ${travel.destination}`), stat('Remaining', duration(travel.arrivesAt, context.now)), note(travel.description || 'Arrival belongs to the current snapshot')] : [el('div', 'route', '⌂ At home'), note(travel.description || 'No active trip in this snapshot')];
});
