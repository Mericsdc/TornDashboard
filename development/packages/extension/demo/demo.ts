import { createMockSnapshot, defaultState, StateSchema, type Favorite, type Layout, type Mode, type PublicState, type Settings } from '@tcd/shared';
import { Dashboard } from '../src/core/dashboard';
import type { DashboardStore } from '../src/services/storage';
class PreviewStore implements DashboardStore {
  private listeners = new Set<() => void>();
  async load(): Promise<PublicState> {
    try { const value = StateSchema.safeParse(JSON.parse(localStorage.getItem('tcd-preview') || 'null')); if (value.success) return value.data; } catch { /* Corrupt fixture storage resets safely. */ }
    const initial = defaultState(); initial.settings.dataSource = 'mock'; initial.settings.mode = 'WAR'; initial.settings.mockScenario = new URL(location.href).searchParams.get('sid') === 'travel' ? 'travel' : 'war'; return initial;
  }
  private async save(state: PublicState): Promise<PublicState> { const parsed = StateSchema.parse(state); localStorage.setItem('tcd-preview', JSON.stringify(parsed)); this.listeners.forEach(fn => fn()); return parsed; }
  async settings(patch: Partial<Settings>) { const state = await this.load(); return this.save({ ...state, settings: { ...state.settings, ...patch } }); }
  async layout(mode: Mode, layout: Layout) { const state = await this.load(); return this.save({ ...state, layouts: { ...state.layouts, [mode]: layout } }); }
  async favorites(favorites: Favorite[]) { return this.save({ ...await this.load(), favorites }); }
  async snapshot() { return createMockSnapshot((await this.load()).settings.mockScenario); }
  async openOptions() { alert('This preview uses local fixture storage. Load the Chrome extension to use its full options page and private credentials.'); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
}
const store = new PreviewStore();
void (async () => {
  const scenario = new URL(location.href).searchParams.get('sid');
  if (['travel', 'war', 'normal'].includes(scenario || '')) await store.settings({ mockScenario: scenario as 'travel' | 'war' | 'normal', autoSwitching: true });
  await Dashboard.mount(store);
})();
const scenario = document.querySelector<HTMLSelectElement>('#demo-scenario')!;
void store.load().then(state => { scenario.value = state.settings.mockScenario; });
scenario.addEventListener('change', () => { void store.settings({ mockScenario: scenario.value as 'travel' | 'war' | 'normal', autoSwitching: true }); });
document.querySelector('#replace-main')!.addEventListener('click', () => {
  const main = document.querySelector('main')!; main.replaceWith(main.cloneNode(true));
  document.querySelector('#tcd-dashboard')?.remove(); history.pushState({}, '', '?sid=travel');
});
