// Authority-misuse monitor: scans manual corrections and day-off grants made by
// managers/supervisors and raises non-blocking alerts for HR. The system keeps
// working normally — HR is informed, nothing is prevented.
import type { FteDayResult, CasualDayResult } from './engine';

export interface EditRecord {
  key: string;
  day: number;
  inT: number | null;
  outT: number | null;
  changeIn: boolean;
  changeOut: boolean;
  origIn?: number | null;
  origOut?: number | null;
  by?: string;
}

export interface GrantRecord { key: string; day: number; by?: string }

export type AlertKind = 'big-shift' | 'ot-concentration' | 'edit-volume' | 'dayoff-ot';

export interface HrAlert {
  kind: AlertKind;
  severity: 'high' | 'medium';
  by: string;      // actor (manager / supervisor)
  target: string;  // employee no / iqama
  day?: number;
  value: number;   // minutes for shifts/OT, count for concentration/volume
}

// Tunable thresholds
export const BIG_SHIFT_MIN = 120;   // punch moved ≥ 2h → medium
export const BIG_SHIFT_HIGH = 240;  // punch moved ≥ 4h → high
export const OT_CONCENTRATION = 2;  // ≥ 2 manual-OT events for the same actor→employee pair
export const EDIT_VOLUME = 5;       // ≥ 5 manual edits by one actor in the period

/**
 * Detects suspicious patterns:
 *  - big-shift: a correction moved a punch by ≥ 2h (≥ 4h = high severity)
 *  - dayoff-ot: a day off granted on a day the employee actually worked —
 *    instantly converts the day to uncapped full-day OT
 *  - ot-concentration: the same actor repeatedly produced manual OT for the
 *    same employee (via corrections or day-off grants)
 *  - edit-volume: one actor making unusually many manual edits
 */
export function detectSuspiciousActivity(
  edits: EditRecord[],
  grants: GrantRecord[],
  fteResults: Map<string, FteDayResult[]>,
  casualResults: Map<string, CasualDayResult[]>,
): HrAlert[] {
  const alerts: HrAlert[] = [];
  const otOf = (key: string, day: number): number => {
    const f = fteResults.get(key)?.find(r => r.day === day);
    if (f) return f.otNormal + f.otHoliday;
    return casualResults.get(key)?.find(r => r.day === day)?.otMin ?? 0;
  };
  const otEvents = new Map<string, number>(); // `${by}|${target}` → manual-OT event count
  const bumpOt = (by: string, target: string) => {
    const k = `${by}|${target}`;
    otEvents.set(k, (otEvents.get(k) ?? 0) + 1);
  };

  for (const e of edits) {
    const by = e.by ?? 'unknown';
    const dIn = e.changeIn && e.inT !== null && e.origIn != null ? Math.abs(e.inT - e.origIn) : 0;
    const dOut = e.changeOut && e.outT !== null && e.origOut != null ? Math.abs(e.outT - e.origOut) : 0;
    const delta = Math.max(dIn, dOut);
    if (delta >= BIG_SHIFT_MIN) {
      alerts.push({
        kind: 'big-shift', severity: delta >= BIG_SHIFT_HIGH ? 'high' : 'medium',
        by, target: e.key, day: e.day, value: delta,
      });
    }
    if (otOf(e.key, e.day) > 0) bumpOt(by, e.key); // the corrected day now carries OT
  }

  for (const g of grants) {
    const by = g.by ?? 'unknown';
    const res = fteResults.get(g.key)?.find(r => r.day === g.day);
    if (res?.status === 'holiday-worked') {
      alerts.push({ kind: 'dayoff-ot', severity: 'high', by, target: g.key, day: g.day, value: res.otHoliday });
      bumpOt(by, g.key);
    }
  }

  for (const [k, count] of otEvents) {
    if (count >= OT_CONCENTRATION) {
      const [by, target] = k.split('|');
      alerts.push({ kind: 'ot-concentration', severity: 'high', by, target, value: count });
    }
  }

  const editCounts = new Map<string, number>();
  for (const e of edits) {
    const by = e.by ?? 'unknown';
    editCounts.set(by, (editCounts.get(by) ?? 0) + 1);
  }
  for (const [by, count] of editCounts) {
    if (count >= EDIT_VOLUME) alerts.push({ kind: 'edit-volume', severity: 'medium', by, target: '—', value: count });
  }

  const order = { high: 0, medium: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
