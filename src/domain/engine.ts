// Attendance calculation engine — implements PRD business rules BR-01..BR-16.
import {
  MIN_PER_DAY, PERIOD_DAYS, SHIFTS, shiftsOf, instanceOf, floor30, overlap, weekday,
  inRamadan, isPublicHoliday, isFriday, isSaturday, daysInMonth,
} from './model';
import type {
  Config, Employee, Casual, Punch, LeaveRecord, ShiftDef, ShiftInstance, Religion,
} from './model';

type Catalogue = Record<string, ShiftDef>;

/** Candidate instances on the attendance day, plus previous-day instances of overnight shifts (BR-03). */
const candidatesFor = (defs: ShiftDef[], day: number): ShiftInstance[] => {
  const out: ShiftInstance[] = [];
  for (const d of defs) {
    out.push(instanceOf(d, day));
    if (d.start + d.durMin > MIN_PER_DAY) out.push(instanceOf(d, day - 1));
  }
  return out;
};

// ---------------- sessionization (BR-02: earliest IN / latest OUT) ----------------

export interface Session {
  inT: number | null;
  outT: number | null;
  inSrc: Punch['deviceType'] | null;  // capture source of the effective IN (FR-04: distinguishable)
  outSrc: Punch['deviceType'] | null; // capture source of the effective OUT
}

/**
 * Groups raw punches (any capture source) into work sessions.
 * Earliest IN and latest OUT are kept per BR-02; mid-day out/in pairs
 * (e.g. lunch exits) are absorbed into the same session. Canteen punches
 * must be excluded by the caller (they are consumption events, not attendance).
 */
export function sessionize(punches: Punch[]): Session[] {
  const sorted = [...punches].sort((a, b) => a.t - b.t);
  const sessions: Session[] = [];
  let open: Session | null = null;
  const NEW_SESSION_GAP = 4 * 60; // a fresh IN >4h after the last OUT starts a new day session

  for (const p of sorted) {
    if (p.dir === 'in') {
      if (!open) {
        open = { inT: p.t, outT: null, inSrc: p.deviceType, outSrc: null };
      } else if (
        (open.outT !== null && p.t - open.outT > NEW_SESSION_GAP) ||
        (open.outT === null && open.inT !== null && p.t - open.inT > 16 * 60) // missing OUT: next day's IN starts fresh
      ) {
        sessions.push(open);
        open = { inT: p.t, outT: null, inSrc: p.deviceType, outSrc: null };
      }
      // else: duplicate IN (multi-device) or re-entry after a break — earliest IN kept
    } else {
      // pairing window 18h: 12h casual shift + 4h OT cap + slop must stay one attendance day
      if (open && open.inT !== null && p.t - open.inT <= 18 * 60) {
        if (open.outT === null || p.t > open.outT) { open.outT = p.t; open.outSrc = p.deviceType; } // latest OUT kept
      } else {
        if (open) sessions.push(open);
        open = null;
        sessions.push({ inT: null, outT: p.t, inSrc: null, outSrc: p.deviceType }); // orphan OUT → missing-IN exception
      }
    }
  }
  if (open) sessions.push(open);
  return sessions;
}

// ---------------- shift assignment ----------------

/** BR-04: FTE open-shift assignment by longest overlap of actual worked time. */
export function assignFieldShift(inT: number, outT: number, ramadan: boolean, shifts: Catalogue = SHIFTS): ShiftInstance {
  const day = Math.floor(inT / MIN_PER_DAY);
  const candidates = candidatesFor(shiftsOf(shifts, 'field', ramadan), day);
  let best = candidates[0];
  let bestOv = -1;
  for (const cand of candidates) {
    const ov = overlap(inT, outT, cand.start, cand.end);
    // strict > keeps the earlier shift on ties (documented tie-break, FR-10)
    if (ov > bestOv) { bestOv = ov; best = cand; }
  }
  return best;
}

/** Fallback for missing-OUT sessions: nearest shift start (overlap is undefined without an OUT). */
export function assignFieldShiftNearestStart(inT: number, ramadan: boolean, shifts: Catalogue = SHIFTS): ShiftInstance {
  const day = Math.floor(inT / MIN_PER_DAY);
  const candidates = candidatesFor(shiftsOf(shifts, 'field', ramadan), day);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const cand of candidates) {
    const dist = Math.abs(inT - cand.start);
    if (dist < bestDist) { bestDist = dist; best = cand; }
  }
  return best;
}

