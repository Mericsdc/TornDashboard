import type { Layout, WidgetId } from '@tcd/shared';
import { button, el } from './dom';
import type { Panels } from './panels';
import type { WidgetContext, WidgetDefinition, WidgetRegistry } from './widget-registry';
type Instance = { card: HTMLElement; widget: ReturnType<WidgetDefinition['create']> };
export class WidgetManager {
  private mounted = new Map<WidgetId, Instance>();
  constructor(private panels: Panels, private registry: WidgetRegistry, private move: (id: WidgetId, direction: 'up' | 'down' | 'across') => void) {}
  reconcile(layout: Layout, context: WidgetContext): void {
    const wanted = new Set([...layout.left, ...layout.right].filter(id => !['travel-market','travel-profit'].includes(id) && !context.state.settings.disabledWidgets.includes(id) && (context.mode === 'CUSTOM' || this.registry.get(id)?.modes.includes(context.mode)) && (this.registry.get(id)?.visible?.(context) ?? true)));
    for (const [id, instance] of this.mounted) if (!wanted.has(id)) { instance.widget.destroy(); instance.card.remove(); this.mounted.delete(id); }
    for (const side of ['left', 'right'] as const) {
      const list = this.panels[side];
      let cursor = list.firstElementChild;
      for (const id of layout[side]) {
        if (!wanted.has(id)) continue;
        const definition = this.registry.get(id); if (!definition) continue;
        let instance = this.mounted.get(id);
        if (!instance) {
          const card = el('article', 'widget-card'); card.dataset.widgetId = id;
          const header = el('header', 'widget-header');
          const handle = button('⠿', () => undefined); handle.className = 'drag-handle'; handle.setAttribute('aria-label', `Drag ${definition.title}`);
          const controls = el('div', 'widget-controls');
          for (const [direction, label, symbol] of [['up', 'Move up', '↑'], ['down', 'Move down', '↓'], ['across', 'Move to other panel', '⇄']] as const) {
            const control = button(symbol, () => this.move(id, direction)); control.setAttribute('aria-label', `${label}: ${definition.title}`); controls.append(control);
          }
          header.append(handle, el('h2', '', definition.title), controls);
          const body = el('div', 'widget-body'); card.append(header, body);
          const widget = definition.create(); widget.mount(body, context); instance = { card, widget }; this.mounted.set(id, instance);
        }
        // Moving an already correctly positioned card detaches its focused inputs in Chrome.
        if (instance.card !== cursor) list.insertBefore(instance.card, cursor);
        cursor = instance.card.nextElementSibling;
        instance.widget.update(context.snapshot, context);
      }
    }
  }
  update(context: WidgetContext): void { this.mounted.forEach(v => v.widget.update(context.snapshot, context)); }
  destroy(): void { this.mounted.forEach(v => { v.widget.destroy(); v.card.remove(); }); this.mounted.clear(); }
}
