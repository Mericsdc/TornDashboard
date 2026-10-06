import { marketRows, optimizeBag, travelCountry, type Settings } from '@tcd/shared';
import type { WidgetContext, WidgetDefinition } from '../../core/widget-registry';
import { button, el, note, stat } from '../../core/dom';
import { money } from '../travel-market';
export const travelProfit:WidgetDefinition={
  id:'travel-profit',title:'Travel Profit Calculator',defaultPosition:'right',defaultOrder:58,modes:['TRAVEL'],settings:{enabled:true,compact:true},
  visible:ctx=>Boolean(ctx.snapshot?.travel?.active&&ctx.snapshot.travel.observedAt&&ctx.now-ctx.snapshot.travel.observedAt<=90000),
  create(){
    let ctx:WidgetContext,body:HTMLElement,signature='',bagSignature='';
    const form=el('form','profit-form'),results=el('div'),inputs=new Map<string,HTMLInputElement>();
    for(const [name,label,min,max,placeholder] of [['capacity','Available capacity',1,100,'Enter free bag slots'],['budget','Budget',0,1e12,'No budget limit'],['roundTripMinutes','Round trip minutes',1,2880,'From flight · estimated'],['feePercent','Selling fee percent',0,100,'0']] as const){const row=el('label','market-field',label),input=el('input');input.name=name;input.type='number';input.min=String(min);input.max=String(max);input.placeholder=placeholder;input.setAttribute('aria-label',label);if(name==='feePercent')input.step='0.1';row.append(input);inputs.set(name,input);form.append(row);}
    const watched=el('input');watched.type='checkbox';watched.setAttribute('aria-label','Optimize watched products only');const label=el('label','filter-check');label.append(watched,el('span','','Watched products only'));form.append(label);
    const bag=():Settings['bag']=>({capacity:inputs.get('capacity')!.value===''?null:inputs.get('capacity')!.valueAsNumber,budget:inputs.get('budget')!.value===''?null:inputs.get('budget')!.valueAsNumber,roundTripMinutes:inputs.get('roundTripMinutes')!.value===''?null:inputs.get('roundTripMinutes')!.valueAsNumber,feePercent:inputs.get('feePercent')!.valueAsNumber,favoritesOnly:watched.checked});
    const calculate=()=>{
      const settings=bag(),country=travelCountry(ctx.snapshot);
      if(!country||!ctx.snapshot){results.replaceChildren(note('Destination unknown. Products from other countries are excluded.'));return;}
      if(settings.capacity===null){results.replaceChildren(stat('Destination',country),stat('Available capacity','Unknown'),note('Enter your free bag slots. Torn API does not provide remaining travel capacity.'));return;}
      const rows=marketRows(ctx.snapshot,{...ctx.state.settings.market,country:'auto',search:'',category:'all',inStock:true,favoritesOnly:settings.favoritesOnly},ctx.state.favorites,ctx.now);
      const plan=optimizeBag(rows,settings.capacity,settings.budget,settings.feePercent,ctx.now);
      if(!plan){results.replaceChildren(note('Enter capacity 1–100, a valid budget and selling fee 0–100%.'));return;}
      if(!plan.quantity){results.replaceChildren(note('No fresh, profitable stock fits this budget or watch selection.'));return;}
      const hero=el('div','purchase-plan');hero.append(el('span','eyebrow',plan.optimal?'BEST PURCHASE · OBSERVED STOCK':'SUGGESTED PURCHASE · APPROXIMATION'));
      plan.purchases.forEach(row=>hero.append(el('strong','',`${row.quantity} × ${row.item.name}`)));
      const travel=ctx.snapshot.travel;
      const flightMinutes=travel?.arrivesAt&&travel.departedAt&&(travel.arrivesAt>travel.departedAt)?(travel.arrivesAt-travel.departedAt)/60000:null;
      const minutes=settings.roundTripMinutes??(flightMinutes&&flightMinutes<=1440?flightMinutes*2:null);
      results.replaceChildren(stat('Available capacity',`${settings.capacity} · manual`),stat('Using bag slots',`${plan.quantity} / ${settings.capacity}`),hero,stat('Cost',money(plan.cost)),stat('Torn value',money(plan.tornValue)),stat('Estimated profit',money(plan.profit)),stat('Profit / hr',minutes?money(plan.profit/(minutes/60)):'Unknown'),note(minutes?`${Math.round(minutes)} min round trip · ${settings.roundTripMinutes?'your input':'estimated as twice this flight; excludes shopping time'}`:'Enter round trip minutes to calculate profit per hour.'),note('Market value is an estimate, not a guaranteed sale price. Includes your selling fee; excludes travel costs. Stock is a community observation.'));
    };
    const optimize=button('Optimize Bag',()=>{calculate();const settings=bag();if(settings.capacity!==null&&Number.isInteger(settings.capacity)&&settings.capacity>=1&&settings.capacity<=100&&Number.isFinite(settings.feePercent))void ctx.saveSettings({bag:settings});});optimize.className='optimize-button';form.append(optimize);form.addEventListener('submit',event=>{event.preventDefault();optimize.click();});form.addEventListener('input',calculate);form.addEventListener('change',calculate);
    const update=(context:WidgetContext)=>{ctx=context;const next=JSON.stringify([ctx.snapshot,ctx.state.settings.bag,ctx.state.favorites,Math.floor(ctx.now/10000)]);if(signature===next)return;signature=next;const saved=JSON.stringify(ctx.state.settings.bag);if(saved!==bagSignature){bagSignature=saved;for(const [name,input] of inputs){if((body.getRootNode() as ShadowRoot).activeElement===input)continue;const value=ctx.state.settings.bag[name as keyof Settings['bag']];input.value=value===null?'':String(value);}watched.checked=ctx.state.settings.bag.favoritesOnly;}calculate();};
    return{mount(node,context){body=node;body.append(form,results);update(context);},update(_data,context){update(context);},destroy(){body.replaceChildren();}};
  }
};
