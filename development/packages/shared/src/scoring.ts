import type { ScoreWeights, Target } from './contracts';
import { DEFAULT_WEIGHTS } from './defaults';
export type ScoredTarget = { target: Target; score: number; confidence: number; reasons: string[]; eligible: boolean; classification: 'priority' | 'consider' | 'unavailable' };

/** Ranks observable opportunities. This is not a win probability or battle-stat estimate. */
export function scoreTarget(target: Target, playerLevel: number | null, weights: ScoreWeights = DEFAULT_WEIGHTS, now = Date.now()): ScoredTarget {
  const fresh = now - target.observedAt <= 120000 && target.observedAt <= now + 5000;
  const eligible = target.status === 'Okay' && fresh;
  const reasons: string[] = [];
  const signals: Partial<Record<keyof ScoreWeights, number>> = {};
  if (fresh && target.status !== 'Unknown') { signals.availability = eligible ? 1 : 0; reasons.push(eligible ? 'Available at last observation' : `Unavailable: ${target.status}`); }
  if (!fresh) reasons.push('Status is stale; refresh before attacking');
  if (fresh && target.activity !== 'unknown') {
    signals.activity = target.activity === 'offline' ? 1 : target.activity === 'idle' ? 0.5 : 0.2;
    reasons.push(`Last activity: ${target.activity}`);
  }
  if (target.wins !== null && target.losses !== null && target.wins + target.losses > 0) {
    signals.history = (target.wins + 1) / (target.wins + target.losses + 2);
    reasons.push(`Personal history: ${target.wins} wins / ${target.losses} losses`);
  }
  if (target.level !== null && playerLevel !== null) {
    signals.level = Math.max(0, Math.min(1, 0.5 + (playerLevel - target.level) / 100));
    reasons.push('Level is a weak signal; strength is unknown');
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let coverage = 0; let weighted = 0;
  for (const key of Object.keys(weights) as (keyof ScoreWeights)[]) {
    const signal = signals[key];
    if (signal !== undefined) { coverage += weights[key]; weighted += weights[key] * signal; }
  }
  // Missing evidence contributes neutral value and lowers confidence; never inflates to 100.
  const score = eligible && total > 0 ? Math.round(100 * (weighted + (total - coverage) * 0.5) / total) : 0;
  reasons.push('Battle stats: unknown • Fair fight: unknown');
  return { target, score, confidence: total > 0 ? Math.round(100 * coverage / total) : 0, reasons, eligible,
    classification: !eligible ? 'unavailable' : score >= 75 ? 'priority' : 'consider' };
}
export function rankTargets(targets: Target[], playerLevel: number | null, weights: ScoreWeights, now = Date.now()): ScoredTarget[] {
  return targets.map(t => scoreTarget(t, playerLevel, weights, now)).filter(t => t.eligible).sort((a, b) => b.score - a.score || a.target.id - b.target.id);
}
