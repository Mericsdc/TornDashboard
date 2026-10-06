import { canonicalCountry, freshStock, travelCountry } from '@tcd/shared';
import { widget } from '../base';
import { button, el, note, stat, time } from '../../core/dom';
import { money, priceAge } from '../../core/format';
export const travelFavorites=widget({id:'travel-favorites',title:'Watched Products',defaultPosition:'right',defaultOrder:60,modes:['NORMAL','TRAVEL']},ctx=>{
  const country=ctx.mode==='TRAVEL'?travelCountry(ctx.snapshot):null;
  const watches=ctx.state.favorites.filter(f=>ctx.mode!=='TRAVEL'||Boolean(country&&canonicalCountry(f.country)===country));
  const toolbar=el('div','watch-toolbar');toolbar.append(note(`${watches.length} watched${country?' · '+country:''}`),button('+ Add',()=>{void ctx.openOptions?.();}));
  if(!watches.length)return[toolbar];
  const nodes:Node[]=[toolbar];
  for(const place of [...new Set(watches.map(f=>canonicalCountry(f.country)||f.country))]){
    const group=el('details','watch-group');group.open=true;group.append(el('summary','',place));
    for(const favorite of watches.filter(f=>(canonicalCountry(f.country)||f.country)===place)){
      const stock=ctx.snapshot?.stocks.find(s=>s.itemId===favorite.itemId&&canonicalCountry(s.country)===place),fresh=stock&&freshStock(stock,ctx.now),row=el('div','watch-item');
      row.append(el('strong','',favorite.name));
      const quantity=stock?.stock,available=fresh&&quantity!>=favorite.minimumStock;
      const status=stat('Stock',quantity===null||quantity===undefined?'No observation':`${quantity.toLocaleString()}${fresh?'':' · last seen'}`);
      status.classList.add(available?'stock-available':fresh?'stock-empty':'stock-stale');row.append(status);
      if(stock?.cost&&stock.tornValue)row.append(stat('Profit / item',`${stock.tornValue>=stock.cost?'+':'−'}${money(Math.abs(stock.tornValue-stock.cost))}`));
      const estimate=stock?.restock;
      if(estimate?.kind==='estimated')row.append(note(`${estimate.latest>ctx.now?'Est. restock':'Previous window'} ~${time(estimate.earliest)}–${time(estimate.latest)} · ${estimate.confidence}`));
      else if(estimate?.kind==='exact')row.append(note(`Scheduled ${time(estimate.at)}`));
      if(stock?.observedAt)row.append(note(`Seen ${time(stock.observedAt)}${fresh?'':' · stale'}`));
      const details=el('details');details.append(el('summary','','Prices & alerts'));
      if(stock){details.append(stat('Buy price',money(stock.cost)),stat('Torn market',money(stock.tornValue)),note(priceAge(stock.priceObservedAt,ctx.now)));}
      if(estimate?.kind==='estimated')details.append(note(`${estimate.samples} observed intervals · estimated, not guaranteed`));
      else if(estimate?.kind==='exact')details.append(note(`Verified source: ${estimate.source}`));
      else details.append(note('Restock estimate needs more observations.'));
      details.append(note(favorite.alert?`Alert at stock ≥ ${favorite.minimumStock}`:'Alerts off'),button('Remove',()=>{void ctx.saveFavorites(ctx.state.favorites.filter(f=>!(f.itemId===favorite.itemId&&canonicalCountry(f.country)===place)));}));
      row.append(details);group.append(row);
    }nodes.push(group);
  }return nodes;
});
