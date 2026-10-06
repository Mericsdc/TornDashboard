import { widget } from '../base';
import { duration, el, note, stat } from '../../core/dom';
import { currentChain } from '@tcd/shared';
export const chain = widget({ id: 'chain', title: 'Chain', defaultPosition: 'left', defaultOrder: 40, modes: ['NORMAL', 'WAR'] }, context => {
  const chain = currentChain(context.snapshot?.chain ?? null, context.now); if (!chain) return [note('Waiting for chain data…')];
  if (!chain.count) return [el('strong', 'chain-state', chain.status === 'ended' ? 'Chain ended' : chain.status === 'cooldown' ? 'Chain cooldown' : 'No active chain'), stat('Hits / next bonus','0 / 10'), ...(chain.lastCount ? [note(`Last chain · ${chain.lastCount} hits`)] : [])];
  if (chain.observedAt && context.now - chain.observedAt > 45000) return [note('Chain observation stale · waiting for Torn API')];
  const meter = el('progress'); meter.max = chain.goal; meter.value = chain.count; meter.setAttribute('aria-label', 'Chain progress');
  const remaining = chain.expiresAt ? chain.expiresAt - context.now : null;
  const warning = remaining !== null && remaining > 0 && remaining <= 30000 ? el('p', 'chain-warning', '⚠ 30 seconds · keep the chain alive') : note(context.state.settings.alerts.sound ? '30s sound warning enabled' : 'Sound off');
  return [warning, stat('Hits / next bonus', `${chain.count} / ${chain.goal}`), meter, stat('Remaining', duration(chain.expiresAt, context.now)),note(chain.source==='page'?'Synced with Torn':'Torn API · local countdown')];
});
