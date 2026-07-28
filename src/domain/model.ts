// Domain model, shift catalogue and time utilities for the AIC Time & Attendance prototype.
// All times are absolute minutes from 00:00 of period day 0 (2026-06-01).
// Day index 0..29 covers June 2026.

export const PERIOD_YEAR = 2026;
export const PERIOD_MONTH = 5; // June (0-based)
export const PERIOD_DAYS = 30;
export const MIN_PER_DAY = 1440;

export type Religion = 'muslim' | 'non-muslim';
export type Segment = 'office' | 'shift' | 'manager';
export type CanteenClass = 'regular' | 'vip';
export type PunchDir = 'in' | 'out';
export type DeviceType = 'face' | 'gate' | 'canteen1' | 'canteen2' | 'web' | 'manual';

export interface Employee {
  no: string;
  name: string;
  nameAr: string;
  email: string;
  gender: 'M' | 'F';
  company: string;
  dept: string;
  costCenter: string;
  location: string;
  segment: Segment;       // office | shift (field) | manager (OT-exempt)
  position: string;
  grade: string;
  religion: Religion;
  managerNo: string | null;
  managerName: string | null;
  hireDay: number;        // day index (can be negative = hired before period)
  termDay: number | null; // day index of termination (inclusive last active day)
  canteenClass: CanteenClass;
}

export interface Casual {
  iqama: string;
  name: string;
  nameAr: string;
  supplier: string;
  supervisor: string;
  religion: Religion;
  costCenter: string;
  dept: string;
  jobTitle: string;
  monthlySalary: number;      // SAR
  healthCardExpiryDay: number; // day index (may exceed period)
  ajeerExpiryDay: number;
  active: boolean;
  dayOffWeekday: number;      // JS getUTCDay: 0=Sun..6=Sat — assigned paid day-off
}

export interface Punch {
  key: string;          // employee no or casual iqama
  t: number;            // absolute minutes
  dir: PunchDir;
  deviceId: string;
  deviceType: DeviceType;
  modality: 'face' | 'card' | 'vehicle' | 'web' | 'manual';
}

export interface LeaveRecord {
  key: string;
  fromDay: number;
  toDay: number;
  type: 'annual' | 'sick' | 'marriage' | 'death';
}

export interface Holiday { day: number; name: string; nameAr: string }

export interface RamadanWindow { fromDay: number; toDay: number }

export interface Config {
  graceMin: number;            // BR-11: 30
  otCapMin: number;            // BR-06(d): 240
  ramadan: RamadanWindow | null;
  holidays: Holiday[];
  shifts: Record<string, ShiftDef>; // admin-managed shift catalogue (FR-07/08/11)
  canteen1Price: number;       // FR-41: 5 SAR / punch-day
  canteen2Regular: number;     // 15 SAR
  canteen2Vip: number;         // 20 SAR
  nightAllowance: number;      // BR-12: 10 SAR/day
  simulatedToday: number;      // day index used as "today" for access validation
}

export const defaultConfig = (): Config => ({
  graceMin: 30,
  otCapMin: 240,
  ramadan: null,
  holidays: [{ day: 3, name: 'Eid Al-Adha (observed, demo)', nameAr: 'عيد الأضحى (تجريبي)' }],
  shifts: structuredClone(SHIFTS),
  canteen1Price: 5,
  canteen2Regular: 15,
  canteen2Vip: 20,
  nightAllowance: 10,
  simulatedToday: 29,
});

// ---------------- shift catalogue ----------------

export type ShiftKind = 'office' | 'field' | 'casual';

export interface ShiftDef {
  code: string;
  nameEn: string;
  kind: ShiftKind;  // drives which assignment rule considers this shift
  ramadan?: boolean; // Ramadan variant, used only inside the configured window
  start: number;    // minute of day
  durMin: number;   // window length; end may cross midnight
  required: number; // required (payable) minutes for completion rule
  night?: boolean;  // qualifies for night allowance (BR-12)
}

