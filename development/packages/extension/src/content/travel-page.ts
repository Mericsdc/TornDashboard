/** Passive observation of the player's own Torn shop responses. No keys, extension APIs or gameplay requests. */
const original=window.fetch;
let lastShop:{country:string;shop:{itemId:number;cost:number|null;stock:number|null}[]}|undefined;
const recent:unknown[]=[];
function publish(payload:unknown):void{window.postMessage({source:'torndashboard-travel-page',payload},location.origin);}
window.addEventListener('message',event=>{if(event.source===window&&event.origin===location.origin&&event.data?.source==='torndashboard-travel-isolated'&&event.data.type==='ready'){if(lastShop)publish(lastShop);recent.forEach(publish);}});
window.fetch=function(input,init){
  const promise=original.call(this,input,init);let url:URL;
  try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch{return promise;}
  if(url.origin!==location.origin||url.pathname!=='/page.php'||url.searchParams.get('sid')!=='travelData')return promise;
  const params=new URLSearchParams(url.search);
  if(typeof init?.body==='string'||init?.body instanceof URLSearchParams)new URLSearchParams(String(init.body)).forEach((value,name)=>params.set(name,value));
  if(init?.body instanceof FormData)for(const name of ['step','itemID','amount']){const value=init.body.get(name);if(typeof value==='string')params.set(name,value);}
  const step=params.get('step');if(step==='return')publish({returnIntent:true});
  void promise.then(async response=>{
    if(!response.ok)return;const body=await response.clone().text();if(body.length>2*1024*1024)return;
    const json=JSON.parse(body) as Record<string,unknown>;
    if(step==='shop'&&typeof json.country==='string'){
      const rows=Array.isArray(json.stock)?json.stock:Array.isArray(json.shops)?json.shops.flatMap(shop=>Array.isArray(shop?.stock)?shop.stock:[]):[];
      lastShop={country:json.country,shop:rows.slice(0,300).map(row=>({itemId:Number(row.ID),cost:Number.isFinite(Number(row.price))?Number(row.price):null,stock:Number.isSafeInteger(Number(row.stock))?Number(row.stock):null}))};publish(lastShop);
    }
    if(step!=='buy'||json.success===false||json.error)return;
    const itemId=Number(params.get('itemID')),quantity=Number(params.get('amount'));if(!Number.isSafeInteger(itemId)||itemId<1||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000000)return;
    const confirmed=json.success===true||json.success===1||json.status==='success'||(typeof json.message==='string'&&/\byou (?:have )?(?:bought|purchased)\b/i.test(json.message.replace(/<[^>]*>/g,'')));
    const unit=Number(json.cost_each),total=Number(json.cost_total),shop=lastShop?.shop.find(s=>s.itemId===itemId),cost=Number.isFinite(unit)&&unit>0?unit:shop?.cost??undefined;
    const receipt={id:crypto.randomUUID(),itemId,quantity,unitCost:cost,totalCost:Number.isFinite(total)&&total>0?total:cost?cost*quantity:undefined};
    const payload={country:typeof json.country==='string'?json.country:lastShop?.country,...(confirmed?{receipt}:{candidate:receipt})};
    if(confirmed){recent.push(payload);if(recent.length>20)recent.shift();}publish(payload);
  }).catch(()=>undefined);
  return promise;
};
