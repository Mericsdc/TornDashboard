import type { Mode, Settings, Snapshot } from '@tcd/shared';
export class ModeManager {
  resolve(settings: Settings, snapshot: Snapshot | null, travelHint = false): Mode {
    if (!settings.autoSwitching || !snapshot) return settings.mode;
    if (snapshot.travel?.active && (!snapshot.travel.observedAt || Date.now() - snapshot.travel.observedAt <= 90000)) return 'TRAVEL';
    if (snapshot.war?.active && (!snapshot.war.observedAt || Date.now() - snapshot.war.observedAt <= 120000)) return 'WAR';
    if (snapshot.source === 'mock' && travelHint) return 'TRAVEL';
    return 'NORMAL';
  }
}
