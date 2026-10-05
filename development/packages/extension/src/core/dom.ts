export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node;
}
export function button(label: string, action: () => void): HTMLButtonElement {
  const node = el('button', '', label); node.type = 'button'; node.addEventListener('click', action); return node;
}
export function duration(at: number | null, now: number): string {
  if (at === null) return 'unknown'; const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds / 60 % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function time(at: number): string { return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
export function note(text: string): HTMLElement { return el('p', 'muted', text); }
export function stat(label: string, value: string): HTMLElement {
  const row = el('div', 'stat'); row.append(el('span', 'muted', label), el('strong', '', value)); return row;
}
