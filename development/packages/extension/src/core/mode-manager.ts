import type { Mode, Settings, Snapshot } from '@tcd/shared';
export class ModeManager {
  resolve(settings: Settings, snapshot: Snapshot | null, travelHint = false): Mode {
    if (settings.mode === 'CUSTOM' || !settings.autoSwitching || !snapshot) return settings.mode;
    if (snapshot.travelApp?.previewCountry && travelHint) return 'TRAVEL';
    const homeConfirmed = snapshot.travelApp?.travel.homeConfirmedAt;
    const safelyHome = homeConfirmed && Date.now() - homeConfirmed >= 15000;
    if (!safelyHome && (snapshot.travelApp?.travelSession || (snapshot.travelApp && snapshot.travelApp.travel.state !== 'AT_HOME'))) return 'TRAVEL';
    if (!safelyHome && snapshot.travel?.active && (!snapshot.travel.observedAt || Date.now() - snapshot.travel.observedAt <= 90000)) return 'TRAVEL';
    if (snapshot.war?.active && (!snapshot.war.observedAt || Date.now() - snapshot.war.observedAt <= 120000)) return 'WAR';
    if (snapshot.source === 'mock' && travelHint) return 'TRAVEL';
    return 'NORMAL';
  }
}