/** BR-05: casual shift assignment by nearest IN punch. */
export function assignCasualShift(inT: number, ramadan: boolean, shifts: Catalogue = SHIFTS): ShiftInstance {
  const day = Math.floor(inT / MIN_PER_DAY);
  const candidates = candidatesFor(shiftsOf(shifts, 'casual', ramadan), day);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const cand of candidates) {
    const dist = Math.abs(inT - cand.start);
    if (dist < bestDist) { bestDist = dist; best = cand; }
  }
  return best;
}

/**
 * FR-07: office flexible band resolved automatically from the actual punches.
 * With a full IN/OUT pair the band is the one with the longest overlap of the
 * actual worked time (same principle as BR-04) — so a late OUT can flip an
 * 08:xx arrival into the 09:00–18:00 band. Without an OUT it falls back to
 * the nearest band start. Ties keep the earlier band.
 */
export function assignOfficeBand(
  inT: number, ramadan: boolean, religion: Religion,
  shifts: Catalogue = SHIFTS, outT: number | null = null,
): ShiftInstance {
  const day = Math.floor(inT / MIN_PER_DAY);
  const bands = shiftsOf(shifts, 'office', ramadan && religion === 'muslim');
  if (outT !== null) {
    let best = bands[0];
    let bestOv = -1;
    let bestEndDist = Infinity;
    for (const b of bands) {
      const inst = instanceOf(b, day);
      const ov = overlap(inT, outT, inst.start, inst.end);
      // equal overlap (both bands fully covered) → the band whose end matches the
      // actual OUT wins, so an early arrival staying until ~18:00 lands on OFF-B
      const endDist = Math.abs(outT - inst.end);
      if (ov > bestOv || (ov === bestOv && endDist < bestEndDist)) {
        bestOv = ov; bestEndDist = endDist; best = b;
      }
    }
    return instanceOf(best, day);
  }
  const minOfDay = inT - day * MIN_PER_DAY;
  let best = bands[0];
  let bestDist = Infinity;
  for (const b of bands) {
    const dist = Math.abs(minOfDay - b.start);
    if (dist < bestDist) { bestDist = dist; best = b; } // cutoff at the midpoint between band starts
  }
  return instanceOf(best, day);
}

// ---------------- day metrics (BR-06, BR-11, FR-14/15/16) ----------------

export interface DayMetrics {
  worked: number;
  lateIn: number;
  earlyOut: number;
  shortage: number;
  otBefore: number;   // rounded, pre-cap
  otAfter: number;
  otNormal: number;   // capped total (before+after)
  uncounted: number;  // hours beyond the daily cap, visible for audit (FR-16)
}

export function computeMetrics(
  inT: number, outT: number, s: ShiftInstance, requiredOverride: number | null,
  cfg: Config, otEligible: boolean,
): DayMetrics {
  const required = requiredOverride ?? s.def.required;
  const worked = outT - inT;
  const ov = overlap(inT, outT, s.start, s.end);
  const lateIn = inT > s.start + cfg.graceMin ? inT - s.start : 0; // BR-11: within grace → no flag
  const earlyOut = outT < s.end ? s.end - outT : 0;
  const shortage = Math.max(0, required - ov);

  let otBefore = 0, otAfter = 0, otNormal = 0, uncounted = 0;
  // FR-14: OT only after completing the full shift hours
  if (otEligible && worked >= required) {
    otBefore = floor30(Math.max(0, s.start - inT));               // FR-15: rounded separately
    otAfter = floor30(Math.max(0, outT - Math.max(s.end, inT + required)));
    const total = otBefore + otAfter;
    otNormal = Math.min(total, cfg.otCapMin);                     // FR-16: daily 4h cap
    uncounted = total - otNormal;
  }
  return { worked, lateIn, earlyOut, shortage, otBefore, otAfter, otNormal, uncounted };
}

// ---------------- FTE day results ----------------

export type DayStatus =
  | 'worked' | 'absent' | 'rest' | 'leave' | 'holiday-worked' | 'day-off'
  | 'missing-out' | 'missing-in' | 'not-employed';

export interface FteDayResult {
  empNo: string;
  day: number;
  status: DayStatus;
  leaveType?: string;
  shiftCode: string | null;
  shiftStart: number | null;
  shiftEnd: number | null;
  inT: number | null;
  outT: number | null;
  worked: number;
  required: number;   // required (payable) minutes of the assigned shift; 0 when none
  lateIn: number;
  earlyOut: number;
  shortage: number;
  otNormal: number;
  otHoliday: number;
  uncounted: number;
  nightAllowanceDay: boolean; // BR-12
  ramadan: boolean;
  inManual: boolean;  // effective IN came from a manual correction (FR-33/38)
  outManual: boolean; // effective OUT came from a manual correction
}

