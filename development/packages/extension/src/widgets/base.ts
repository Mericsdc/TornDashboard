import type { WidgetContext, WidgetDefinition } from '../core/widget-registry';
/** Each mounted widget owns its container and cleanup; no document-wide widget selectors. */
export function widget(definition: Omit<WidgetDefinition, 'create' | 'settings'>, render: (context: WidgetContext) => Node[]): WidgetDefinition {
  return { ...definition, settings: { enabled: true, compact: true }, create: () => {
    let container: HTMLElement | undefined;
    let previous = '';
    const update = (context: WidgetContext) => {
      const timers = ['war-status', 'hospital-timers', 'chain', 'travel-status'];
      const key = JSON.stringify([context.snapshot, context.state.favorites, context.state.settings.weights, context.state.settings.alerts,
        Math.floor(context.now / (timers.includes(definition.id) ? 1000 : 10000))]);
      if (!container || key === previous) return;
      previous = key;
      const expanded = [...container.querySelectorAll('details')].map(node => node.open);
      container.replaceChildren(...render(context));
      [...container.querySelectorAll('details')].forEach((node, i) => { node.open = expanded[i] || false; });
    };
    return {
      mount(node, context) { container = node; update(context); },
      update(_data, context) { update(context); },
      destroy() { container?.replaceChildren(); container = undefined; }
    };
  } };
}
