import { canonicalCountry, category, freshStock, travelCountry } from '@tcd/shared';
import { widget } from '../base';
import { button, el, note, stat, time } from '../../core/dom';
import { money } from '../travel-market';
export const travelFavorites=widget({id:'travel-favorites',title:'Watched Products',defaultPosition:'right',defaultOrder:60,modes:['NORMAL','TRAVEL']},ctx=>{
  const country=ctx.mode==='TRAVEL'?travelCountry(ctx.snapshot):null;
  if(ctx.mode==='TRAVEL'&&!country)return[note('Waiting for your destination. No unrelated products are shown.')];
  const watches=ctx.state.favorites.filter(f=>!country||canonicalCountry(f.country)===country);
  if(!watches.length)return[stat('Watched products','0'),button('+ Add',()=>{void ctx.openOptions?.();})];
  return [...new Set(watches.map(f=>canonicalCountry(f.country)||f.country))].map(country=>{
    const group=el('details','watch-group');group.open=true;group.append(el('summary','',country));
    for(const kind of ['flowers','plushies','other'] as const){const entries=watches.filter(f=>(canonicalCountry(f.country)||f.country)===country&&category(f)===kind);if(!entries.length)continue;group.append(el('h3','',kind));
      for(const favorite of entries){const stock=ctx.snapshot?.stocks.find(s=>s.itemId===favorite.itemId&&canonicalCountry(s.country)===country),fresh=stock&&freshStock(stock,ctx.now),available=fresh&&stock.stock!>=favorite.minimumStock,row=el('div','favorite-row'),head=el('div','stat');
        const star=button('★',()=>{void ctx.saveFavorites(ctx.state.favorites.filter(f=>!(f.itemId===favorite.itemId&&f.country===favorite.country)));});star.className='favorite-star';star.setAttribute('aria-label',`Remove favorite: ${favorite.name}`);head.append(star,el('strong','',favorite.name));
        row.append(head,el('span',available?'badge success':'badge',available?'IN STOCK':fresh?'BELOW THRESHOLD':'UNKNOWN'),stat('Last stock',stock?.stock===null||stock?.stock===undefined?'Unavailable':stock.stock.toLocaleString()),stat('Profit / unit',stock?.cost&&stock.tornValue?money(stock.tornValue-stock.cost):'Unknown'),note(favorite.alert?`Alert when stock ≥ ${favorite.minimumStock}`:'Alerts off'),note(stock?.observedAt?`Last seen ${time(stock.observedAt)}${fresh?'':' · stale'}`:'No stock observation'));group.append(row);
      }
    }return group;
  });
});
