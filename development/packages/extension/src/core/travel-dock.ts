import { el } from './dom';
import { travelMarket } from '../widgets/travel-market';
import { travelProfit } from '../widgets/travel-profit';
import type { WidgetContext, WidgetDefinition } from './widget-registry';
export class TravelDock {
  readonly host = el('div');
  readonly dashboard = el('section','dashboard travel-dock');
  private widgets = new Map<string, ReturnType<WidgetDefinition['create']>>();
  constructor(css: string) {
    this.host.id='tcd-travel-dock'; const shadow=this.host.attachShadow({mode:'open'}),style=el('style');style.textContent=css;shadow.append(style,this.dashboard);this.host.hidden=true;
  }
  update(context: WidgetContext): void {
    const active = context.mode === 'TRAVEL' && Boolean(context.snapshot?.travel?.active && context.snapshot.travel.observedAt && context.now-context.snapshot.travel.observedAt<=90000);
    this.host.hidden=!active;this.dashboard.dataset.theme=context.state.settings.theme;this.dashboard.dataset.density=context.state.settings.density;
    this.host.style.setProperty('--panel-opacity',String(context.state.settings.opacity));this.host.style.setProperty('--widget-gap',`${context.state.settings.gap}px`);
    for(const definition of [travelProfit,travelMarket]){
      const enabled=active&&!context.state.settings.disabledWidgets.includes(definition.id);
      let instance=this.widgets.get(definition.id);
      if(!enabled){if(instance){instance.destroy();this.dashboard.querySelector(`[data-widget-id="${definition.id}"]`)?.remove();this.widgets.delete(definition.id);}continue;}
      if(!instance){const card=el('article','widget-card');card.dataset.widgetId=definition.id;const header=el('header','widget-header');header.append(el('h2','',definition.title));const body=el('div','widget-body');card.append(header,body);this.dashboard.append(card);instance=definition.create();instance.mount(body,context);this.widgets.set(definition.id,instance);}
      instance.update(context.snapshot,context);
    }
  }
  destroy():void{this.widgets.forEach(widget=>widget.destroy());this.widgets.clear();this.host.remove();}
}
