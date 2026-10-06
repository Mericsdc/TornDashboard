import type { ChainObservation } from '@tcd/shared';

/** Reads only the player's own visible sidebar. No gameplay requests or API polling. */
export class ChainPageObserver {
  private observer: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private sent?: ChainObservation;
  private latest?: ChainObservation;
  private row?: HTMLElement;
  constructor(private publish: (observation: ChainObservation) => void) {
    this.observer = new MutationObserver(records => {
      if (records.some(r => !(r.target instanceof Element && r.target.closest('#tcd-dashboard')))) this.schedule();
    });
    this.observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    document.addEventListener('visibilitychange', this.schedule); this.schedule();
  }
  private schedule = (): void => {
    if (this.disposed || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.inspect(); }, 60);
  };
  private inspect(): void {
    if (document.visibilityState !== 'visible') return;
    const roots = document.querySelectorAll<HTMLElement>('#sidebarroot,#sidebar,.sidebar');
    for (const root of roots) {
      if (!root.getClientRects().length || getComputedStyle(root).visibility === 'hidden') continue;
      const rows = [...root.querySelectorAll<HTMLElement>('div,p,li')].filter(node => {
        const text = node.textContent?.trim() || '';
        return text.length < 180 && /^Chain\s*:/i.test(text) && node.getClientRects().length;
      }).sort((a,b) => (a.textContent?.length || 0) - (b.textContent?.length || 0));
      for (const row of rows) {
        const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT),parts:string[]=[]; let textNode:Node|null; while((textNode=walker.nextNode()))parts.push(textNode.textContent || '');
        const text = parts.join(' '), count = text.match(/Chain\s*:\s*([\d,]+)\s*\/\s*([\d,]+)/i);
        const timer = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[^\d]|$)/);
        if (!count || !timer) continue;
        const remaining = timer[3] === undefined ? Number(timer[1])*60+Number(timer[2]) : Number(timer[1])*3600+Number(timer[2])*60+Number(timer[3]);
        let value:ChainObservation={count:Number(count[1]!.replaceAll(',','')),goal:Number(count[2]!.replaceAll(',','')),remaining,at:Date.now()};
        if (!Number.isSafeInteger(value.count) || value.count<0 || value.count>1000000 || !Number.isSafeInteger(value.goal) || value.goal<1 || value.goal>1000000 || remaining<0 || remaining>600) continue;
        if(this.latest && this.latest.count===value.count && this.latest.goal===value.goal && this.latest.remaining===value.remaining)value=this.latest;
        this.latest=value;this.row=row;
        if(value.count===0 || value.remaining===0 || value.at+value.remaining*1000<=Date.now()){this.current(Date.now());return;}
        const old=this.sent, deadline=value.at+value.remaining*1000;
        const changed=!old || old.count!==value.count || old.goal!==value.goal || Boolean(old.remaining)!==Boolean(value.remaining)
          || old.remaining>30 && value.remaining<=30 || Math.abs(deadline-(old.at+old.remaining*1000))>1200 || value.at-old.at>=10000;
        if(changed){this.sent=value;this.publish(value);}return;
      }
    }
  }
  current(now: number): ChainObservation | undefined {
    if(document.visibilityState!=='visible' || !this.row?.isConnected || !this.row.getClientRects().length || getComputedStyle(this.row).visibility==='hidden' || !this.latest)return undefined;
    const value=this.latest;
    // A static zero remains authoritative. A frozen positive countdown still expires locally.
    if(value.remaining===0 || value.count===0 || value.at+value.remaining*1000<=now){
      const ended={...value,remaining:0,at:now};
      if(!this.sent || this.sent.remaining>0 || now-this.sent.at>=10000){this.sent=ended;this.publish(ended);}return ended;
    }
    return value;
  }
  destroy(): void { this.disposed=true;clearTimeout(this.timer);this.observer.disconnect();document.removeEventListener('visibilitychange',this.schedule); }
}
