export type Events = { mode: string; error: string; layout: undefined };
export class EventBus {
  private listeners = new Map<keyof Events, Set<(value: never) => void>>();
  on<K extends keyof Events>(event: K, handler: (value: Events[K]) => void): () => void {
    const handlers = this.listeners.get(event) || new Set(); handlers.add(handler as (value: never) => void); this.listeners.set(event, handlers);
    return () => { handlers.delete(handler as (value: never) => void); };
  }
  emit<K extends keyof Events>(event: K, value: Events[K]): void { this.listeners.get(event)?.forEach(fn => fn(value as never)); }
  destroy(): void { this.listeners.clear(); }
}
