import { canonicalCountry, travelCountry } from '@tcd/shared';
import { widget } from '../base';
import { el, note, stat, time } from '../../core/dom';
export const restock=widget({id:'restock',title:'Restock',defaultPosition:'right',defaultOrder:70,modes:['NORMAL','TRAVEL']},ctx=>{
  const country=ctx.mode==='TRAVEL'?travelCountry(ctx.snapshot):null;
  if(ctx.mode==='TRAVEL'&&!country)return[note('Waiting for market context…')];
  const watches=ctx.state.favorites.filter(f=>!country||canonicalCountry(f.country)===country);
  if(!watches.length)return[note('Add a watched product for restock estimates.')];
  return watches.map(f=>{
    const stock=ctx.snapshot?.stocks.find(s=>s.itemId===f.itemId&&canonicalCountry(s.country)===canonicalCountry(f.country)),row=el('div','restock-row');row.append(el('strong','',`${f.name} · ${f.country}`));
    row.append(stat('Last stock',stock?.stock===null||stock?.stock===undefined?'Unavailable':stock.stock.toLocaleString()),stat('Last seen',stock?.observedAt?time(stock.observedAt):'Waiting for observation…'));
    const p=stock?.restock;
    if(p?.kind==='estimated')row.append(stat(p.latest>ctx.now?'Next estimated restock':'Last estimated window',`~${time(p.earliest)}–${time(p.latest)}`),note(`${p.confidence.toUpperCase()} confidence · ${p.samples} observed intervals${p.latest<=ctx.now?' · waiting for a new observation':''}`));
    else if(p?.kind==='exact')row.append(stat('Scheduled restock',time(p.at)),note(`Verified source: ${p.source}`));
    else row.append(note('Restock estimate needs more observed replenishments.'));
    const t=ctx.snapshot?.travelApp?.travel;if(t?.destinationCountry==='Torn'&&t.arrivalAt)row.append(stat('You land Torn',time(t.arrivalAt)));
    return row;
  });
});