export const SHIFTS: Record<string, ShiftDef> = {
  // Office bands (FR-07)
  'OFF-A':  { code: 'OFF-A',  nameEn: 'Office 08:00–17:00', kind: 'office', start: 480,  durMin: 540, required: 480 },
  'OFF-B':  { code: 'OFF-B',  nameEn: 'Office 09:00–18:00', kind: 'office', start: 540,  durMin: 540, required: 480 },
  'OFFR-A': { code: 'OFFR-A', nameEn: 'Office Ramadan 10:00–16:00', kind: 'office', ramadan: true, start: 600, durMin: 360, required: 360 },
  'OFFR-B': { code: 'OFFR-B', nameEn: 'Office Ramadan 11:00–17:00', kind: 'office', ramadan: true, start: 660, durMin: 360, required: 360 },
  // Field rotating shifts (FR-08)
  'I-1':  { code: 'I-1',  nameEn: 'Field 07:00–15:00', kind: 'field', start: 420,  durMin: 480, required: 480 },
  'I-2':  { code: 'I-2',  nameEn: 'Field 15:00–23:00', kind: 'field', start: 900,  durMin: 480, required: 480 },
  'I-3':  { code: 'I-3',  nameEn: 'Field 23:00–07:00', kind: 'field', start: 1380, durMin: 480, required: 480, night: true },
  // Field Ramadan (FR-09) — 6h windows, Muslim required = 6h (BR-07)
  'IR-1': { code: 'IR-1', nameEn: 'Ramadan Field 05:00–11:00', kind: 'field', ramadan: true, start: 300,  durMin: 360, required: 360 },
  'IR-2': { code: 'IR-2', nameEn: 'Ramadan Field 13:00–19:00', kind: 'field', ramadan: true, start: 780,  durMin: 360, required: 360 },
  'IR-3': { code: 'IR-3', nameEn: 'Ramadan Field 21:00–03:00', kind: 'field', ramadan: true, start: 1260, durMin: 360, required: 360, night: true },
  // Casual (FR-11)
  'C-1':  { code: 'C-1',  nameEn: 'Casual 07:00–19:00', kind: 'casual', start: 420,  durMin: 720, required: 720 },
  'C-2':  { code: 'C-2',  nameEn: 'Casual 19:00–07:00', kind: 'casual', start: 1140, durMin: 720, required: 720 },
  'CR-1': { code: 'CR-1', nameEn: 'Ramadan Casual 05:00–17:00', kind: 'casual', ramadan: true, start: 300, durMin: 720, required: 720 },
  'CR-2': { code: 'CR-2', nameEn: 'Ramadan Casual 17:00–05:00', kind: 'casual', ramadan: true, start: 1020, durMin: 720, required: 720 },
};

/**
 * Candidate shifts of a kind for the given Ramadan context, sorted by start.
 * Falls back gracefully (same kind ignoring Ramadan, then the built-in
 * defaults) so the engine stays total even if admins empty a category.
 */
export const shiftsOf = (
  shifts: Record<string, ShiftDef>, kind: ShiftKind, ramadan: boolean,
): ShiftDef[] => {
  const all = Object.values(shifts);
  let list = all.filter(s => s.kind === kind && !!s.ramadan === ramadan);
  if (!list.length) list = all.filter(s => s.kind === kind);
  if (!list.length) list = Object.values(SHIFTS).filter(s => s.kind === kind);
  return list.sort((a, b) => a.start - b.start);
};

export interface ShiftInstance {
  def: ShiftDef;
  day: number;       // attendance day = day the shift starts (BR-03)
  start: number;     // absolute minutes
  end: number;       // absolute minutes
}

export const instanceOf = (def: ShiftDef, day: number): ShiftInstance => {
  const start = day * MIN_PER_DAY + def.start;
  return { def, day, start, end: start + def.durMin };
};

export const instance = (code: string, day: number, shifts: Record<string, ShiftDef> = SHIFTS): ShiftInstance =>
  instanceOf(shifts[code] ?? SHIFTS[code], day);

// ---------------- time helpers ----------------

export const weekday = (day: number): number =>
  new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, day + 1)).getUTCDay(); // 0=Sun..5=Fri,6=Sat

export const isFriday = (day: number) => weekday(day) === 5;
export const isSaturday = (day: number) => weekday(day) === 6;

export const fmtDate = (day: number): string => {
  const d = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, day + 1));
  return d.toISOString().slice(0, 10);
};

export const fmtTime = (abs: number | null): string => {
  if (abs === null) return '—';
  const m = ((abs % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const fmtDur = (min: number): string => {
  if (!min) return '0:00';
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
};

export const floor30 = (min: number): number => Math.floor(Math.max(0, min) / 30) * 30;

/**
 * Resolves an HH:MM punch-correction input against a row day.
 * Empty or malformed input keeps the original punch — a typo can never
 * silently delete a punch. A valid time lands on the day-D or day-D+1
 * instant nearest the original punch, so overnight-shift values
 * (e.g. an OUT at 07:05 the next morning) round-trip and edit correctly.
 */
export const resolveEditTime = (v: string, day: number, orig: number | null): number | null => {
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return orig;
  const mod = Number(m[1]) * 60 + Number(m[2]);
  const c0 = day * MIN_PER_DAY + mod;
  const c1 = c0 + MIN_PER_DAY;
  if (orig === null) return c0;
  return Math.abs(c0 - orig) <= Math.abs(c1 - orig) ? c0 : c1;
};

export const fmtPct = (ratio: number | null): string =>
  ratio === null ? '—' : `${Math.round(ratio * 100)}%`;

export const overlap = (a1: number, a2: number, b1: number, b2: number): number =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

export const inRamadan = (day: number, cfg: Config): boolean =>
  !!cfg.ramadan && day >= cfg.ramadan.fromDay && day <= cfg.ramadan.toDay;

export const isPublicHoliday = (day: number, cfg: Config): Holiday | undefined =>
  cfg.holidays.find(h => h.day === day);

export const daysInMonth = PERIOD_DAYS; // June has 30 — violation deduction divisor (BR-13)