const emptyDay = (empNo: string, day: number, status: DayStatus): FteDayResult => ({
  empNo, day, status, shiftCode: null, shiftStart: null, shiftEnd: null,
  inT: null, outT: null, worked: 0, required: 0, lateIn: 0, earlyOut: 0, shortage: 0,
  otNormal: 0, otHoliday: 0, uncounted: 0, nightAllowanceDay: false, ramadan: false,
  inManual: false, outManual: false,
});

/**
 * Required-hours completion ratio: (required − shortage + counted OT) / required.
 * Exactly 1 for a completed shift, above 1 on OT days, below 1 on shortage days;
 * null when not computable (no shift, no worked time, or a holiday/rest day
 * where nothing is required).
 */
export const requiredCompletion = (
  d: Pick<FteDayResult, 'worked' | 'required' | 'shortage' | 'otNormal'>,
): number | null =>
  d.required > 0 && d.worked > 0 ? (d.required - d.shortage + d.otNormal) / d.required : null;

const isRestDay = (emp: Employee, day: number): boolean =>
  emp.segment === 'shift' ? isFriday(day) : (isFriday(day) || isSaturday(day)); // BR-01 patterns

export function computeFte(
  emp: Employee, punches: Punch[], leaves: LeaveRecord[], cfg: Config,
  dayOffs: number[] = [], // manager-granted day offs: working one = full-day OT, no daily cap
): FteDayResult[] {
  const dayOffSet = new Set(dayOffs);
  // FR-22: punches after the termination day are rejected
  const usable = punches.filter(p =>
    p.deviceType !== 'canteen1' && p.deviceType !== 'canteen2' &&
    (emp.termDay === null || Math.floor(p.t / MIN_PER_DAY) <= emp.termDay));
  const sessions = sessionize(usable);
  const byDay = new Map<number, FteDayResult>();

  for (const s of sessions) {
    if (s.inT === null && s.outT !== null) {
      const day = Math.floor(s.outT / MIN_PER_DAY);
      const r = emptyDay(emp.no, day, 'missing-in');
      r.outT = s.outT;
      r.outManual = s.outSrc === 'manual';
      byDay.set(day, r);
      continue;
    }
    if (s.inT === null) continue;
    const ram = inRamadan(Math.floor(s.inT / MIN_PER_DAY), cfg);
    const muslimRamadanField = ram && emp.religion === 'muslim' && emp.segment === 'shift';

    let si: ShiftInstance;
    if (emp.segment === 'shift') {
      // Non-Muslim field staff stay on standard I-shifts in Ramadan (8h normal, BR-07 / OQ-10)
      si = s.outT === null
        ? assignFieldShiftNearestStart(s.inT, muslimRamadanField, cfg.shifts) // no OUT → overlap undefined; use nearest start
        : assignFieldShift(s.inT, s.outT, muslimRamadanField, cfg.shifts);
    } else {
      si = assignOfficeBand(s.inT, ram, emp.religion, cfg.shifts, s.outT);
    }

    const day = si.day;
    const r = emptyDay(emp.no, day, s.outT === null ? 'missing-out' : 'worked');
    r.ramadan = inRamadan(day, cfg);
    r.shiftCode = si.def.code;
    r.shiftStart = si.start;
    r.shiftEnd = si.end;
    r.required = si.def.required;
    r.inT = s.inT;
    r.outT = s.outT;
    r.inManual = s.inSrc === 'manual';
    r.outManual = s.outSrc === 'manual';

    if (s.outT !== null) {
      // BR-09 + manager-granted day offs: all worked hours become OT-Holiday, exempt from the daily cap
      const holiday = isPublicHoliday(day, cfg) || isRestDay(emp, day) || dayOffSet.has(day);
      // BR-14: shift workers OT-eligible; office by exception only; managers exempt
      const otEligible = emp.segment === 'shift';
      const m = computeMetrics(s.inT, s.outT, si, null, cfg, otEligible && !holiday);
      Object.assign(r, {
        worked: m.worked, lateIn: m.lateIn, earlyOut: m.earlyOut,
        shortage: m.shortage, otNormal: m.otNormal, uncounted: m.uncounted,
      });
      if (holiday) {
        // BR-09: work on rest day / public holiday → all hours OT-Holiday
        r.status = 'holiday-worked';
        r.otHoliday = emp.segment === 'manager' ? 0 : floor30(m.worked);
        r.lateIn = 0; r.earlyOut = 0; r.shortage = 0;
        r.required = 0; // nothing is required on a rest day / holiday (all hours are OT-Holiday)
      }
      // BR-12: night allowance when assigned shift is I-3/IR-3 and completion rule met
      r.nightAllowanceDay = !!si.def.night && m.worked >= si.def.required && !holiday;
    }
    byDay.set(day, r);
  }

  const results: FteDayResult[] = [];
  for (let day = 0; day < PERIOD_DAYS; day++) {
    const active = day >= emp.hireDay && (emp.termDay === null || day <= emp.termDay);
    if (!active) { results.push(emptyDay(emp.no, day, 'not-employed')); continue; }
    const leave = leaves.find(l => l.key === emp.no && day >= l.fromDay && day <= l.toDay);
    const existing = byDay.get(day);
    if (existing) { results.push(existing); continue; }
    if (leave) { // BR-10: approved Fusion leave fully excuses the day
      const r = emptyDay(emp.no, day, 'leave');
      r.leaveType = leave.type;
      results.push(r);
      continue;
    }
    if (dayOffSet.has(day)) { results.push(emptyDay(emp.no, day, 'day-off')); continue; }
    results.push(emptyDay(emp.no, day, isRestDay(emp, day) || isPublicHoliday(day, cfg) ? 'rest' : 'absent'));
  }
  return results;
}

