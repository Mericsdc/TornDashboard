import { calculateProfit, freshStock, pricingFresh, travelCountry } from '@tcd/shared';
import type { WidgetContext, WidgetDefinition } from '../../core/widget-registry';
import { el, note, stat } from '../../core/dom';
import { money } from '../travel-market';
export const travelProfit: WidgetDefinition = {
  id: 'travel-profit', title: 'Travel Profit Calculator', defaultPosition: 'right', defaultOrder: 58, modes: ['TRAVEL'], settings: { enabled: true, compact: true },
  visible: context => Boolean(context.snapshot?.travel?.active && context.snapshot.travel.observedAt && context.now - context.snapshot.travel.observedAt <= 90000),
  create() {
    let ctx: WidgetContext, body: HTMLElement, signature = '';
    const form = el('div', 'profit-form'), item = el('select'), quantity = el('input'), fee = el('input'), result = el('div');
    item.setAttribute('aria-label', 'Calculator product'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '10000'; quantity.value = '1'; quantity.setAttribute('aria-label', 'Quantity');
    fee.type = 'number'; fee.min = '0'; fee.max = '100'; fee.step = '0.1'; fee.value = '0'; fee.setAttribute('aria-label', 'Selling fee percent');
    for (const [label, input] of [['Product', item], ['Quantity', quantity], ['Selling fee %', fee]] as const) { const row = el('label', 'market-field', label); row.append(input); form.append(row); }
    const calculate = () => {
      const stock = ctx.snapshot?.stocks.find(v => `${v.country}:${v.itemId}` === item.value);
      if (!stock || !pricingFresh(stock, ctx.now)) { result.replaceChildren(note('Fresh Cost and Torn value are unavailable')); return; }
      const value = calculateProfit(stock.cost, stock.tornValue, quantity.valueAsNumber, fee.valueAsNumber);
      if (!value) { result.replaceChildren(note('Enter a quantity from 1 to 10,000 and a fee from 0–100%')); return; }
      result.replaceChildren(stat('Cost / unit', money(stock.cost)), stat('Torn value / unit', money(stock.tornValue)), stat('Purchase cost', money(value.purchase)), stat('Torn value total', money(value.grossValue)), stat('Estimated profit', money(value.profit)), stat('Return on cost', `${value.roi.toFixed(1)}%`), note('Torn value is a market observation. Actual sale price and travel costs may differ.'), note(!freshStock(stock, ctx.now) ? 'Stock observation stale' : quantity.valueAsNumber > stock.stock! ? 'Quantity exceeds observed stock' : `Observed stock: ${stock.stock}`));
    };
    form.addEventListener('input', calculate); form.addEventListener('change', calculate);
    const update = (context: WidgetContext) => {
      ctx = context; const next = JSON.stringify([ctx.snapshot, Math.floor(ctx.now / 10000)]); if (next === signature) return; signature = next;
      const selected = item.value, country = travelCountry(ctx.snapshot);
      const rows = ctx.snapshot?.stocks.filter(v => v.country === country) || [];
      item.replaceChildren(...rows.map(v => { const option = el('option', '', v.name); option.value = `${v.country}:${v.itemId}`; return option; }));
      if (rows.some(v => `${v.country}:${v.itemId}` === selected)) item.value = selected;
      calculate();
    };
    return { mount(node, context) { body = node; body.append(form, result); update(context); }, update(_data, context) { update(context); }, destroy() { body.replaceChildren(); } };
  }
};
