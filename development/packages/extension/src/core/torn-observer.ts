import type { Panels } from './panels';
const ANCHORS=['#mainContainer','#main-content','.content-wrapper','main','.main-wrap'];
export class TornObserver {
  private mutations:MutationObserver;private resize:ResizeObserver;private frame=0;private watched?:Element;private url=location.href;private timer:ReturnType<typeof setInterval>;private disposed=false;
  constructor(private panels:Panels,private dock:HTMLElement,private width:()=>number,private onNavigation:()=>void){
    this.mutations=new MutationObserver(records=>{if(records.some(record=>![panels.host,dock].some(host=>host===record.target||host.contains(record.target))))this.schedule();});
    this.resize=new ResizeObserver(this.schedule);this.mutations.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
    window.addEventListener('resize',this.schedule);window.addEventListener('scroll',this.schedule,{passive:true});window.addEventListener('popstate',this.schedule);
    this.timer=setInterval(()=>{if(this.url!==location.href){this.url=location.href;this.onNavigation();this.schedule();}if(!panels.host.isConnected||!dock.isConnected)this.schedule();},1000);this.schedule();
  }
  readonly schedule=():void=>{if(this.disposed||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.place();});};
  private anchor():HTMLElement|undefined{
    for(const selector of ANCHORS){const candidate=[...document.querySelectorAll<HTMLElement>(selector)].find(node=>{const r=node.getBoundingClientRect();return r.width>=250&&r.height>40&&node!==this.panels.host;});if(candidate)return candidate;}return undefined;
  }
  private place():void{
    const anchor=this.anchor(),host=this.panels.host,gap=12;
    if(this.watched!==anchor){this.resize.disconnect();if(anchor)this.resize.observe(anchor);this.watched=anchor;}
    const rect=anchor?.getBoundingClientRect(),sidebars=[...document.querySelectorAll<HTMLElement>('#sidebar,.sidebar,#sidebarroot')].filter(node=>!host.contains(node)).map(node=>node.getBoundingClientRect()).filter(r=>r.width>0&&r.right>0&&r.left<innerWidth);
    const leftEdge=rect?Math.min(rect.left,...sidebars.map(r=>r.left)):0,rightEdge=rect?Math.max(rect.right,...sidebars.map(r=>r.right)):innerWidth;
    const freeLeft=Math.floor(leftEdge-gap*2),freeRight=Math.floor(innerWidth-rightEdge-gap*2);
    const both=Boolean(rect&&freeLeft>=220&&freeRight>=220),one=Boolean(rect&&(freeLeft>=220||freeRight>=220));
    const width=Math.min(this.width(),both?Math.min(freeLeft,freeRight):one?Math.max(freeLeft,freeRight):this.width());
    const placement=both?'gutters':one?'single-gutter':'inline';host.dataset.placement=placement;host.style.setProperty('--actual-width',`${width}px`);
    if(one&&rect){
      if(host.parentElement!==document.body)document.body.append(host);
      const header=document.querySelector<HTMLElement>('header,#header');const top=Math.max(gap,Math.min(innerHeight/4,Math.max(rect.top,header?.getBoundingClientRect().bottom??gap)));
      host.style.setProperty('--left-x',`${leftEdge-width-gap}px`);host.style.setProperty('--right-x',`${rightEdge+gap}px`);host.style.setProperty('--single-x',`${freeRight>=220?rightEdge+gap:leftEdge-width-gap}px`);host.style.setProperty('--panel-top',`${top}px`);
    }else if(anchor?.parentElement){if(anchor.previousElementSibling!==host)anchor.before(host);}else if(host.parentElement!==document.body)document.body.append(host);
    if(anchor){
      const content=anchor.querySelector<HTMLElement>('#content,.content,.content-wrapper')||anchor;
      let flight:HTMLElement|null|undefined=content.querySelector<HTMLElement>('#travel-flight,[data-travel-flight],.travel-container,.travel-wrap,.flight-info');
      if(!flight)flight=[...content.querySelectorAll<HTMLElement>('div,p,section')].filter(node=>node!==this.dock&&node.textContent&&node.textContent.length<900&&/remaining flight time/i.test(node.textContent)).sort((a,b)=>(a.textContent?.length||0)-(b.textContent?.length||0))[0];
      // A live travel module or its progress block owns the dock; other pages use main content as a fallback.
      if(flight?.parentElement){if(flight.nextElementSibling!==this.dock)flight.after(this.dock);}else if(this.dock.parentElement!==content)content.append(this.dock);
      document.querySelectorAll('#tcd-travel-dock').forEach(node=>{if(node!==this.dock)node.remove();});
    }
  }
  destroy():void{this.disposed=true;this.mutations.disconnect();this.resize.disconnect();clearInterval(this.timer);cancelAnimationFrame(this.frame);window.removeEventListener('resize',this.schedule);window.removeEventListener('scroll',this.schedule);window.removeEventListener('popstate',this.schedule);}
}
