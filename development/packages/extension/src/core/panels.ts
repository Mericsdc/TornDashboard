import { MODES, type Settings } from '@tcd/shared';
import { button, el } from './dom';
export class Panels {
  readonly host = el('div');
  readonly root: ShadowRoot;
  readonly dashboard = el('section', 'dashboard');
  readonly left = el('div', 'widget-list');
  readonly right = el('div', 'widget-list');
  readonly mode = el('select');
  readonly status = el('span', 'source-badge', 'Loading');
  readonly error = el('p', 'error');
  readonly arrange = el('button', '', 'Arrange');
  readonly rightHeading = el('div', 'panel-heading');
  readonly settings = el('div', 'quick-settings');
  constructor(css: string, onMode: (mode: string) => void, onOptions: () => void) {
    this.host.id = 'tcd-dashboard'; this.root = this.host.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = css;
    const left = el('aside', 'panel'); left.dataset.side = 'left'; left.setAttribute('aria-label', 'Left companion panel');
    const right = el('aside', 'panel'); right.dataset.side = 'right'; right.setAttribute('aria-label', 'Right companion panel');
    const title = el('div', 'panel-heading'); title.append(el('span', 'brand-mark', 'TD'), el('strong', '', 'TORNDASHBOARD'), this.status);
    const toolbar = el('div', 'toolbar'); this.mode.setAttribute('aria-label', 'Dashboard preset');
    MODES.forEach(value => { const option = el('option', '', value); option.value = value; this.mode.append(option); });
    this.mode.addEventListener('change', () => onMode(this.mode.value));
    const settingsButton = button('⚙', () => { this.settings.hidden = !this.settings.hidden; }); settingsButton.setAttribute('aria-label', 'Panel settings');
    const options = button('Options ↗', onOptions);
    toolbar.append(this.mode, settingsButton, options); this.settings.hidden = true; this.error.hidden = true;
    const heading = this.rightHeading; heading.append(el('strong', '', 'PERSONAL'));
    this.arrange.type='button';this.arrange.setAttribute('aria-label','Arrange widgets');this.arrange.setAttribute('aria-pressed','false');
    this.arrange.addEventListener('click',()=>{const editing=this.dashboard.dataset.editing!=='true';this.dashboard.dataset.editing=String(editing);this.arrange.textContent=editing?'Done':'Arrange';this.arrange.setAttribute('aria-pressed',String(editing));});
    toolbar.append(this.arrange);
    left.append(title, toolbar, this.settings, this.error, this.left); right.append(heading, this.right);
    this.left.dataset.side = 'left'; this.right.dataset.side = 'right'; this.dashboard.append(left, right); this.root.append(style, this.dashboard);
  }
  apply(settings: Settings): void {
    this.host.style.setProperty('--panel-width', `${settings.panelWidth}px`); this.host.style.setProperty('--panel-opacity', String(settings.opacity));
    this.host.style.setProperty('--widget-gap', `${settings.gap}px`); this.dashboard.dataset.theme = settings.theme;
    this.dashboard.dataset.density = settings.density; this.dashboard.dataset.animation = String(settings.animation); this.mode.value = settings.mode; this.rightHeading.textContent = settings.mode === 'WAR' ? 'TARGETS' : settings.mode === 'TRAVEL' ? 'TRAVEL' : settings.mode === 'CUSTOM' ? 'CUSTOM' : 'PERSONAL';
  }
  destroy(): void { this.host.remove(); }
}
