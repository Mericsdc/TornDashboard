import Sortable from 'sortablejs';
import type { Layout, WidgetId } from '@tcd/shared';
export class DragDrop {
  private lists: Sortable[];
  dragging = false;
  constructor(private left: HTMLElement, private right: HTMLElement, animation: boolean, onChange: (layout: Layout) => void) {
    const options: Sortable.Options = {
      group: 'tcd-widgets', handle: '.drag-handle', draggable: '.widget-card', dataIdAttr: 'data-widget-id',
      animation: animation ? 160 : 0, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen',
      forceFallback: true, fallbackOnBody: false, fallbackTolerance: 4,
      onStart: () => { this.dragging = true; }, onEnd: () => { this.dragging = false; onChange(this.read()); }
    };
    this.lists = [new Sortable(left, options), new Sortable(right, options)];
  }
  read(): Layout {
    const ids = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>(':scope > .widget-card')].map(v => v.dataset.widgetId as WidgetId);
    return { left: ids(this.left), right: ids(this.right) };
  }
  animation(enabled: boolean): void { this.lists.forEach(list => list.option('animation', enabled ? 160 : 0)); }
  destroy(): void { this.lists.forEach(list => list.destroy()); }
}
