// Every worked example in the PRD (BR-04, BR-06, FR-10, FR-14, FR-15, FR-16,
// FR-18, FR-30, FR-31) is encoded here as a test case, per §11.1 of the PRD.
import { describe, it, expect } from 'vitest';
import {
  assignFieldShift, assignCasualShift, assignOfficeBand, computeMetrics,
  sessionize, computeFte, computeCasual, violationDeduction, requiredCompletion,
  validateFteAccess, validateCasualAccess, computeCanteen, summarizeCasual,
} from './engine';
import { instance, defaultConfig, resolveEditTime, MIN_PER_DAY } from './model';
import type { Employee, Casual, Punch, Config } from './model';

const D = 7; // an arbitrary non-holiday weekday (2026-06-08, Monday)
const t = (day: number, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return day * MIN_PER_DAY + h * 60 + m;
};
const cfg: Config = { ...defaultConfig(), holidays: [{ day: 3, name: 'Eid', nameAr: 'عيد' }] };

describe('FR-10 / BR-04 — open-shift assignment by longest worked duration', () => {
  it('worked 10:56–19:30 → I-1 overlap 4h04m vs I-2 4h30m → assigns I-2', () => {
    const s = assignFieldShift(t(D, '10:56'), t(D, '19:30'), false);
    expect(s.def.code).toBe('I-2');
  });
  it('worked 10:56–19:00 → I-1 overlap 4h04m vs I-2 4h00m → assigns I-1', () => {
    const s = assignFieldShift(t(D, '10:56'), t(D, '19:00'), false);
    expect(s.def.code).toBe('I-1');
  });
  it('tie-break: equal overlap assigns the earlier shift', () => {
    // worked 11:00–19:00 → I-1 overlap 4h, I-2 overlap 4h → I-1
    const s = assignFieldShift(t(D, '11:00'), t(D, '19:00'), false);
    expect(s.def.code).toBe('I-1');
  });
  it('BR-03: overnight I-3 punches spanning midnight attribute to the start day', () => {
    const s = assignFieldShift(t(D, '22:55'), t(D + 1, '07:10'), false);
    expect(s.def.code).toBe('I-3');
    expect(s.day).toBe(D);
  });
  it('late overnight IN (00:10) still attributes to the previous day I-3', () => {
    const s = assignFieldShift(t(D + 1, '00:10'), t(D + 1, '07:05'), false);
    expect(s.def.code).toBe('I-3');
    expect(s.day).toBe(D);
  });
});

