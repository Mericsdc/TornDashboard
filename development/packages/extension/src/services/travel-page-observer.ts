import { canonicalCountry, COUNTRIES, type PageTravel, type Snapshot } from '@tcd/shared';
const number = (value: string | null | undefined) => { const n = Number(value?.replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n >= 0 && value?.trim() ? n : null; };
const itemId = (node: Element): number | null => {
  const value = node.getAttribute('data-item-id') || node.querySelector<HTMLInputElement>('input[name="itemID"]')?.value ||
    node.querySelector<HTMLImageElement>('img[src*="/items/"]')?.src.match(/\/items\/(\d+)/)?.[1];
  const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null;
};
/** Read-only, debounced observations. Timers are timestamps, never polling triggers. */
export class TravelPageObserver {
  private observer: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private snapshot?: Snapshot;
  private signature = '';
  private disposed = false;
  private candidates: { receipt: NonNullable<PageTravel['receipt']>; before: number | null; at: number; beforeItem: number | null }[]=[];
  private bagUsed: number | null=null;
  private inventory: Record<string,number>={};
  constructor(private publish: (observation: PageTravel) => void) {
    this.observer = new MutationObserver(records => { if (records.some(r => !(r.target instanceof Element && r.target.closest('#tcd-dashboard,#tcd-travel-dock')))) this.schedule(); });
    this.observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-quantity', 'data-used', 'data-total', 'data-item-id', 'hidden'] });
    document.addEventListener('pointerdown', this.intent, true); window.addEventListener('message', this.bridge); window.addEventListener('popstate', this.schedule); this.schedule();window.postMessage({source:'torndashboard-travel-isolated',type:'ready'},location.origin);
  }
  setSnapshot(snapshot: Snapshot): void { if(this.snapshot?.travelApp?.travelSession?.tripId!==snapshot.travelApp?.travelSession?.tripId || this.snapshot?.travelApp?.travel.state!==snapshot.travelApp?.travel.state)this.signature=''; this.snapshot = snapshot; this.schedule(); }
  private schedule = (): void => { if (this.disposed || this.timer) return; this.timer = setTimeout(() => { this.timer = undefined; this.inspect(); }, 250); };
  private main(): HTMLElement | null { return document.querySelector('#travel-root,#mainContainer,#main-content,main,.content-wrapper'); }
  private inspect(): void {
    const main = this.main(); if (!main) return;
    const text = main.textContent?.slice(0, 50000) || '', names = [...COUNTRIES, 'Torn', 'Dubai', 'United Arab Emirates', 'UK'].sort((a, b) => b.length - a.length).join('|');
    const route = text.match(new RegExp(`(${names})\\s*(?:to|→)\\s*(${names})`, 'i')), result: PageTravel = {};
    if (route) {
      const origin = canonicalCountry(route[1]), destination = canonicalCountry(route[2]), timer = text.match(/remaining flight time\s*[-:]?\s*(\d{1,2}):(\d{2}):(\d{2})/i);
      if (origin && destination && timer) {
        result.originCountry = origin; result.destinationCountry = destination; result.state = destination === 'Torn' ? 'RETURNING' : 'OUTBOUND';
        const remaining = Number(timer[1]) * 3600 + Number(timer[2]) * 60 + Number(timer[3]); const prior=this.snapshot?.travelApp?.travel;result.arrivalAt = prior?.originCountry===origin&&prior.destinationCountry===destination&&prior.arrivalAt ? prior.arrivalAt : Date.now() + remaining * 1000;
      }
    }
    const counter = main.querySelector<HTMLElement>('[data-bag-counter],[data-travel-capacity],.info-msg-cont .msg');
    if (counter) {
      const ratio = counter.textContent?.match(/(\d+)\s*\/\s*(\d+)/), total = number(counter.dataset.total || ratio?.[2]), used = number(counter.dataset.used || ratio?.[1]);
      if (total && total <= 100 && used !== null && used <= total) result.bag = { total, used };
    }
    const ownInventory = main.querySelectorAll<HTMLElement>('[data-inventory-item-id][data-inventory-quantity]');
    if (ownInventory.length) {
      const items: Record<string, number> = {}; for (const row of ownInventory) { const id = Number(row.dataset.inventoryItemId), amount = number(row.dataset.inventoryQuantity); if (id > 0 && amount !== null) items[id] = amount; }
      result.inventory = { items, coveredIds: Object.keys(items).map(Number), observedAt: Date.now(), source: 'page', kind: 'inventory', complete: main.querySelector('[data-inventory-complete="true"]') !== null };
    }
    for (const candidate of this.candidates) {
      const delta=result.inventory && candidate.beforeItem!==null ? (result.inventory.items[candidate.receipt.itemId]??0)-candidate.beforeItem : null;
      const bagDelta=result.bag?.used!==null && result.bag?.used!==undefined && candidate.before!==null ? result.bag.used-candidate.before : null;
      if (Date.now()-candidate.at<=10000 && (delta===candidate.receipt.quantity || bagDelta===candidate.receipt.quantity)) {
        this.publish({receipt:{...candidate.receipt,source:'inventory-corroborated'}});candidate.at=0;
      }
    }
    this.candidates=this.candidates.filter(c=>Date.now()-c.at<=10000);
    if(result.bag?.used!==null&&result.bag?.used!==undefined)this.bagUsed=result.bag.used;
    if(result.inventory)this.inventory=result.inventory.items;
    const shop = [...main.querySelectorAll<HTMLElement>('[data-shop-item],[class*="stockTableWrapper"] [class*="row___"]')].slice(0, 300);
    if (shop.length) {
      const known = this.snapshot?.travelApp?.travel.marketContextCountry || canonicalCountry(this.snapshot?.travel?.destination);
      if (!result.state && known && this.snapshot?.travelApp?.travel.state !== 'RETURNING') { result.state = 'ABROAD'; result.destinationCountry = known; }
      result.shop = shop.flatMap(row => {
        const id=itemId(row);if(!id)return[];
        const cell=(name:string)=>{
          const explicit=row.querySelector(`[data-tt-content-type="${name}"],[class*="${name}Cell"]`);if(explicit)return explicit.textContent;
          const headings=[...row.closest('[class*="stockTableWrapper"]')?.querySelector('[class*="itemsHeader"]')?.children||[]];
          const index=headings.findIndex(h=>h.textContent?.trim().toLowerCase()===name);if(index>=0)return row.children[index]?.textContent;
          return [...row.children].find(child=>child.textContent?.trim().toLowerCase().startsWith(name) || name==='cost'&&child.textContent?.trim().startsWith('$'))?.textContent;
        };
        return [{itemId:id,cost:number(row.dataset.cost||cell('cost')),stock:number(row.dataset.stock||cell('stock'))}];
      });
    }
    const destination = main.querySelector<HTMLElement>('[data-selected-country],[class*="destinationPanel"] [class*="country"],[class*="destination___"].expanded [class*="country"]');
    const selected = canonicalCountry(destination?.dataset.selectedCountry || destination?.textContent); if (selected && selected !== 'Torn') result.selectedCountry = selected;
    const signature = JSON.stringify({ ...result, arrivalAt: result.arrivalAt ? Math.round(result.arrivalAt / 5000) : undefined, inventory: result.inventory ? { ...result.inventory, observedAt: 0 } : undefined });
    if (signature === this.signature || !Object.keys(result).length) return; this.signature = signature; this.publish(result);
  }
  private intent = (event: Event): void => {
    const button = (event.target as Element)?.closest?.('button,a,input[type="button"]'); if (!button || button.closest('#tcd-dashboard,#tcd-travel-dock')) return;
    if (/^(?:return(?: to torn)?|fly (?:back )?to torn)$/i.test(button.textContent?.trim() || (button as HTMLInputElement).value || '') && this.snapshot?.travelApp?.travelSession) this.publish({ returnIntent: true });
  };
  private bridge = (event: MessageEvent): void => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'torndashboard-travel-page') return;
    const data = event.data.payload as { country?: string; shop?: PageTravel['shop']; receipt?: { id?: string; itemId?: number; quantity?: number; unitCost?: number; totalCost?: number }; returnIntent?: boolean; candidate?: { id: string; itemId: number; quantity: number; unitCost?: number; totalCost?: number } };
    if (!data || typeof data !== 'object') return;
    const country = canonicalCountry(data.country) || this.snapshot?.travelApp?.travelSession?.country || canonicalCountry(this.snapshot?.travel?.destination);
    const result: PageTravel = {};
    if (data.returnIntent) result.returnIntent = true;
    if (country && country !== 'Torn' && Array.isArray(data.shop)) { result.state = 'ABROAD'; result.destinationCountry = country; result.shop = data.shop.slice(0, 300); }
    if (country && data.receipt?.id && data.receipt.itemId && data.receipt.quantity) result.receipt = { id: data.receipt.id.slice(0, 100), country,
      itemId: data.receipt.itemId, quantity: data.receipt.quantity, observedAt: Date.now(), source: 'page-receipt', unitCost: data.receipt.unitCost ?? null, totalCost: data.receipt.totalCost ?? null,
      costSource: data.receipt.totalCost || data.receipt.unitCost ? 'receipt' : 'catalog' };
    if(country && data.candidate?.id && data.candidate.itemId && data.candidate.quantity){
      const c=data.candidate;
      this.candidates.push({receipt:{id:c.id.slice(0,100),country,itemId:c.itemId,quantity:c.quantity,observedAt:Date.now(),source:'inventory-corroborated',unitCost:c.unitCost??null,totalCost:c.totalCost??null,costSource:c.totalCost||c.unitCost?'receipt':'catalog'},before:this.bagUsed,beforeItem:this.inventory[c.itemId]??null,at:Date.now()});
      this.candidates=this.candidates.slice(-10);
    }
    if (Object.keys(result).length) this.publish(result);
    this.schedule();
  };
  destroy(): void { this.disposed = true; clearTimeout(this.timer); this.observer.disconnect(); document.removeEventListener('pointerdown', this.intent, true); window.removeEventListener('message', this.bridge); window.removeEventListener('popstate', this.schedule); }
}
