import { tripProfit, type Trip, type TravelApp } from '@tcd/shared';
import { widget } from '../base';
import { duration, el, note, stat } from '../../core/dom';
import { money, priceAge } from '../travel-market';
export const signedMoney = (value: number | null | undefined) => value === null || value === undefined ? 'Waiting for price…' : `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
export function profitNodes(trip: Trip, app: TravelApp, now: number): HTMLElement[] {
  const profit = tripProfit(trip, app, now), nodes: HTMLElement[] = [];
  nodes.push(el('div', 'route', `${trip.country} → Torn`));
  if (!profit.rows.length) {
    nodes.push(note('Waiting for purchase evidence…'), note(app.logAccess ? 'Your foreign purchase records are checked automatically.' : 'Successful purchases made on this page are tracked. A Full key or custom Item abroad buy log permission also recovers purchases across devices.'));
  }
  if(profit.rows.length>1){
    const wrap=el('div','trip-items'),table=el('table'),head=el('thead'),tr=el('tr');
    ['Item','Qty','Cost','Torn value','Profit'].forEach(label=>tr.append(el('th','',label)));head.append(tr);table.append(head);const tbody=el('tbody');
    const compact=(value:number|null)=>value===null?'—':new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:3}).format(value);
    for(const row of profit.rows){const line=el('tr');for(const value of [row.name,String(row.quantity),compact(row.cost),compact(row.marketValue),row.profit===null?'—':`${row.profit>=0?'+':''}${compact(row.profit)}`])line.append(el('td','',value));line.title=`Buy price ${money(row.unitCost)} · Torn market ${money(row.marketPrice)} · ${priceAge(row.priceObservedAt,now)}`;tbody.append(line);}
    table.append(tbody);wrap.append(table);nodes.push(wrap);
    for(const row of profit.rows)nodes.push(note(`${row.name} · buy ${money(row.unitCost)} · Torn ${row.confidence==='low'?'~':''}${money(row.marketPrice)} · ${priceAge(row.priceObservedAt,now)}`));
  }
  for (const row of profit.rows.length===1?profit.rows:[]) {
    const card = el('div','market-product');
    card.append(el('strong','',row.name),stat('Purchased',row.quantity.toLocaleString()),stat('Buy price',row.unitCost === null ? 'Waiting for price…' : money(row.unitCost)),stat('Cost',row.cost === null ? 'Waiting for price…' : money(row.cost)),
      stat('Torn market',row.marketPrice === null ? 'Waiting for price…' : `${row.confidence === 'low' ? '~' : ''}${money(row.marketPrice)}`),note(priceAge(row.priceObservedAt,now)),stat('Market value',row.marketValue === null ? 'Waiting for price…' : money(row.marketValue)),stat('Est. profit',signedMoney(row.profit)),stat('Profit / item',signedMoney(row.profit === null ? null : row.profit / row.quantity)),stat('ROI',row.roi === null ? 'Waiting for price…' : `${row.roi >= 0 ? '+' : ''}${row.roi.toFixed(1)}%`));
    nodes.push(card);
  }
  if (profit.rows.length) {
    const total = el('div','profit-hero'); total.append(el('span','eyebrow','TOTAL TRIP · ESTIMATED'),stat('Spent',profit.spent === null ? 'Waiting for cost…' : money(profit.spent)),stat(trip.finalizedAt?'Value at completion':'Current value',profit.marketValue === null ? 'Waiting for price…' : money(profit.marketValue)),
      el('strong','profit-total',profit.range ? `${signedMoney(profit.range.low)} – ${signedMoney(profit.range.high)}` : signedMoney(profit.estimatedProfit)),stat('ROI',profit.roi === null ? 'Waiting for price…' : `${profit.roi.toFixed(1)}%`),note(`${profit.confidence.toUpperCase()} CONFIDENCE · ${priceAge(profit.priceAgeMs === null ? null : now-profit.priceAgeMs,now)}`));
    if (profit.range) total.append(note('Range uses observed market values from the last 24 hours; it is not a guaranteed sale range.'));
    if (profit.actualProfit !== null) total.append(stat('Actual revenue',money(profit.actualRevenue)),stat('Actual profit',signedMoney(profit.actualProfit)));
    nodes.push(total);
    if (profit.roundTripMs) nodes.push(stat('Round trip duration',duration(now+profit.roundTripMs,now)),stat('Profit / hour',signedMoney(profit.profitPerHour)),note('Estimated profit ÷ total hours from outbound departure to return landing. Includes shopping time.'));
    else nodes.push(note('Round trip duration is not yet known.'));
    if (profit.oneWayMs) nodes.push(stat('Return flight profit / hour',signedMoney(profit.oneWayProfitPerHour)),note('Estimated profit ÷ return flight hours.'));
    nodes.push(note('Torn market value is an estimate before selling fees and travel costs. Actual profit stays separate until sale proceeds can be attributed to this trip.'));
  }
  if (profit.unconfirmedAdditions) nodes.push(note(`${profit.unconfirmedAdditions} inventory additions are unconfirmed. Gifts, transfers and uses are not counted as purchases.`));
  if (trip.baselineMissing) nodes.push(note('This trip was first observed after departure. Inventory comparison may be incomplete; confirmed receipts are still usable.'));
  return nodes;
}
export const travelProfit = widget({id:'travel-profit',title:'Trip Profit',defaultPosition:'right',defaultOrder:58,modes:['TRAVEL']},ctx=>{
  const app=ctx.snapshot?.travelApp;
  return app?.travelSession ? profitNodes(app.travelSession,app,ctx.now) : [note('Waiting for travel data…')];
});
