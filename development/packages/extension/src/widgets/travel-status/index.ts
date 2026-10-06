import { widget } from '../base';
import { duration, el, note, stat, time } from '../../core/dom';
export const travelStatus = widget({ id: 'travel-status', title: 'Travel Status', defaultPosition: 'left', defaultOrder: 50, modes: ['NORMAL', 'TRAVEL'] }, context => {
  const app=context.snapshot?.travelApp, travel=context.snapshot?.travel;
  if (app) {
    const t=app.travel;
    if (t.observedAt === null && !app.travelSession) return [note('Waiting for travel data…')];
    const saved=['cached','stale','error-with-cache'].includes(app.quality) ? note('Last known data') : null;
    if (t.state==='AT_HOME') return [el('div','route','⌂ Torn'),note('At home')];
    if (t.state==='ABROAD' || t.state==='LANDED' && t.destinationCountry!=='Torn') return [el('div','route',t.marketContextCountry || t.destinationCountry || 'Abroad'),note(t.state==='LANDED'?'Landing · confirming arrival…':'On ground'),stat('Bag',app.bag.total === null ? 'Detecting capacity…' : `${app.bag.used ?? '—'} / ${app.bag.total}`),...(saved?[saved]:[])];
    return [el('div','route',`✈ ${t.originCountry || '…'} → ${t.destinationCountry || '…'}`),el('strong','flight-countdown',t.arrivalAt ? duration(t.arrivalAt,context.now) : 'Waiting for flight time…'),note(t.state==='LANDED'?'Landing · confirming arrival…':'remaining'),...(t.arrivalAt?[note(`Landing ${time(t.arrivalAt)}`)]:[]),...(saved?[saved]:[])];
  }
  if (!travel) return [note('Waiting for travel data…')];
  return travel.active ? [el('div','route',`✈ ${travel.origin} → ${travel.destination}`),stat('Remaining',duration(travel.arrivesAt,context.now)),...(travel.arrivesAt?[note(`Landing ${time(travel.arrivesAt)}`)]:[])] : [el('div','route','⌂ Torn'),note('At home')];
});
