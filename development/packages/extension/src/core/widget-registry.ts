import type { Mode, Position, PublicState, Snapshot, WidgetId } from '@tcd/shared';
import { warStatus } from '../widgets/war-status';
import { recommendedTargets } from '../widgets/recommended-targets';
import { hospitalTimers } from '../widgets/hospital-timers';
import { chain } from '../widgets/chain';
import { travelStatus } from '../widgets/travel-status';
import { travelFavorites } from '../widgets/travel-favorites';
import { travelMarket } from '../widgets/travel-market';
import { travelProfit } from '../widgets/travel-profit';
import { companyAddiction } from '../widgets/company-addiction';
import { restock } from '../widgets/restock';
export interface WidgetContext { state: PublicState; snapshot: Snapshot | null; now: number; mode: Mode; saveSettings: (patch: Partial<PublicState['settings']>) => Promise<void>; saveFavorites: (state: PublicState['favorites']) => Promise<void> }
export interface WidgetDefinition {
  id: WidgetId; title: string; defaultPosition: Position; defaultOrder: number; modes: readonly Mode[];
  settings: { enabled: boolean; compact: boolean };
  visible?: (context: WidgetContext) => boolean;
  create(): { mount(container: HTMLElement, context: WidgetContext): void; update(data: Snapshot | null, context: WidgetContext): void; destroy(): void };
}
export class WidgetRegistry {
  private definitions = new Map<WidgetId, WidgetDefinition>();
  register(definition: WidgetDefinition): void {
    if (this.definitions.has(definition.id)) throw new Error(`Duplicate widget: ${definition.id}`); this.definitions.set(definition.id, definition);
  }
  get(id: WidgetId): WidgetDefinition | undefined { return this.definitions.get(id); }
  all(): WidgetDefinition[] { return [...this.definitions.values()].sort((a, b) => a.defaultOrder - b.defaultOrder); }
}
export function createRegistry(): WidgetRegistry {
  const registry = new WidgetRegistry(); [warStatus, recommendedTargets, hospitalTimers, chain, travelStatus, travelFavorites, restock, travelMarket, travelProfit, companyAddiction].forEach(v => registry.register(v)); return registry;
}