// ---------------- casual day results & salary (BR-08, BR-13, FR-29..31) ----------------

export interface CasualDayResult {
  iqama: string;
  day: number;
  status: DayStatus | 'day-off';
  shiftCode: string | null;
  shiftStart: number | null;
  shiftEnd: number | null;
  inT: number | null;
  outT: number | null;
  worked: number;
  lateIn: number;
  earlyOut: number;
  shortage: number;
  otMin: number;          // OT hours flagged (Ramadan-Muslim 10+2 or holiday day)
  holidayWork: boolean;   // FR-31: ×1.5 day
  dailyPay: number;       // SAR
  inManual: boolean;
  outManual: boolean;
}

export function computeCasual(
  c: Casual, punches: Punch[], cfg: Config,
): CasualDayResult[] {
  const dailyRate = c.monthlySalary / 30; // BR-13: 30-day base regardless of calendar
  const usable = punches.filter(p => p.deviceType !== 'canteen1' && p.deviceType !== 'canteen2');
  const sessions = sessionize(usable);
  const byDay = new Map<number, CasualDayResult>();

  for (const s of sessions) {
    if (s.inT === null) continue;
    const ram = inRamadan(Math.floor(s.inT / MIN_PER_DAY), cfg);
    const si = assignCasualShift(s.inT, ram, cfg.shifts);
    const day = si.day;
    const holiday = !!isPublicHoliday(day, cfg);
    const r: CasualDayResult = {
      iqama: c.iqama, day, status: s.outT === null ? 'missing-out' : 'worked',
      shiftCode: si.def.code, shiftStart: si.start, shiftEnd: si.end,
      inT: s.inT, outT: s.outT, worked: 0, lateIn: 0, earlyOut: 0, shortage: 0,
      otMin: 0, holidayWork: holiday, dailyPay: 0,
      inManual: s.inSrc === 'manual', outManual: s.outSrc === 'manual',
    };
    if (s.outT !== null) {
      const worked = s.outT - s.inT;
      const ov = overlap(s.inT, s.outT, si.start, si.end);
      r.worked = worked;
      r.lateIn = s.inT > si.start + cfg.graceMin ? s.inT - si.start : 0;
      r.earlyOut = s.outT < si.end ? si.end - s.outT : 0;

      const ramMuslim = inRamadan(day, cfg) && c.religion === 'muslim';
      if (ramMuslim) {
        // BR-08: first 10h normal, next 2h OT ×1.5
        const normalMin = 600;
        r.shortage = Math.max(0, normalMin - Math.min(ov, normalMin));
        r.otMin = floor30(Math.min(Math.max(0, worked - normalMin), 120));
        // pay for up to 10 normal hours at the 12h-day hourly rate + OT premium
        const hourly = dailyRate / 12;
        r.dailyPay = (Math.min(ov, normalMin) / 60) * hourly + (r.otMin / 60) * hourly * 1.5;
      } else {
        r.shortage = Math.max(0, si.def.required - ov);
        if (holiday) {
          r.otMin = floor30(worked); // flagged; pay = 1.5 × daily rate (FR-31)
          r.dailyPay = dailyRate * 1.5;
          r.lateIn = 0; r.earlyOut = 0; r.shortage = 0;
          r.status = 'holiday-worked';
        } else {
          r.dailyPay = dailyRate; // full attendance day
        }
      }
      r.dailyPay = Math.round(r.dailyPay * 100) / 100;
    }
    byDay.set(day, r);
  }

  const results: CasualDayResult[] = [];
  for (let day = 0; day < PERIOD_DAYS; day++) {
    const existing = byDay.get(day);
    if (existing) { results.push(existing); continue; }
    const dayOff = weekday(day) === c.dayOffWeekday;
    results.push({
      iqama: c.iqama, day, status: dayOff ? 'day-off' : 'absent',
      shiftCode: null, shiftStart: null, shiftEnd: null, inT: null, outT: null,
      worked: 0, lateIn: 0, earlyOut: 0, shortage: 0, otMin: 0, holidayWork: false,
      dailyPay: dayOff ? Math.round(dailyRate * 100) / 100 : 0, // BR-13: assigned day-off paid in full
      inManual: false, outManual: false,
    });
  }
  return results;
}