describe('FR-10 / BR-04 — longest-overlap assignment beats nearest-start (validation suite)', () => {
  const fieldEmp: Employee = {
    no: 'E10', name: 'V', nameAr: 'ف', email: 'v@x', gender: 'M', company: 'AIC',
    dept: 'Refinery', costCenter: 'CC1', location: 'AIC Factory', segment: 'shift',
    position: 'Operator', grade: 'G5', religion: 'muslim', managerNo: null,
    managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
  };
  it('12:00–20:00: nearest start to IN is I-1 (07:00), but overlap I-2 5h > I-1 3h → I-2', () => {
    const s = assignFieldShift(t(D, '12:00'), t(D, '20:00'), false);
    expect(s.def.code).toBe('I-2');
  });
  it('same punches end-to-end through computeFte assign I-2 too', () => {
    const punches: Punch[] = [
      { key: 'E10', t: t(D, '12:00'), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
      { key: 'E10', t: t(D, '20:00'), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
    ];
    expect(computeFte(fieldEmp, punches, [], cfg)[D].shiftCode).toBe('I-2');
  });
  it('05:30–13:30: overlap I-1 6.5h vs overnight I-3 1.5h → I-1', () => {
    const s = assignFieldShift(t(D, '05:30'), t(D, '13:30'), false);
    expect(s.def.code).toBe('I-1');
  });
  it('20:00–04:30: overlap I-3 5.5h > I-2 3h → I-3, attributed to the start day', () => {
    const s = assignFieldShift(t(D, '20:00'), t(D + 1, '04:30'), false);
    expect(s.def.code).toBe('I-3');
    expect(s.day).toBe(D);
  });
  it('18:00–02:00: overlap I-2 5h > I-3 3h → I-2 (even though IN is closer to I-3 duty)', () => {
    const s = assignFieldShift(t(D, '18:00'), t(D + 1, '02:00'), false);
    expect(s.def.code).toBe('I-2');
  });
  it('Ramadan Muslim 12:30–19:10: overlap IR-2 5.5h → IR-2', () => {
    const s = assignFieldShift(t(D, '12:30'), t(D, '19:10'), true);
    expect(s.def.code).toBe('IR-2');
  });
  it('spans two full shifts 07:00–23:00: equal 8h overlap → earlier shift I-1 (documented tie-break)', () => {
    const s = assignFieldShift(t(D, '07:00'), t(D, '23:00'), false);
    expect(s.def.code).toBe('I-1');
  });
});

describe('Manager day-off grants — full-day OT, exempt from the daily cap (like public holidays)', () => {
  const emp: Employee = {
    no: 'E11', name: 'D', nameAr: 'د', email: 'd@x', gender: 'M', company: 'AIC',
    dept: 'Canning', costCenter: 'CC3', location: 'AIC Factory', segment: 'shift',
    position: 'Operator', grade: 'G5', religion: 'muslim', managerNo: null,
    managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
  };
  const pair = (inHm: string, outHm: string): Punch[] => [
    { key: 'E11', t: t(D, inHm), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
    { key: 'E11', t: t(D, outHm), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
  ];
  it('worked 12h on a granted day off → 12h OT (above the 4h daily cap, uncapped)', () => {
    const d = computeFte(emp, pair('07:00', '19:00'), [], cfg, [D])[D];
    expect(d.status).toBe('holiday-worked');
    expect(d.otHoliday).toBe(720);        // full 12h flagged as OT
    expect(d.otNormal).toBe(0);
    expect(d.uncounted).toBe(0);          // exception to FR-16 cap
  });
  it('granted day off not worked → day-off status, no absence', () => {
    const d = computeFte(emp, [], [], cfg, [D])[D];
    expect(d.status).toBe('day-off');
  });
  it('public holiday work also stays uncapped (12h → 12h OT-Holiday)', () => {
    const holidayCfg: Config = { ...cfg, holidays: [{ day: D, name: 'H', nameAr: 'ع' }] };
    const d = computeFte(emp, pair('07:00', '19:00'), [], holidayCfg)[D];
    expect(d.status).toBe('holiday-worked');
    expect(d.otHoliday).toBe(720);
  });
  it('ordinary day OT still respects the 4h cap', () => {
    const d = computeFte(emp, pair('07:00', '21:00'), [], cfg)[D]; // 14h: 8h shift + 6h extra
    expect(d.otNormal).toBe(240);         // capped at 4h
    expect(d.uncounted).toBe(120);        // 2h visible uncounted (FR-16)
  });
});

describe('FR-11 / BR-05 — casual assignment by nearest IN', () => {
  it('IN 06:40 → C-1', () => {
    expect(assignCasualShift(t(D, '06:40'), false).def.code).toBe('C-1');
  });
  it('IN 18:50 → C-2 (attendance day = start day, BR-03)', () => {
    const s = assignCasualShift(t(D, '18:50'), false);
    expect(s.def.code).toBe('C-2');
    expect(s.day).toBe(D);
  });
  it('Ramadan variants CR-1/CR-2 apply automatically', () => {
    expect(assignCasualShift(t(D, '05:05'), true).def.code).toBe('CR-1');
  });
});

describe('FR-07 — office flexible band resolved from actual IN', () => {
  it('IN 08:05 → 08:00–17:00 band', () => {
    expect(assignOfficeBand(t(D, '08:05'), false, 'muslim').def.code).toBe('OFF-A');
  });
  it('IN 08:55 → 09:00–18:00 band', () => {
    expect(assignOfficeBand(t(D, '08:55'), false, 'muslim').def.code).toBe('OFF-B');
  });
});

describe('FR-07 — office band follows the actual worked window when OUT is known', () => {
  it('IN 08:20 with a late OUT 18:10 → flips to OFF-B (overlap 9h beats 8h40m)', () => {
    expect(assignOfficeBand(t(D, '08:20'), false, 'muslim', undefined, t(D, '18:10')).def.code).toBe('OFF-B');
  });
  it('IN 08:05 with a normal OUT 17:05 → stays OFF-A', () => {
    expect(assignOfficeBand(t(D, '08:05'), false, 'muslim', undefined, t(D, '17:05')).def.code).toBe('OFF-A');
  });
  it('covers both bands fully (07:52–18:05) → OUT nearest to 18:00 resolves the tie to OFF-B', () => {
    expect(assignOfficeBand(t(D, '07:52'), false, 'muslim', undefined, t(D, '18:05')).def.code).toBe('OFF-B');
  });
  it('covers both bands but leaves at 17:05 (07:50–17:05)… OFF-A (no tie: A overlap 9h > B 8h05m)', () => {
    expect(assignOfficeBand(t(D, '07:50'), false, 'muslim', undefined, t(D, '17:05')).def.code).toBe('OFF-A');
  });
  it('end-to-end: office employee edited to a late OUT recomputes into OFF-B', () => {
    const emp: Employee = {
      no: 'E12', name: 'O', nameAr: 'م', email: 'o@x', gender: 'F', company: 'AIC',
      dept: 'HR', costCenter: 'CC4', location: 'AIC Factory', segment: 'office',
      position: 'Specialist', grade: 'G7', religion: 'muslim', managerNo: null,
      managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
    };
    const punches: Punch[] = [
      { key: 'E12', t: t(D, '08:10'), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
      { key: 'E12', t: t(D, '18:05'), dir: 'out', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' },
    ];
    const d = computeFte(emp, punches, [], cfg)[D];
    expect(d.shiftCode).toBe('OFF-B');
    expect(d.shortage).toBe(0); // full 09:00–18:00 window covered
  });
});

describe('FR-34 — admin-managed shift catalogue (add/edit/delete)', () => {
  it('an added field shift becomes an assignment candidate', () => {
    const shifts = {
      ...defaultConfig().shifts,
      'I-4': { code: 'I-4', nameEn: 'Field 11:00–19:00', kind: 'field' as const, start: 660, durMin: 480, required: 480 },
    };
    // worked 10:56–19:00 assigned I-1 under the default catalogue; I-4 overlaps fully
    const s = assignFieldShift(t(D, '10:56'), t(D, '19:00'), false, shifts);
    expect(s.def.code).toBe('I-4');
  });
  it('editing a shift start moves the office band cutoff', () => {
    const shifts = structuredClone(defaultConfig().shifts);
    shifts['OFF-A'].start = 420; // 07:00 — midpoint with OFF-B (09:00) becomes 08:00
    expect(assignOfficeBand(t(D, '08:05'), false, 'muslim', shifts).def.code).toBe('OFF-B');
  });
  it('a deleted casual shift is no longer assigned', () => {
    const shifts = { ...defaultConfig().shifts };
    delete shifts['C-2'];
    expect(assignCasualShift(t(D, '18:50'), false, shifts).def.code).toBe('C-1');
  });
  it('emptying a Ramadan category falls back to the standard shifts of that kind', () => {
    const shifts = { ...defaultConfig().shifts };
    delete shifts['CR-1']; delete shifts['CR-2'];
    expect(assignCasualShift(t(D, '05:05'), true, shifts).def.code).toBe('C-1');
  });
});

describe('FR-14 — OT eligibility only after completing full shift hours', () => {
  const I1 = instance('I-1', D);
  it('shift 07:00–15:00, worked 07:30–15:45 (8h15m) → OT = 0', () => {
    const m = computeMetrics(t(D, '07:30'), t(D, '15:45'), I1, null, cfg, true);
    expect(m.otNormal).toBe(0);
  });
  it('shift 07:00–15:00, worked 07:30–16:15 (8h45m) → OT = 30 minutes', () => {
    const m = computeMetrics(t(D, '07:30'), t(D, '16:15'), I1, null, cfg, true);
    expect(m.otNormal).toBe(30);
  });
  it('partial attendance never generates OT', () => {
    const m = computeMetrics(t(D, '08:00'), t(D, '15:30'), I1, null, cfg, true);
    expect(m.otNormal).toBe(0);
  });
});

describe('FR-15 / BR-06 — OT split before/after with separate 30-min round-down', () => {
  const I1 = instance('I-1', D);
  it('25m before + 1h00m after → total OT 1h00m', () => {
    const m = computeMetrics(t(D, '06:35'), t(D, '16:00'), I1, null, cfg, true);
    expect(m.otBefore).toBe(0);
    expect(m.otAfter).toBe(60);
    expect(m.otNormal).toBe(60);
  });
  it('25m before + 1h35m after → total OT 1h30m', () => {
    const m = computeMetrics(t(D, '06:35'), t(D, '16:35'), I1, null, cfg, true);
    expect(m.otNormal).toBe(90);
  });
  it('1h25m before + 1h38m after → total OT 2h30m (1h + 1h30m)', () => {
    const m = computeMetrics(t(D, '05:35'), t(D, '16:38'), I1, null, cfg, true);
    expect(m.otBefore).toBe(60);
    expect(m.otAfter).toBe(90);
    expect(m.otNormal).toBe(150);
  });
});

describe('FR-16 — daily OT cap of 4 hours with visible uncounted excess', () => {
  it('3h before + 2h after → capped at 4h, 1h uncounted', () => {
    const I1 = instance('I-1', D);
    const m = computeMetrics(t(D, '04:00'), t(D, '17:00'), I1, null, cfg, true);
    expect(m.otBefore + m.otAfter).toBe(300);
    expect(m.otNormal).toBe(240);
    expect(m.uncounted).toBe(60);
  });
});

describe('BR-11 — 30-minute grace period', () => {
  const I1 = instance('I-1', D);
  it('arrival at 07:25 (within grace) → no late-in flag', () => {
    const m = computeMetrics(t(D, '07:25'), t(D, '15:00'), I1, null, cfg, true);
    expect(m.lateIn).toBe(0);
  });
  it('arrival at 07:40 (beyond grace) → flagged late-in', () => {
    const m = computeMetrics(t(D, '07:40'), t(D, '15:00'), I1, null, cfg, true);
    expect(m.lateIn).toBe(40);
  });
});

describe('BR-02 — punch pairing: earliest IN / latest OUT across sources', () => {
  it('gate punch + face punch merge; lunch out/in absorbed', () => {
    const p = (hm: string, dir: 'in' | 'out', deviceType: 'face' | 'gate' = 'face'): Punch =>
      ({ key: 'E1', t: t(D, hm), dir, deviceId: 'x', deviceType, modality: 'face' });
    const sessions = sessionize([
      p('06:58', 'in', 'gate'), p('07:02', 'in'), p('12:00', 'out'),
      p('12:40', 'in'), p('15:05', 'out'), p('15:07', 'out', 'gate'),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].inT).toBe(t(D, '06:58'));
    expect(sessions[0].outT).toBe(t(D, '15:07'));
  });
});

describe('FR-18 / BR-07 / BR-08 — Ramadan pay-hour differentiation', () => {
  const ramCfg: Config = { ...cfg, ramadan: { fromDay: 5, toDay: 25 } };
  const emp = (religion: 'muslim' | 'non-muslim'): Employee => ({
    no: 'E9', name: 'Test', nameAr: 'اختبار', email: 'e@x', gender: 'M', company: 'AIC',
    dept: 'Refinery', costCenter: 'CC1', location: 'AIC Factory', segment: 'shift',
    position: 'Operator', grade: 'G5', religion, managerNo: null, managerName: null,
    hireDay: -100, termDay: null, canteenClass: 'regular',
  });
  const punchPair = (inHm: string, outHm: string, key = 'E9'): Punch[] => [
    { key, t: t(D, inHm), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
    { key, t: t(D, outHm), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
  ];
  it('Muslim field FTE in Ramadan: 6h normal, extra flagged as OT', () => {
    // IR-1 05:00–11:00; worked 05:00–12:30 → 7h30m: required 6h met, after-OT 1h30m
    const days = computeFte(emp('muslim'), punchPair('05:00', '12:30'), [], ramCfg);
    const d = days[D];
    expect(d.shiftCode).toBe('IR-1');
    expect(d.otNormal).toBe(90);
  });
  it('non-Muslim field FTE in Ramadan: stays on I-shifts, first 8 hours normal', () => {
    const days = computeFte(emp('non-muslim'), punchPair('07:00', '15:00'), [], ramCfg);
    const d = days[D];
    expect(d.shiftCode).toBe('I-1');
    expect(d.otNormal).toBe(0);
    expect(d.shortage).toBe(0); // full 8h day is normal, no Ramadan reduction
  });
  it('Casual Muslim in Ramadan: first 10h normal, next 2h OT ×1.5', () => {
    const cas: Casual = {
      iqama: '2400000001', name: 'C', nameAr: 'ع', supplier: 'S1', supervisor: 'Sup',
      religion: 'muslim', costCenter: 'CC1', dept: 'Canning', jobTitle: 'Loader',
      monthlySalary: 3000, healthCardExpiryDay: 999, ajeerExpiryDay: 999, active: true,
      dayOffWeekday: 1,
    };
    // CR-1 05:00–17:00; worked full 12h window
    const days = computeCasual(cas, punchPair('05:00', '17:00', cas.iqama), ramCfg);
    const d = days[D];
    expect(d.shiftCode).toBe('CR-1');
    expect(d.otMin).toBe(120);
    // pay = 10h normal + 2h ×1.5 at hourly (3000/30/12 = 8.333)
    expect(d.dailyPay).toBeCloseTo(10 * 8.3333 + 2 * 8.3333 * 1.5, 1);
  });
});

describe('non-Muslim FTE Ramadan OT still requires completion (regression)', () => {
  it('worked exactly 8h30 on I-1 → after-OT 30m', () => {
    const I1 = instance('I-1', D);
    const m = computeMetrics(t(D, '07:00'), t(D, '15:30'), I1, null, cfg, true);
    expect(m.otNormal).toBe(30);
  });
});

describe('FR-30 / BR-13 — casual violation deductions', () => {
  it('deduction = monthly salary ÷ actual days of month (June = 30)', () => {
    expect(violationDeduction(3000, 1)).toBe(100);
    expect(violationDeduction(3000, 3)).toBe(300);
  });
});

describe('FR-31 / BR-13 — casual salary: 30-day base, paid day-off, holiday ×1.5', () => {
  const cas: Casual = {
    iqama: '2400000002', name: 'C2', nameAr: 'ع', supplier: 'S1', supervisor: 'Sup',
    religion: 'non-muslim', costCenter: 'CC1', dept: 'Canning', jobTitle: 'Loader',
    monthlySalary: 3000, healthCardExpiryDay: 999, ajeerExpiryDay: 999, active: true,
    dayOffWeekday: 5, // Friday
  };
  it('daily rate = monthly ÷ 30; worked normal day pays full daily rate', () => {
    const punches: Punch[] = [
      { key: cas.iqama, t: t(D, '07:00'), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
      { key: cas.iqama, t: t(D, '19:00'), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
    ];
    const days = computeCasual(cas, punches, cfg);
    expect(days[D].dailyPay).toBe(100);
  });
  it('assigned day-off is paid as a full working day', () => {
    const days = computeCasual(cas, [], cfg);
    const friday = days.find(d => d.status === 'day-off');
    expect(friday?.dailyPay).toBe(100);
  });
  it('work on Eid → OT ×1.5 → 150 SAR for the day', () => {
    const eid = 3;
    const punches: Punch[] = [
      { key: cas.iqama, t: t(eid, '07:00'), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
      { key: cas.iqama, t: t(eid, '19:00'), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
    ];
    const days = computeCasual(cas, punches, cfg);
    expect(days[eid].dailyPay).toBe(150);
    expect(days[eid].holidayWork).toBe(true);
  });
  it('total salary = attendance pay + incentive − deductions', () => {
    const days = computeCasual(cas, [], cfg);
    const sum = summarizeCasual(cas, days, 200, 2);
    expect(sum.deduction).toBe(200);
    expect(sum.totalSalary).toBe(sum.attendancePay + 200 - 200);
  });
});

describe('Required-hours completion (worked vs required; OT days exceed 100%)', () => {
  const emp: Employee = {
    no: 'E8', name: 'C', nameAr: 'ك', email: 'c@x', gender: 'M', company: 'AIC',
    dept: 'Canning', costCenter: 'CC3', location: 'AIC Factory', segment: 'shift',
    position: 'Operator', grade: 'G5', religion: 'muslim', managerNo: null,
    managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
  };
  const pair = (inHm: string, outHm: string): Punch[] => [
    { key: 'E8', t: t(D, inHm), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
    { key: 'E8', t: t(D, outHm), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
  ];
  it('exact full shift → exactly 100%', () => {
    const d = computeFte(emp, pair('07:00', '15:00'), [], cfg)[D];
    expect(d.required).toBe(480);
    expect(requiredCompletion(d)).toBe(1);
  });
  it('shift + 2h OT → above 100% (125%)', () => {
    const d = computeFte(emp, pair('07:00', '17:00'), [], cfg)[D];
    expect(d.otNormal).toBe(120);
    expect(requiredCompletion(d)).toBeCloseTo(1.25);
  });
  it('early-out shortage → below 100% (75%)', () => {
    const d = computeFte(emp, pair('07:00', '13:00'), [], cfg)[D];
    expect(d.shortage).toBe(120);
    expect(requiredCompletion(d)).toBeCloseTo(0.75);
  });
  it('missing OUT → not computable (null)', () => {
    const d = computeFte(emp, [pair('07:00', '15:00')[0]], [], cfg)[D];
    expect(d.status).toBe('missing-out');
    expect(requiredCompletion(d)).toBeNull();
  });
  it('rest-day work → nothing required, not computable (all hours OT-Holiday)', () => {
    const friday = 4; // 2026-06-05
    const punches: Punch[] = [
      { key: 'E8', t: t(friday, '07:00'), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
      { key: 'E8', t: t(friday, '15:00'), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
    ];
    const d = computeFte(emp, punches, [], cfg)[friday];
    expect(d.status).toBe('holiday-worked');
    expect(requiredCompletion(d)).toBeNull();
  });
});

describe('FR-33 — punch-correction time resolution (typos can never delete a punch)', () => {
  it('malformed input keeps the original punch', () => {
    expect(resolveEditTime('16.30', D, t(D, '15:00'))).toBe(t(D, '15:00'));
    expect(resolveEditTime('930', D, t(D, '15:00'))).toBe(t(D, '15:00'));
    expect(resolveEditTime('', D, t(D, '15:00'))).toBe(t(D, '15:00'));
  });
  it('empty input on a missing punch stays missing (no phantom punch)', () => {
    expect(resolveEditTime('', D, null)).toBeNull();
  });
  it('valid time on the row day resolves normally', () => {
    expect(resolveEditTime('16:30', D, t(D, '15:00'))).toBe(t(D, '16:30'));
    expect(resolveEditTime('07:00', D, null)).toBe(t(D, '07:00'));
  });
  it('overnight OUT (orig next morning) edits stay on the next day', () => {
    expect(resolveEditTime('06:30', D, t(D + 1, '07:05'))).toBe(t(D + 1, '06:30'));
    expect(resolveEditTime('07:05', D, t(D + 1, '07:05'))).toBe(t(D + 1, '07:05')); // untouched value round-trips
  });
  it('night-shift IN corrected past midnight lands on the next day, nearest the original', () => {
    expect(resolveEditTime('00:30', D, t(D, '22:55'))).toBe(t(D + 1, '00:30'));
  });
});

describe('FR-19 / BR-12 — night-shift allowance identification', () => {
  it('completed I-3 night shift counts as an allowance day', () => {
    const emp: Employee = {
      no: 'E7', name: 'N', nameAr: 'ن', email: 'n@x', gender: 'M', company: 'AIC',
      dept: 'Utility', costCenter: 'CC2', location: 'AIC Factory', segment: 'shift',
      position: 'Operator', grade: 'G5', religion: 'muslim', managerNo: null,
      managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
    };
    const punches: Punch[] = [
      { key: 'E7', t: t(D, '22:55'), dir: 'in', deviceId: 'd', deviceType: 'face', modality: 'face' },
      { key: 'E7', t: t(D + 1, '07:05'), dir: 'out', deviceId: 'd', deviceType: 'face', modality: 'face' },
    ];
    const days = computeFte(emp, punches, [], cfg);
    expect(days[D].shiftCode).toBe('I-3');
    expect(days[D].nightAllowanceDay).toBe(true);
  });
});

describe('FR-22 / BR-16 — joiner/leaver lifecycle', () => {
  const emp: Employee = {
    no: 'E5', name: 'L', nameAr: 'ل', email: 'l@x', gender: 'M', company: 'AIC',
    dept: 'Refinery', costCenter: 'CC1', location: 'AIC Factory', segment: 'shift',
    position: 'Operator', grade: 'G5', religion: 'muslim', managerNo: null,
    managerName: null, hireDay: 0, termDay: 14, canteenClass: 'regular',
  };
  it('punches after termination day are rejected; history retained', () => {
    const punches: Punch[] = [10, 20].map(day => [
      { key: 'E5', t: t(day, '07:00'), dir: 'in' as const, deviceId: 'd', deviceType: 'face' as const, modality: 'face' as const },
      { key: 'E5', t: t(day, '15:00'), dir: 'out' as const, deviceId: 'd', deviceType: 'face' as const, modality: 'face' as const },
    ]).flat();
    const days = computeFte(emp, punches, [], cfg);
    expect(days[10].status).toBe('worked');       // history retained
    expect(days[20].status).toBe('not-employed'); // rejected after termination
  });
  it('access turns RED after termination date', () => {
    expect(validateFteAccess(emp, 14).green).toBe(true);
    expect(validateFteAccess(emp, 15).green).toBe(false);
  });
});

describe('FR-27 / BR-15 — casual gate validation', () => {
  const base: Casual = {
    iqama: '2400000003', name: 'C3', nameAr: 'ع', supplier: 'S2', supervisor: 'Sup',
    religion: 'muslim', costCenter: 'CC1', dept: 'Warehouse', jobTitle: 'Picker',
    monthlySalary: 2800, healthCardExpiryDay: 100, ajeerExpiryDay: 100, active: true,
    dayOffWeekday: 5,
  };
  it('GREEN only when active AND Health Card AND Ajeer valid', () => {
    expect(validateCasualAccess(base, 50).green).toBe(true);
  });
  it('expired Health Card → RED with the failed condition logged', () => {
    const r = validateCasualAccess({ ...base, healthCardExpiryDay: 40 }, 50);
    expect(r.green).toBe(false);
    expect(r.reasons).toContain('health-card-expired');
  });
  it('expired Ajeer → RED', () => {
    expect(validateCasualAccess({ ...base, ajeerExpiryDay: 10 }, 50).green).toBe(false);
  });
  it('inactive → RED', () => {
    expect(validateCasualAccess({ ...base, active: false }, 50).green).toBe(false);
  });
});

describe('FR-41 — canteen charges', () => {
  it('device 1 charges 5 SAR once per punch-day; device 2 charges by class', () => {
    const p = (key: string, day: number, hm: string, deviceType: 'canteen1' | 'canteen2'): Punch =>
      ({ key, t: t(day, hm), dir: 'in', deviceId: deviceType, deviceType, modality: 'face' });
    const charges = computeCanteen([
      p('E1', 2, '12:00', 'canteen1'),
      p('E1', 2, '12:05', 'canteen1'),   // duplicate same day → no extra charge
      p('E1', 3, '12:00', 'canteen1'),
      p('E2', 2, '13:00', 'canteen2'),   // VIP
      p('E3', 2, '13:00', 'canteen2'),   // regular
    ], k => (k === 'E2' ? 'vip' : 'regular'), cfg);
    const total = (k: string) => charges.filter(c => c.key === k).reduce((s, c) => s + c.amount, 0);
    expect(total('E1')).toBe(10);
    expect(total('E2')).toBe(20);
    expect(total('E3')).toBe(15);
  });
});

describe('FR-04/FR-38 — manual corrections flagged as Manual in results', () => {
  const emp: Employee = {
    no: 'E6', name: 'M', nameAr: 'م', email: 'm@x', gender: 'M', company: 'AIC',
    dept: 'Refinery', costCenter: 'CC1', location: 'AIC Factory', segment: 'shift',
    position: 'Operator', grade: 'G5', religion: 'muslim', managerNo: null,
    managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
  };
  it('a manager-entered OUT is marked outManual while the device IN stays unmarked', () => {
    const punches: Punch[] = [
      { key: 'E6', t: t(D, '07:00'), dir: 'in', deviceId: 'TRN-01', deviceType: 'face', modality: 'face' },
      { key: 'E6', t: t(D, '15:05'), dir: 'out', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' },
    ];
    const days = computeFte(emp, punches, [], cfg);
    expect(days[D].status).toBe('worked');
    expect(days[D].inManual).toBe(false);
    expect(days[D].outManual).toBe(true);
  });
  it('a fully manual day marks both IN and OUT', () => {
    const punches: Punch[] = [
      { key: 'E6', t: t(D, '07:00'), dir: 'in', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' },
      { key: 'E6', t: t(D, '15:00'), dir: 'out', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' },
    ];
    const days = computeFte(emp, punches, [], cfg);
    expect(days[D].inManual).toBe(true);
    expect(days[D].outManual).toBe(true);
  });
  it('a later device OUT overriding an earlier manual OUT clears the flag (latest OUT wins, BR-02)', () => {
    const punches: Punch[] = [
      { key: 'E6', t: t(D, '07:00'), dir: 'in', deviceId: 'TRN-01', deviceType: 'face', modality: 'face' },
      { key: 'E6', t: t(D, '15:00'), dir: 'out', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' },
      { key: 'E6', t: t(D, '15:30'), dir: 'out', deviceId: 'TRN-01', deviceType: 'face', modality: 'face' },
    ];
    const days = computeFte(emp, punches, [], cfg);
    expect(days[D].outT).toBe(t(D, '15:30'));
    expect(days[D].outManual).toBe(false);
  });
});

describe('BR-10 — approved Fusion leave fully excuses the day', () => {
  it('leave day shows leave type, no shortage/absence', () => {
    const emp: Employee = {
      no: 'E8', name: 'V', nameAr: 'ف', email: 'v@x', gender: 'F', company: 'AIC',
      dept: 'HR', costCenter: 'CC3', location: 'AIC Factory', segment: 'office',
      position: 'Specialist', grade: 'G7', religion: 'muslim', managerNo: null,
      managerName: null, hireDay: -10, termDay: null, canteenClass: 'regular',
    };
    const days = computeFte(emp, [], [{ key: 'E8', fromDay: 7, toDay: 9, type: 'annual' }], cfg);
    expect(days[8].status).toBe('leave');
    expect(days[8].leaveType).toBe('annual');
    expect(days[8].shortage).toBe(0);
  });
});
