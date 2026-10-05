import { bestProduct, freshStock, marketRows, pricingFresh, travelCountry, unitProfit, type Settings } from '@tcd/shared';
import type { WidgetContext, WidgetDefinition } from '../../core/widget-registry';
import { button, el, note, stat, time } from '../../core/dom';
export const money = (value: number | null | undefined): string => value === null || value === undefined ? 'Unknown' : `$${Math.round(value).toLocaleString()}`;
export const travelMarket: WidgetDefinition = {
  id: 'travel-market', title: 'Travel Market', defaultPosition: 'left', defaultOrder: 55, modes: ['TRAVEL'], settings: { enabled: true, compact: true },
  create() {
    let body: HTMLElement, ctx: WidgetContext, signature = '', searchTimer: ReturnType<typeof setTimeout> | undefined;
    const controls = el('form', 'market-filters'), results = el('div', 'market-results');
    const fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
    const select = (name: string, label: string, options: [string, string][]) => {
      const row = el('label', 'market-field', label); const input = el('select'); input.name = name; input.setAttribute('aria-label', label);
      options.forEach(([value, label]) => { const option = el('option', '', label); option.value = value; input.append(option); }); row.append(input); controls.append(row); fields.set(name, input); return input;
    };
    const country = select('country', 'Country', [['auto', 'My destination · auto'], ['all', 'All countries']]);
    select('category', 'Category', [['all', 'All products'], ['flowers', 'Flowers'], ['plushies', 'Plushies'], ['other', 'Other']]);
    select('sort', 'Sort products', [['profit', 'Profit / unit'], ['roi', 'Return on cost'], ['stock', 'Stock'], ['name', 'Name']]);
    const search = el('input'); search.name = 'search'; search.type = 'search'; search.placeholder = 'Search products'; search.maxLength = 80; search.setAttribute('aria-label', 'Search products'); controls.append(search); fields.set('search', search);
    for (const [name, label] of [['inStock', 'In stock only'], ['favoritesOnly', 'Favorites only']] as const) {
      const row = el('label', 'filter-check'), input = el('input'); input.type = 'checkbox'; input.name = name; row.append(input, el('span', '', label)); controls.append(row); fields.set(name, input);
    }
    const save = () => {
      const market = Object.fromEntries([...fields].map(([key, input]) => [key, input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value])) as Settings['market'];
      void ctx.saveSettings({ market });
    };
    controls.addEventListener('submit', event => { event.preventDefault(); save(); });
    controls.addEventListener('change', () => save());
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(save, 250); });
    const update = (context: WidgetContext) => {
      ctx = context;
      const next = JSON.stringify([ctx.snapshot, ctx.state.settings.market, ctx.state.favorites, Math.floor(ctx.now / 10000)]);
      if (next === signature) return; signature = next;
      const countries = [...new Set(ctx.snapshot?.stocks.map(v => v.country))].sort();
      const countrySignature = countries.join('|');
      if (country.dataset.countries !== countrySignature) {
        country.dataset.countries = countrySignature;
        country.querySelectorAll('option[data-country]').forEach(v => v.remove());
        countries.forEach(value => { const option = el('option', '', value); option.value = value; option.dataset.country = 'true'; country.append(option); });
      }
      for (const [name, input] of fields) {
        if (body.getRootNode() instanceof ShadowRoot && (body.getRootNode() as ShadowRoot).activeElement === input) continue;
        const value = ctx.state.settings.market[name as keyof Settings['market']];
        if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value); else input.value = String(value);
      }
      if (!ctx.snapshot) { results.replaceChildren(note('Connect your BOSBOT account in Options')); return; }
      const destination = travelCountry(ctx.snapshot), best = bestProduct(ctx.snapshot, ctx.now), nodes: Node[] = [];
      nodes.push(note(destination ? `Automatically detected: ${destination}` : 'No active flight · choose a country to browse'));
      if (best) { const hero = el('div', 'profit-hero'); hero.append(el('span', 'eyebrow', 'BEST IN-STOCK PROFIT / UNIT'), el('strong', '', best.name), stat('Estimated gross profit', money(unitProfit(best))), note(`${best.country} · stock ${best.stock?.toLocaleString()}`)); nodes.push(hero); }
      else if (destination) nodes.push(note('No fresh, profitable in-stock product confirmed for this destination'));
      const items = marketRows(ctx.snapshot, ctx.state.settings.market, ctx.state.favorites, ctx.now);
      nodes.push(note(`${items.length} products · prices from BOSBOT · profit excludes fees and travel costs`));
      for (const item of items) {
        const selected = ctx.state.favorites.some(v => v.itemId === item.itemId && v.country === item.country), row = el('div', 'market-product');
        const star = button(selected ? '★' : '☆', () => {
          const favorites = ctx.state.favorites.filter(v => !(v.itemId === item.itemId && v.country === item.country));
          if (!selected) favorites.push({ itemId: item.itemId, name: item.name, country: item.country, minimumStock: 1, alert: true });
          void ctx.saveFavorites(favorites);
        }); star.className = 'favorite-star'; star.setAttribute('aria-label', `${selected ? 'Unwatch' : 'Watch'} ${item.name} in ${item.country}`);
        const title = el('div', 'stat'); title.append(el('strong', '', item.name), star);
        const fresh = freshStock(item, ctx.now), priced = pricingFresh(item, ctx.now);
        row.append(title, note(item.country), stat('Stock', fresh ? item.stock!.toLocaleString() : 'Unknown · stale'), stat('Cost', money(item.cost)), stat('Torn value', money(item.tornValue)), stat('Profit / unit', priced ? money(unitProfit(item)) : 'Unknown · price stale'), note(`Stock seen ${item.observedAt ? time(item.observedAt) : 'unknown'} · value seen ${item.priceObservedAt ? time(item.priceObservedAt) : 'unknown'}`)); nodes.push(row);
      }
      if (!items.length) nodes.push(note(ctx.snapshot.issues?.stocks || 'No products match your filters'));
      results.replaceChildren(...nodes);
    };
    return { mount(node, context) { body = node; body.append(controls, results); update(context); }, update(_data, context) { update(context); }, destroy() { clearTimeout(searchTimer); body.replaceChildren(); } };
  }
};
