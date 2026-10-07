import { MODES, PRESETS, moveWidget, presetLayout, reconcileLayout, type Layout, type Mode, type PublicState, type Settings, type Snapshot, type WidgetId } from '@tcd/shared';
import type { DashboardStore } from '../services/storage';
import { Panels } from './panels';
import { TornObserver } from './torn-observer';
import { DragDrop } from './drag-drop';
import { ModeManager } from './mode-manager';
import { createRegistry, type WidgetContext } from './widget-registry';
import { WidgetManager } from './widget-manager';
import { EventBus } from './event-bus';
import { button, el } from './dom';
import css from '../styles/dashboard.css';

export class Dashboard {
  readonly events = new EventBus();
  private panels: Panels;
  private observer: TornObserver;
  private manager: WidgetManager;
  private drag: DragDrop;
  private modeManager = new ModeManager();
  private mode: Mode;
  private snapshot: Snapshot | null = null;
  private layouts: PublicState['layouts'];
  private unsubscribe: () => void;
  private tick: ReturnType<typeof setInterval>;
  private polling: ReturnType<typeof setInterval>;
  private pending = false;
  private destroyed = false;
  private refreshGeneration = 0;
  private quickSignature = '';
  private saveQueue: Promise<unknown> = Promise.resolve();
  private constructor(private store: DashboardStore, private state: PublicState) {
    this.mode = state.settings.mode; this.layouts = structuredClone(state.layouts);
    this.panels = new Panels(css, value => {
      if (MODES.includes(value as Mode)) void this.changeSettings({ mode: value as Mode, autoSwitching: false });
    }, () => { void store.openOptions().catch(error => this.error(error)); });
    this.manager = new WidgetManager(this.panels, createRegistry(), (id, direction) => this.move(id, direction));
    this.drag = new DragDrop(this.panels.left, this.panels.right, state.settings.animation, layout => { this.persistLayout(layout); });
    this.observer = new TornObserver(this.panels, () => this.state.settings.panelWidth, () => this.render());
    this.unsubscribe = store.subscribe((refreshData, clearAccount) => {
      if (clearAccount) this.snapshot = null;
      if (refreshData) { this.refreshGeneration++; this.pending = false; }
      void this.reload().then(() => { if (refreshData) void this.refresh(); }).catch(error => this.error(error));
    });
    this.events.on('error', message => { this.panels.error.hidden = false; this.panels.error.textContent = message; });
    this.tick = setInterval(() => { if (!this.drag.dragging) this.manager.update(this.context()); void this.store.checkAlerts?.().catch(error => this.error(error)); }, 1000);
    this.polling = setInterval(() => { void this.refresh(); }, 15000);
    this.render(); void this.refresh();
  }
  static async mount(store: DashboardStore): Promise<Dashboard> { return new Dashboard(store, await store.load()); }
  private context(): WidgetContext {
    return { state: this.state, snapshot: this.snapshot ? {...this.snapshot,chain:this.store.nativeChain?.(this.snapshot.chain,Date.now()) ?? this.snapshot.chain} : null, now: Date.now(), mode: this.mode,
      openOptions: () => this.store.openOptions(), saveSettings: patch => this.changeSettings(patch), saveFavorites: async favorites => { try { this.state = await this.store.favorites(favorites); this.render(); } catch (error) { this.error(error); } } };
  }
  private async reload(): Promise<void> {
    const next = await this.store.load(); if (this.destroyed) return;
    const sourceChanged = next.settings.dataSource !== this.state.settings.dataSource || next.settings.mockScenario !== this.state.settings.mockScenario || next.settings.backendUrl !== this.state.settings.backendUrl || next.settings.stockProvider !== this.state.settings.stockProvider;
    this.state = next;
    if (next.settings.rememberPositions) this.layouts = structuredClone(next.layouts);
    if (sourceChanged) { if (next.settings.dataSource !== 'torn') this.snapshot = null; this.refreshGeneration++; this.pending = false; }
    this.render(); if (sourceChanged) void this.refresh();
  }
  private render(): void {
    if (this.destroyed || this.drag.dragging) return;
    const travelHint = /(?:sid=travel|travelagency)/i.test(location.href);
    const nextMode = this.modeManager.resolve(this.state.settings, this.snapshot, travelHint);
    if (nextMode !== this.mode) { this.mode = nextMode; this.events.emit('mode', nextMode); }
    this.panels.apply({ ...this.state.settings, mode: this.mode }); this.drag.animation(this.state.settings.animation);
    this.panels.mode.title = this.state.settings.autoSwitching ? 'Automatic mode; choosing a preset switches to manual' : 'Manual preset';
    this.panels.status.textContent = this.snapshot?.source === 'mock' ? 'MOCK' : this.snapshot?.provider === 'torn' ? 'TORN API' : this.snapshot?.source === 'live' ? 'LIVE' : 'NO DATA';
    this.manager.reconcile(presetLayout(this.layouts[this.mode], this.mode), this.context());
    this.quickSettings(); this.observer.schedule();
  }
  private quickSettings(): void {
    const signature=JSON.stringify(this.state.settings)+this.mode;
    if(signature===this.quickSignature)return;this.quickSignature=signature;
    const draft=structuredClone(this.state.settings),controls:HTMLElement[]=[];
    for(const [name,label,min,max,step] of [['panelWidth','Width',220,420,10],['opacity','Opacity',0.55,1,0.01],['gap','Gap',4,24,1]] as const){
      const row=el('label','setting-row',label),input=el('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(draft[name]);input.setAttribute('aria-label',label);const output=el('output','',input.value);
      input.addEventListener('input',()=>{draft[name]=Number(input.value);output.value=input.value;});row.append(input,output);controls.push(row);
    }
    for(const [name,label] of [['autoSwitching','Automatic mode switching'],['rememberPositions','Remember positions'],['animation','Animations']] as const){const row=el('label','setting-row'),input=el('input');input.type='checkbox';input.checked=draft[name];input.addEventListener('change',()=>{draft[name]=input.checked;});row.append(input,el('span','',label));controls.push(row);}
    for(const [name,values] of [['density',['compact','comfortable']],['theme',['liquid-glass','torn-dark','slate']]] as const){const row=el('label','setting-row',name),select=el('select');select.setAttribute('aria-label',name);values.forEach(value=>{const option=el('option','',value);option.value=value;select.append(option);});select.value=draft[name];select.addEventListener('change',()=>{if(name==='density')draft.density=select.value as Settings['density'];else draft.theme=select.value as Settings['theme'];});row.append(select);controls.push(row);}
    const widgets=el('details');widgets.append(el('summary','','Widgets in this preset'));let layout=structuredClone(this.layouts[this.mode]);const mode=this.mode;
    const allowed=new Set([...PRESETS[mode].left,...PRESETS[mode].right]);
    for(const definition of createRegistry().all()){
      if(!allowed.has(definition.id))continue;
      const row=el('label','setting-row'),input=el('input');input.type='checkbox';input.checked=!draft.disabledWidgets.includes(definition.id);
      input.addEventListener('change',()=>{draft.disabledWidgets=draft.disabledWidgets.filter(id=>id!==definition.id);if(!input.checked)draft.disabledWidgets.push(definition.id);});row.append(input,el('span','',definition.title));widgets.append(row);
    }
    const message=el('p','muted','Changes apply when you save.');
    controls.push(widgets,button('Reset current preset',()=>{layout=structuredClone(PRESETS[mode]);draft.disabledWidgets=[];message.textContent='Preset reset. Save to apply.';}),button('Save settings',()=>{void(async()=>{try{await this.store.settings({panelWidth:draft.panelWidth,opacity:draft.opacity,gap:draft.gap,density:draft.density,theme:draft.theme,animation:draft.animation,autoSwitching:draft.autoSwitching,rememberPositions:draft.rememberPositions,disabledWidgets:draft.disabledWidgets});await this.store.layout(mode,presetLayout(layout,mode));this.quickSignature='';await this.reload();this.panels.settings.append(el('p','save-confirmation','Settings saved'));}catch(error){this.error(error);}})();}),message);
    this.panels.settings.replaceChildren(...controls);
  }
  private async changeSettings(patch: Partial<Settings>): Promise<void> {
    try { await this.store.settings(patch); this.quickSignature = ''; await this.reload(); } catch (error) { this.error(error); }
  }
  private persistLayout(visible: Layout): void {
    const mode = this.mode;
    // Hidden widgets keep their prior side and are appended without discarding their records.
    const full = presetLayout(reconcileLayout(visible, this.layouts[mode]), mode); this.layouts[mode] = full; this.quickSignature = ''; this.render(); this.events.emit('layout', undefined);
    if (!this.state.settings.rememberPositions) return;
    this.saveQueue = this.saveQueue.then(() => this.store.layout(mode, full)).catch(error => this.error(error));
  }
  private move(id: WidgetId, direction: 'up' | 'down' | 'across'): void {
    const layout = this.layouts[this.mode]; const side = layout.left.includes(id) ? 'left' : 'right'; const index = layout[side].indexOf(id);
    const destination = direction === 'across' ? (side === 'left' ? 'right' : 'left') : side;
    this.persistLayout(moveWidget(layout, id, destination, direction === 'across' ? layout[destination].length : index + (direction === 'up' ? -1 : 1)));
  }
  private async refresh(): Promise<void> {
    if (this.pending || this.destroyed) return; this.pending = true; const generation = this.refreshGeneration;
    try {
      const snapshot = await this.store.snapshot(); if (this.destroyed || generation !== this.refreshGeneration) return;
      this.snapshot = snapshot; this.panels.error.hidden = true; this.render();
      const relevant = this.mode === 'WAR' ? ['war','warFallback','chain','targets','profile','connection'] : this.mode === 'TRAVEL' ? ['travel','stocks','prices','profile','connection'] : this.mode === 'CUSTOM' ? Object.keys(snapshot.issues || {}) : ['war','warFallback','travel','chain','company','profile','connection',...(this.state.favorites.length ? ['stocks','prices'] : [])];
      const issues = Object.entries(snapshot.issues || {}).filter(([section]) => relevant.includes(section) && (section !== 'stocks' || this.state.settings.stockProvider !== 'off')).map(([section, message]) => `${section}: ${message}`);
      if (issues.length) this.events.emit('error', 'Some data is unavailable. Options → Data status');
    } catch (error) { if (generation === this.refreshGeneration) { this.render(); this.error(error); } }
    finally { if (generation === this.refreshGeneration) this.pending = false; }
  }
  private error(error: unknown): void { void error; this.events.emit('error', this.snapshot ? 'Showing saved data. Refreshing…' : 'Waiting for travel data…'); }
  destroy(): void {
    this.destroyed = true; clearInterval(this.tick); clearInterval(this.polling); this.unsubscribe(); this.observer.destroy(); this.drag.destroy(); this.manager.destroy(); this.panels.destroy(); this.events.destroy();
  }
}
