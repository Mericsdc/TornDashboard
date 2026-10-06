import { bestProduct, freshStock, marketRows, predictResource, travelCountry, unitProfit, type Settings } from '@tcd/shared';
import type { WidgetContext, WidgetDefinition } from '../../core/widget-registry';
import { button, duration, el, note, stat, time } from '../../core/dom';
export const money = (value: number | null | undefined): string => value === null || value === undefined ? 'Unavailable' : `$${Math.round(value).toLocaleString()}`;
export function priceAge(at: number | null | undefined, now: number): string {
  if (!at) return 'Price observation unavailable';
  const age=Math.max(0,now-at),minutes=Math.floor(age/60000);
  return age>2*3600000 ? `Last known price · ${Math.floor(age/3600000)}h old` : age>30*60000 ? `⚠ ${minutes}m old` : `Updated ${minutes}m ago`;
}
export const travelMarket: WidgetDefinition = {
  id:'travel-market',title:'Travel Market',defaultPosition:'left',defaultOrder:55,modes:['TRAVEL'],settings:{enabled:true,compact:true},
  create() {
    let body:HTMLElement,ctx:WidgetContext,signature='',searchTimer:ReturnType<typeof setTimeout>|undefined;
    const controls=el('form','market-filters'),results=el('div','market-results'),fields=new Map<string,HTMLInputElement|HTMLSelectElement>();
    const select=(name:string,label:string,options:[string,string][])=>{
      const row=el('label','market-field',label),input=el('select');input.name=name;input.setAttribute('aria-label',label);
      options.forEach(([value,label])=>{const option=el('option','',label);option.value=value;input.append(option);});row.append(input);controls.append(row);fields.set(name,input);return input;
    };
    const country=select('country','Country',[['auto','My destination · auto']]);country.disabled=true;
    select('category','Category',[['all','All products'],['flowers','Flowers'],['plushies','Plushies'],['other','Other']]);
    select('sort','Sort products',[['profit','Profit / unit'],['roi','Return on cost'],['stock','Stock'],['name','Name']]);
    const search=el('input');search.name='search';search.type='search';search.placeholder='Search products';search.maxLength=80;search.setAttribute('aria-label','Search products');controls.append(search);fields.set('search',search);
    for(const [name,label] of [['inStock','In stock only'],['favoritesOnly','Favorites only']] as const){const row=el('label','filter-check'),input=el('input');input.type='checkbox';input.name=name;row.append(input,el('span','',label));controls.append(row);fields.set(name,input);}
    const save=()=>{const market=Object.fromEntries([...fields].map(([key,input])=>[key,input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:input.value])) as Settings['market'];void ctx.saveSettings({market});};
    controls.addEventListener('submit',event=>{event.preventDefault();save();});controls.addEventListener('change',save);search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(save,250);});
    const update=(context:WidgetContext)=>{
      ctx=context;const app=ctx.snapshot?.travelApp,t=app?.travel,returning=t?.state==='RETURNING'||t?.state==='LANDED'&&t.destinationCountry==='Torn';
      const next=JSON.stringify([ctx.snapshot,ctx.state.settings.market,ctx.state.favorites,returning?Math.floor(ctx.now/1000):Math.floor(ctx.now/10000)]);if(next===signature)return;signature=next;
      controls.hidden=Boolean(returning);
      if(returning&&t&&app){
        const nodes=[el('div','route',`${t.originCountry || app.travelSession?.country || '…'} → Torn`),stat('Landing',t.arrivalAt?new Date(t.arrivalAt).toLocaleTimeString():'Waiting for flight time…'),el('strong','flight-countdown',duration(t.arrivalAt,ctx.now)),note(t.state==='LANDED'?'Landing · confirming arrival…':'remaining')];
        for(const [key,label] of [['energy','Energy'],['nerve','Nerve'],['life','Life']] as const){const bar=app.bars?.[key],prediction=bar?predictResource(bar,t.arrivalAt,ctx.now):null;nodes.push(stat(`${label} at landing`,prediction===null?'Waiting for regeneration data…':`${prediction.toLocaleString()} / ${bar!.maximum.toLocaleString()}`));}
        nodes.push(note('Resource projections assume no use or boosts before landing. Your saved foreign market and watches remain available until the trip is completed.'));
        results.replaceChildren(...nodes);return;
      }
      for(const [name,input] of fields){if((body.getRootNode() as ShadowRoot).activeElement===input)continue;const value=ctx.state.settings.market[name as keyof Settings['market']];if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=Boolean(value);else input.value=String(value);}
      if(!ctx.snapshot){results.replaceChildren(note('Waiting for travel data…'));return;}
      const destination=travelCountry(ctx.snapshot),best=bestProduct(ctx.snapshot,ctx.now),nodes:Node[]=[];
      country.firstElementChild!.textContent=destination||'Detecting destination…';nodes.push(note(destination||'Waiting for a verified destination…'));
      if(app){nodes.push(stat('Travel capacity',app.bag.total===null?'Detecting capacity…':`${app.bag.total}${app.bag.exact?'':` · ${app.bag.source}`}`),stat('Used / free',`${app.bag.used??'—'} / ${app.bag.free??'—'}`));if(app.bag.usedSource==='purchases')nodes.push(note('Bag usage is estimated from purchases; consumed or transferred items may differ.'));if(app.bag.total===null)nodes.push(button('Capacity fallback',()=>{void ctx.openOptions?.();}));}
      if(t?.state==='OUTBOUND'&&t.arrivalAt)nodes.push(stat('Landing',time(t.arrivalAt)),note('Stock at landing is not guaranteed; quantities below are latest observations.'));
      if(best){const profit=unitProfit(best)!,hero=el('div','profit-hero');hero.append(el('span','eyebrow','BEST ESTIMATED PROFIT / ITEM'),el('strong','',best.name),stat('Profit / item',`${profit<0?'−':'+'}${money(Math.abs(profit))}`),note(priceAge(best.priceObservedAt,ctx.now)));
        const slots=app?.bag.free,qty=slots===null||slots===undefined||!freshStock(best,ctx.now)?null:Math.min(slots,best.stock!);
        if(t?.state==='ABROAD'&&qty!==null)hero.append(stat('Recommended',`Buy ${qty}`),stat('Expected gross profit',`+${money(qty*profit)}`));
        else if(t?.state==='ABROAD')hero.append(note('Purchase quantity needs a current bag counter and shop stock.'));
        if(t?.state==='OUTBOUND'&&qty!==null&&qty>0){
          hero.append(stat('Potential purchase',`${qty} × ${best.name}`),stat('Expected gross profit',`+${money(qty*profit)}`));
          const leg=t.departedAt&&t.arrivalAt&&t.arrivalAt>t.departedAt?t.arrivalAt-t.departedAt:null;
          if(leg){hero.append(stat('Expected profit / hour',`+${money(qty*profit/(2*leg/3600000))}`),note('Forecast uses twice this flight duration, excludes shopping and assumes observed stock remains available.'));}
        }
        nodes.push(hero);
      }
      const items=marketRows(ctx.snapshot,{...ctx.state.settings.market,country:'auto'},ctx.state.favorites,ctx.now);
      nodes.push(note(`${items.length} products · estimated gross profit before fees and travel costs`));
      for(const item of items){
        const selected=ctx.state.favorites.some(v=>v.itemId===item.itemId&&v.country===item.country),row=el('div','market-product');
        const star=button(selected?'★':'☆',()=>{const favorites=ctx.state.favorites.filter(v=>!(v.itemId===item.itemId&&v.country===item.country));if(!selected)favorites.push({itemId:item.itemId,name:item.name,country:item.country,minimumStock:1,alert:true});if(favorites.length<=50)void ctx.saveFavorites(favorites);});star.className='favorite-star';star.setAttribute('aria-label',`${selected?'Unwatch':'Watch'} ${item.name} in ${item.country}`);
        const title=el('div','stat');title.append(el('strong','',item.name),star);const profit=unitProfit(item),age=item.priceObservedAt?ctx.now-item.priceObservedAt:Infinity;
        row.append(title,stat('Stock',item.stock===null?'Unavailable':`${item.stock.toLocaleString()}${freshStock(item,ctx.now)?'':' · last observed'}`),stat('Cost',money(item.cost)),stat('Torn market',`${age>2*3600000&&item.tornValue?'~':''}${money(item.tornValue)}`),stat('Profit / item',profit===null?'Waiting for price…':`${profit<0?'−':'+'}${money(Math.abs(profit))}`),stat('ROI',profit!==null&&item.cost?`${(profit/item.cost*100).toFixed(1)}%`:'Waiting for price…'),note(priceAge(item.priceObservedAt,ctx.now)),note(item.observedAt?`Stock last seen ${time(item.observedAt)}`:'No stock observation yet'));nodes.push(row);
      }
      if(!items.length)nodes.push(note('No products match these filters yet. Saved products stay available while fresh data arrives.'));
      results.replaceChildren(...nodes);
    };
    return{mount(node,context){body=node;body.append(controls,results);update(context);},update(_data,context){update(context);},destroy(){clearTimeout(searchTimer);body.replaceChildren();}};
  }
};
