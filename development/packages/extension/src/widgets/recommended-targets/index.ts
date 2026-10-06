import { rankTargets } from '@tcd/shared';
import { widget } from '../base';
import { el, note } from '../../core/dom';
export const recommendedTargets = widget({ id: 'recommended-targets', title: 'Recommended Targets', defaultPosition: 'left', defaultOrder: 20, modes: ['WAR'] }, context => {
  const snapshot = context.snapshot;
  if (!snapshot) return [note('Target data unavailable')];
  const bosbot = snapshot.provider === 'bosbot';
  const targets = bosbot ? snapshot.targets.filter(target => target.status === 'Okay' && context.now - target.observedAt <= 120000 && target.observedAt <= context.now + 30000 && target.recommendation).map(target => ({
    target, score: target.recommendation!.score, classification: target.recommendation!.label,
    confidence: target.recommendation!.confidence, reasons: target.recommendation!.reasons
  })) : rankTargets(snapshot.targets, snapshot.player.level, context.state.settings.weights, context.now);
  const rows = targets.slice(0, 8).map(scored => {
    const row = el('div', 'target-row');
    const score = el('strong', 'target-score', String(scored.score)); score.title = bosbot ? 'BOSBOT opportunity score' : 'Opportunity score; not win probability';
    const info = el('div', 'target-info');
    info.append(el('strong', '', scored.target.name), el('span', 'muted', `LVL ${scored.target.level ?? 'unknown'} · ${scored.target.activity}`),
      el('span', 'muted', scored.target.battleStats !== null && bosbot ? `Est. stats: ${scored.target.battleStats.toLocaleString()} · ${scored.target.statsSource || 'BOSBOT observation'} · FF: unknown` : 'Stats: unknown · FF: unknown'));
    const action = snapshot.source === 'live' ? el('a', 'attack', 'Attack ↗') : el('button', 'attack', 'Demo');
    if (action instanceof HTMLAnchorElement) {
      action.href = `https://www.torn.com/page.php?sid=attack&user2ID=${scored.target.id}`; action.target = '_blank'; action.rel = 'noopener noreferrer';
    } else { action.disabled = true; action.title = 'Mock players are not real attack targets'; }
    const reasons = el('details', 'reasons'); reasons.append(el('summary', '', `${scored.classification} · evidence ${scored.confidence}${typeof scored.confidence === 'number' ? '%' : ''}`));
    scored.reasons.forEach(reason => reasons.append(note(reason))); row.append(score, info, action, reasons); return row;
  });
  return [note(snapshot.war?.active ? `Opponent: ${snapshot.war.opponent}` : 'No active ranked war'), note(bosbot ? 'Order and reasons from BOSBOT. Missing battle stats remain unknown.' : 'Score ranks observed availability and history. Strength remains unknown.'), ...(rows.length ? rows : [note(snapshot.issues?.targets || 'No fresh, available targets')])];
});
