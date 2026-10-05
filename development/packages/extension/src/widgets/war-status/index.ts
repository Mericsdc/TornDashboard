import { widget } from '../base';
import { duration, el, note, stat } from '../../core/dom';
export const warStatus = widget({ id: 'war-status', title: 'War Status', defaultPosition: 'right', defaultOrder: 10, modes: ['WAR'] }, context => {
  const war = context.snapshot?.war;
  if (!war) return [note(context.snapshot?.issues?.war || 'War data unavailable')];
  if (war.observedAt && context.now - war.observedAt > 120000) return [note('War observation stale · waiting for BOSBOT')];
  if (!war.active) return [note('No active war in this snapshot')];
  const rows = [el('div', 'eyebrow accent', 'RANKED WAR'), el('strong', '', war.opponent), stat('Score / target', `${war.score?.toLocaleString() ?? 'unknown'} / ${war.targetScore?.toLocaleString() ?? 'unknown'}`)];
  if (war.enemyScore !== undefined) rows.push(stat('Opponent score', war.enemyScore?.toLocaleString() ?? 'unknown'));
  const lead = context.snapshot?.provider === 'bosbot' && war.enemyScore !== null && war.enemyScore !== undefined && war.score !== null ? war.score - war.enemyScore : null;
  if (lead !== null) rows.push(stat('Lead / victory target', `${lead.toLocaleString()} / ${war.targetScore?.toLocaleString() ?? 'unknown'}`));
  if (war.score !== null && war.targetScore !== null && war.targetScore > 0) {
    const meter = el('progress'); meter.max = war.targetScore; meter.value = lead !== null ? Math.max(0, lead) : war.score; meter.setAttribute('aria-label', 'War score'); rows.push(meter);
  }
  rows.push(stat('Ends in', duration(war.endsAt, context.now))); return rows;
});
