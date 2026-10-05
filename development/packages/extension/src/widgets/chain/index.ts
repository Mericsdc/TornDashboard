import { widget } from '../base';
import { duration, el, note, stat } from '../../core/dom';
export const chain = widget({ id: 'chain', title: 'Chain', defaultPosition: 'left', defaultOrder: 40, modes: ['NORMAL', 'WAR', 'TRAVEL'] }, context => {
  const chain = context.snapshot?.chain; if (!chain) return [note(context.snapshot?.issues?.chain || 'Chain data unavailable')];
  if (chain.observedAt && context.now - chain.observedAt > 45000) return [note('Chain observation stale · waiting for BOSBOT')];
  const meter = el('progress'); meter.max = chain.goal; meter.value = chain.count; meter.setAttribute('aria-label', 'Chain progress');
  const remaining = chain.expiresAt ? chain.expiresAt - context.now : null;
  const warning = remaining !== null && remaining > 0 && remaining <= 30000 ? el('p', 'chain-warning', '⚠ 30 seconds · keep the chain alive') : note(context.state.settings.alerts.sound ? '30s sound warning enabled' : 'Sound off');
  return [warning, stat('Hits / next bonus', `${chain.count} / ${chain.goal}`), meter, stat('Remaining', duration(chain.expiresAt, context.now))];
});
