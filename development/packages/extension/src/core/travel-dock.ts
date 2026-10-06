import { el } from './dom';
import { travelMarket } from '../widgets/travel-market';
import { travelProfit } from '../widgets/travel-profit';
import type { WidgetContext, WidgetDefinition } from './widget-registry';
export class TravelDock {
  readonly host = el('div');
  readonly dashboard = el('section','dashboard travel-dock');
  private widgets = new Map<string, ReturnType<WidgetDefinition['create']>>();
  constructor(css: string) {
    this.host.id='tcd-travel-dock';const shadow=this.host.attachShadow({mode:'open'}),style=el('style');style.textContent=css;shadow.append(style,this.dashboard);this.host.hidden=true;
  }
  update(context: WidgetContext): void {
    const app=context.snapshot?.travelApp, phase=app?.travel.state;
    const active=(context.mode==='TRAVEL'||context.mode==='CUSTOM')&&Boolean(app ? app.travelSession || app.previewCountry : context.snapshot?.travel?.active);
    this.host.hidden=!active;this.dashboard.dataset.theme=context.state.settings.theme;this.dashboard.dataset.density=context.state.settings.density;
    this.host.style.setProperty('--panel-opacity',String(context.state.settings.opacity));this.host.style.setProperty('--widget-gap',`${context.state.settings.gap}px`);
    const returning=phase==='RETURNING'||phase==='LANDED'&&app?.travel.destinationCountry==='Torn';
    for (const definition of [travelProfit,travelMarket]) {
      const enabled=active&&!context.state.settings.disabledWidgets.includes(definition.id)&&(definition.id!=='travel-profit'||returning||phase==='ABROAD');
      let instance=this.widgets.get(definition.id);
      if(!enabled){if(instance){instance.destroy();this.dashboard.querySelector(`[data-widget-id="${definition.id}"]`)?.remove();this.widgets.delete(definition.id);}continue;}
      if(!instance){const card=el('article','widget-card');card.dataset.widgetId=definition.id;const header=el('header','widget-header');header.append(el('h2','',definition.title));const body=el('div','widget-body');card.append(header,body);this.dashboard.append(card);instance=definition.create();instance.mount(body,context);this.widgets.set(definition.id,instance);}
      const title=this.dashboard.querySelector(`[data-widget-id="${definition.id}"] h2`)!;
      title.textContent=definition.id==='travel-profit'?'Trip Profit':returning?'Landing Summary':phase==='ABROAD'?'Shop Assistant':'Travel Market';
      instance.update(context.snapshot,context);
    }
    let cursor=this.dashboard.firstElementChild;
    for(const id of returning?['travel-profit','travel-market']:['travel-market','travel-profit']){const card=this.dashboard.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);if(card){if(card!==cursor)this.dashboard.insertBefore(card,cursor);cursor=card.nextElementSibling;}}
    this.dashboard.classList.toggle('single-card',this.widgets.size===1);
  }
  destroy():void{this.widgets.forEach(widget=>widget.destroy());this.widgets.clear();this.host.remove();}
}
