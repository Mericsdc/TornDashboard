import type { Panels } from './panels';

const ANCHORS = ['#mainContainer', '#main-content', '.content-wrapper', 'main', '.main-wrap'];
/** Observe the outer document only; shadow widget updates do not trigger self-remount loops. */
export class TornObserver {
  private mutations: MutationObserver;
  private resize: ResizeObserver;
  private frame = 0;
  private watched?: Element;
  private url = location.href;
  private timer: ReturnType<typeof setInterval>;
  private disposed = false;
  constructor(private panels: Panels, private width: () => number, private onNavigation: () => void) {
    this.mutations = new MutationObserver(records => {
      if (records.some(record => record.target !== panels.host && !panels.host.contains(record.target))) this.schedule();
    });
    this.resize = new ResizeObserver(() => this.schedule());
    this.mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    window.addEventListener('resize', this.schedule); window.addEventListener('scroll', this.schedule, { passive: true });
    window.addEventListener('popstate', this.schedule);
    this.timer = setInterval(() => {
      if (this.url !== location.href) { this.url = location.href; this.onNavigation(); this.schedule(); }
      if (!panels.host.isConnected) this.schedule();
    }, 1000);
    this.schedule();
  }
  readonly schedule = (): void => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.place(); });
  };
  private anchor(): HTMLElement | undefined {
    for (const selector of ANCHORS) {
      const candidates = [...document.querySelectorAll<HTMLElement>(selector)];
      const candidate = candidates.find(node => {
        const r = node.getBoundingClientRect(); return r.width >= 400 && r.height > 40 && node !== this.panels.host;
      });
      if (candidate) return candidate;
    }
    return undefined;
  }
  private place(): void {
    const anchor = this.anchor(); const host = this.panels.host; const width = this.width(); const gap = 12;
    if (this.watched !== anchor) { this.resize.disconnect(); if (anchor) this.resize.observe(anchor); this.watched = anchor; }
    const rect = anchor?.getBoundingClientRect();
    const sidebars = [...document.querySelectorAll<HTMLElement>('#sidebar, .sidebar, #sidebarroot')].map(v => v.getBoundingClientRect()).filter(r => r.width > 0);
    const leftEdge = rect ? Math.min(rect.left, ...sidebars.map(r => r.left)) : 0;
    const rightEdge = rect ? Math.max(rect.right, ...sidebars.map(r => r.right)) : innerWidth;
    const fits = rect && leftEdge >= width + gap * 2 && innerWidth - rightEdge >= width + gap * 2;
    const placement = fits ? 'gutters' : 'inline';
    host.dataset.placement = placement;
    if (fits && rect) {
      if (host.parentElement !== document.body) document.body.append(host);
      const header = document.querySelector<HTMLElement>('header, #header');
      const top = Math.max(gap, Math.min(innerHeight / 4, Math.max(rect.top, header?.getBoundingClientRect().bottom ?? gap)));
      host.style.setProperty('--left-x', `${leftEdge - width - gap}px`); host.style.setProperty('--right-x', `${rightEdge + gap}px`);
      host.style.setProperty('--panel-top', `${top}px`);
    } else if (anchor?.parentElement) {
      if (anchor.nextElementSibling !== host) anchor.after(host);
    } else if (host.parentElement !== document.body) document.body.append(host);
  }
  destroy(): void {
    this.disposed = true; this.mutations.disconnect(); this.resize.disconnect(); clearInterval(this.timer); cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.schedule); window.removeEventListener('scroll', this.schedule); window.removeEventListener('popstate', this.schedule);
  }
}
