// Authority-misuse monitor tests — the system never blocks, it informs HR.
import { describe, it, expect } from 'vitest';
import { detectSuspiciousActivity, BIG_SHIFT_MIN, EDIT_VOLUME } from './alerts';
import type { EditRecord, GrantRecord } from './alerts';
import type { FteDayResult, CasualDayResult } from './engine';

const day = (empNo: string, d: number, over: Partial<FteDayResult> = {}): FteDayResult => ({
  empNo, day: d, status: 'worked', shiftCode: 'I-1', shiftStart: 0, shiftEnd: 0,
  inT: 0, outT: 0, worked: 480, required: 480, lateIn: 0, earlyOut: 0, shortage: 0,
  otNormal: 0, otHoliday: 0, uncounted: 0, nightAllowanceDay: false, ramadan: false,
  inManual: false, outManual: false, ...over,
});
const fte = (empNo: string, days: FteDayResult[]) => new Map([[empNo, days]]);
const noCasuals = new Map<string, CasualDayResult[]>();

const edit = (over: Partial<EditRecord>): EditRecord => ({
  key: 'E1', day: 5, inT: 300, outT: 900, changeIn: true, changeOut: false,
  origIn: 300, origOut: 900, by: 'mgr@savola.com', ...over,
});

describe('Misuse monitor — informs HR without blocking', () => {
  it('flags a punch moved by ≥ 2h (medium) and ≥ 4h (high)', () => {
    const medium = detectSuspiciousActivity(
      [edit({ inT: 300, origIn: 300 + BIG_SHIFT_MIN })], [], fte('E1', [day('E1', 5)]), noCasuals);
    expect(medium.some(a => a.kind === 'big-shift' && a.severity === 'medium')).toBe(true);
    const high = detectSuspiciousActivity(
      [edit({ inT: 300, origIn: 300 + 300 })], [], fte('E1', [day('E1', 5)]), noCasuals);
    expect(high.some(a => a.kind === 'big-shift' && a.severity === 'high')).toBe(true);
  });

  it('small corrections raise nothing', () => {
    const alerts = detectSuspiciousActivity(
      [edit({ inT: 300, origIn: 310 })], [], fte('E1', [day('E1', 5)]), noCasuals);
    expect(alerts).toHaveLength(0);
  });

  it('flags a day off granted on a day actually worked (instant full-day OT)', () => {
    const grants: GrantRecord[] = [{ key: 'E1', day: 5, by: 'mgr@savola.com' }];
    const results = fte('E1', [day('E1', 5, { status: 'holiday-worked', otHoliday: 480 })]);
    const alerts = detectSuspiciousActivity([], grants, results, noCasuals);
    expect(alerts.some(a => a.kind === 'dayoff-ot' && a.severity === 'high' && a.value === 480)).toBe(true);
  });

  it('flags repeated manual OT for the same actor→employee pair', () => {
    const edits = [
      edit({ day: 5, inT: 250, origIn: 260 }),   // small shifts, but the days carry OT
      edit({ day: 6, inT: 250, origIn: 260 }),
    ];
    const results = fte('E1', [
      day('E1', 5, { otNormal: 120 }),
      day('E1', 6, { otNormal: 90 }),
    ]);
    const alerts = detectSuspiciousActivity(edits, [], results, noCasuals);
    expect(alerts.some(a => a.kind === 'ot-concentration' && a.value === 2)).toBe(true);
  });

  it('edits producing OT for different employees do not raise concentration', () => {
    const edits = [
      edit({ key: 'E1', day: 5, inT: 250, origIn: 260 }),
      edit({ key: 'E2', day: 5, inT: 250, origIn: 260 }),
    ];
    const results = new Map([
      ['E1', [day('E1', 5, { otNormal: 120 })]],
      ['E2', [day('E2', 5, { otNormal: 120 })]],
    ]);
    const alerts = detectSuspiciousActivity(edits, [], results, noCasuals);
    expect(alerts.some(a => a.kind === 'ot-concentration')).toBe(false);
  });

  it('flags unusually many edits by one actor', () => {
    const edits = Array.from({ length: EDIT_VOLUME }, (_, i) =>
      edit({ key: `E${i}`, day: i, inT: 300, origIn: 305 }));
    const results = new Map(edits.map(e => [e.key, [day(e.key, e.day)]]));
    const alerts = detectSuspiciousActivity(edits, [], results, noCasuals);
    expect(alerts.some(a => a.kind === 'edit-volume' && a.value === EDIT_VOLUME)).toBe(true);
  });

  it('high-severity alerts sort first', () => {
    const alerts = detectSuspiciousActivity(
      [
        ...Array.from({ length: EDIT_VOLUME }, (_, i) => edit({ key: `E${i}`, day: i, inT: 300, origIn: 305 })),
        edit({ key: 'EX', day: 9, inT: 300, origIn: 700 }), // high big-shift
      ],
      [], new Map(), noCasuals);
    expect(alerts[0].severity).toBe('high');
  });
});
