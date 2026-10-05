import { widget } from '../base';
import { duration, el, note } from '../../core/dom';
export const hospitalTimers = widget({ id: 'hospital-timers', title: 'Hospital Timers', defaultPosition: 'left', defaultOrder: 30, modes: ['WAR'] }, context => {
  if (!context.snapshot) return [note('Hospital data unavailable')];
  if (context.snapshot.issues?.targets) return [note(context.snapshot.issues.targets)];
  if (context.snapshot.targets.length && context.snapshot.targets.every(v => context.now - v.observedAt > 120000)) return [note('Hospital observations stale · waiting for BOSBOT')];
  const targets = context.snapshot.targets.filter(v => v.status === 'Hospital' && context.now - v.observedAt <= 120000).sort((a, b) => (a.hospitalUntil ?? Infinity) - (b.hospitalUntil ?? Infinity));
  return targets.length ? targets.map(target => {
    const row = el('div', 'timer-row'); row.append(el('span', '', target.name), el('strong', 'mono accent', target.hospitalUntil !== null && target.hospitalUntil <= context.now ? 'Refresh status' : duration(target.hospitalUntil, context.now))); return row;
  }) : [note('No hospitalized targets in this snapshot')];
});