/** BR-13 / FR-30: one working-day deduction per violation, valued by actual month days. */
export const violationDeduction = (monthlySalary: number, violations: number): number =>
  Math.round((monthlySalary / daysInMonth) * violations * 100) / 100;

export interface CasualSummary {
  iqama: string;
  attendancePay: number;
  incentive: number;
  deduction: number;
  totalSalary: number;
  totalShortage: number;
  totalLateIn: number;
  totalEarlyOut: number;
  totalOt: number;
  daysWorked: number;
}

export function summarizeCasual(
  c: Casual, days: CasualDayResult[], incentive: number, violations: number,
): CasualSummary {
  const attendancePay = Math.round(days.reduce((s, d) => s + d.dailyPay, 0) * 100) / 100;
  const deduction = violationDeduction(c.monthlySalary, violations);
  return {
    iqama: c.iqama,
    attendancePay,
    incentive,
    deduction,
    totalSalary: Math.round((attendancePay + incentive - deduction) * 100) / 100,
    totalShortage: days.reduce((s, d) => s + d.shortage, 0),
    totalLateIn: days.reduce((s, d) => s + d.lateIn, 0),
    totalEarlyOut: days.reduce((s, d) => s + d.earlyOut, 0),
    totalOt: days.reduce((s, d) => s + d.otMin, 0),
    daysWorked: days.filter(d => d.status === 'worked' || d.status === 'holiday-worked').length,
  };
}

// ---------------- access validation (BR-15, FR-26/27) ----------------

export interface AccessResult { green: boolean; reasons: string[] }

export function validateFteAccess(emp: Employee, today: number): AccessResult {
  const reasons: string[] = [];
  if (today < emp.hireDay) reasons.push('not-yet-hired');
  if (emp.termDay !== null && today > emp.termDay) reasons.push('terminated');
  return { green: reasons.length === 0, reasons };
}

export function validateCasualAccess(c: Casual, today: number): AccessResult {
  const reasons: string[] = [];
  if (!c.active) reasons.push('inactive');
  if (c.healthCardExpiryDay < today) reasons.push('health-card-expired');
  if (c.ajeerExpiryDay < today) reasons.push('ajeer-expired');
  return { green: reasons.length === 0, reasons };
}

// ---------------- canteen (FR-41) ----------------

export interface CanteenCharge { key: string; day: number; device: 'canteen1' | 'canteen2'; amount: number }

export function computeCanteen(
  punches: Punch[], classOf: (key: string) => 'regular' | 'vip', cfg: Config,
): CanteenCharge[] {
  const firstPunch = new Map<string, CanteenCharge>(); // key|day|device → first punch only
  for (const p of punches) {
    if (p.deviceType !== 'canteen1' && p.deviceType !== 'canteen2') continue;
    const day = Math.floor(p.t / MIN_PER_DAY);
    const mapKey = `${p.key}|${day}|${p.deviceType}`;
    if (firstPunch.has(mapKey)) continue;
    const amount = p.deviceType === 'canteen1'
      ? cfg.canteen1Price
      : (classOf(p.key) === 'vip' ? cfg.canteen2Vip : cfg.canteen2Regular);
    firstPunch.set(mapKey, { key: p.key, day, device: p.deviceType, amount });
  }
  return [...firstPunch.values()];
}
