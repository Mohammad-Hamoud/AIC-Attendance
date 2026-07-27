// Multi-system attendance merge (FR-45): combines the three real company
// reports into one accurate attendance file, following the TAS column design.
//
//   TAS        (HR Works)          — main attendance, one row per employee per day.
//                                    Employee Code is mostly the OLD number.
//   Car Gate   (Speca Time&Space)  — access events, names only (no emp number):
//                                    matched to employees by normalized name tokens.
//   Leaves     (Oracle Fusion)     — approved absences by NEW employee number.
//   Active list(Oracle Fusion)     — Old Emp No. ↔ New Emp No. ↔ Name bridge.
//
// Everything here is pure and library-free: sheets come in as row matrices
// (index 0 = column A) so the module is unit-testable without exceljs.

export type Cell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = Cell[][];

export type ReportKind = 'tas' | 'gate' | 'leaves' | 'active';

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const txt = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map(r => r.text).join('');
    if (o.text) return o.text;
    if (o.result !== undefined) return String(o.result);
  }
  return String(v).trim();
};

/** '01-Jun-26' / '01-Jun-2026' / Date → 'YYYY-MM-DD' (null if unparseable). */
export const parseDateKey = (v: Cell): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = txt(v).replace(/[‎‏]/g, '').trim();
  const m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${String(mon + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
};

/** 'H:MM' / 'HH:MM:SS' → minutes of day (null if blank/unparseable). */
export const parseHm = (v: Cell): number | null => {
  const s = txt(v);
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** 'dd-MMM-yyyy H:MM:SS' (gate event stamp) → { dateKey, minutes }. */
export const parseGateStamp = (v: Cell): { dateKey: string; minutes: number } | null => {
  const dateKey = parseDateKey(v);
  const minutes = parseHm(v);
  if (!dateKey || minutes === null) return null;
  return { dateKey, minutes };
};

export const fmtHm = (min: number | null): string => {
  if (min === null) return '';
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const fmtDur = (min: number | null): string =>
  min === null ? '' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/** TAS '8.14' means 8h14m (H.MM convention) → minutes. Also accepts 'H:MM'. */
export const parseTasDur = (v: Cell): number | null => {
  const s = txt(v);
  if (!s) return null;
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  const h = Math.floor(n);
  const mm = Math.round((n - h) * 100); // .14 → 14 minutes
  return h * 60 + Math.min(59, mm);
};

const stripZeros = (v: Cell): string => txt(v).replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');

// ---------------- detection ----------------

export function detectReportKind(matrix: SheetMatrix): ReportKind | null {
  const head = matrix.slice(0, 8).flat().map(txt).join(' | ').toLowerCase();
  if (head.includes('old emp no')) return 'active';
  if (head.includes('absence type') || head.includes('leave report')) return 'leaves';
  if (head.includes('event log') || (head.includes('detailed access status') && head.includes('user'))) return 'gate';
  if (head.includes('employee code') || head.includes('detailed report')) return 'tas';
  return null;
}

// ---------------- parsers ----------------

export interface TasRow {
  empType: string; company: string; code: string; name: string;
  dateKey: string; shift: string; status: string;
  schedIn: number | null; schedOut: number | null;
  timeIn: number | null; timeOut: number | null;
  totalMin: number | null; requiredMin: number | null;
  lateMin: number | null; earlyMin: number | null;
  regularMin: number | null; otMin: number | null;
  shortageMin: number | null; holidayOtMin: number | null;
}

const findHeaderRow = (matrix: SheetMatrix, marker: string): number =>
  matrix.findIndex(r => r.some(c => txt(c).replace(/\s+/g, ' ').toLowerCase().includes(marker)));

/** Maps header labels → column indexes on a header row (whitespace-tolerant). */
const headerCols = (row: Cell[]): Map<string, number> => {
  const m = new Map<string, number>();
  row.forEach((c, i) => {
    const label = txt(c).replace(/\s+/g, ' ').trim().toLowerCase();
    if (label) m.set(label, i);
  });
  return m;
};

export function parseTas(matrix: SheetMatrix): TasRow[] {
  const h = findHeaderRow(matrix, 'employee code');
  if (h < 0) return [];
  const cols = headerCols(matrix[h]);
  const col = (label: string) => cols.get(label) ?? -1;
  const C = {
    empType: col('employee type'), company: col('company'), code: col('employee code'),
    name: col('employee name'), date: col('date'), shift: col('shift code'), status: col('status'),
    schedIn: col('scheduled in'), schedOut: col('scheduled out'),
    timeIn: col('time in'), timeOut: col('time out'),
    total: col('total hours'), required: col('required hours'),
    late: col('late coming'), early: col('early departure'),
    regular: col('regular hours'), ot: col('normal ot hrs'),
    shortage: col('shortage hours'), holidayOt: col('holiday ot hrs'),
  };
  const out: TasRow[] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const r = matrix[i];
    const code = stripZeros(r[C.code]);
    const dateKey = parseDateKey(r[C.date]);
    if (!code || !dateKey) continue;
    out.push({
      empType: txt(r[C.empType]), company: txt(r[C.company]), code,
      name: txt(r[C.name]), dateKey, shift: txt(r[C.shift]), status: txt(r[C.status]),
      schedIn: parseHm(r[C.schedIn]), schedOut: parseHm(r[C.schedOut]),
      timeIn: parseHm(r[C.timeIn]), timeOut: parseHm(r[C.timeOut]),
      totalMin: parseTasDur(r[C.total]), requiredMin: parseTasDur(r[C.required]),
      lateMin: parseTasDur(r[C.late]), earlyMin: parseTasDur(r[C.early]),
      regularMin: parseTasDur(r[C.regular]), otMin: parseTasDur(r[C.ot]),
      shortageMin: parseTasDur(r[C.shortage]), holidayOtMin: parseTasDur(r[C.holidayOt]),
    });
  }
  return out;
}

export interface GateEvent {
  user: string; dateKey: string; minutes: number; dir: 'in' | 'out';
  /** possible actual times: one entry for a 24h export, AM+PM candidates for a 12h export */
  cands: number[];
  /** employee numbers from the optional ID column — '102988(13323)' yields both, order-agnostic */
  empNos: string[];
}

/**
 * Parses gate events. Speca can export times in 12-hour format WITHOUT an
 * AM/PM marker; if no timestamp in the whole file has an hour ≥ 13, every
 * event gets two meridiem candidates and the merge resolves them per day
 * against the employee's schedule/known punches.
 */
export function parseGate(matrix: SheetMatrix): GateEvent[] {
  const h = findHeaderRow(matrix, 'date/time');
  if (h < 0) return [];
  const cols = headerCols(matrix[h]);
  const cId = cols.get('id'); // newer Speca exports carry the employee number(s)
  const cUser = cols.get('user') ?? 0;
  const cStamp = cols.get('date/time') ?? 1;
  const cEvent = cols.get('event') ?? 3;
  const raw: GateEvent[] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const r = matrix[i];
    const ev = txt(r[cEvent]).toLowerCase();
    const dir = ev === 'access in' ? 'in' : ev === 'access out' ? 'out' : null; // 'Rejected Access' etc. ignored
    const stamp = parseGateStamp(r[cStamp]);
    const user = txt(r[cUser]);
    if (!dir || !stamp || !user) continue;
    const empNos = cId === undefined ? [] : [...txt(r[cId]).matchAll(/\d+/g)].map(m => stripZeros(m[0]));
    raw.push({ user, dateKey: stamp.dateKey, minutes: stamp.minutes, dir, cands: [stamp.minutes], empNos });
  }
  const is12h = raw.length > 0 && raw.every(e => Math.floor(e.minutes / 60) <= 12);
  if (is12h) {
    for (const e of raw) {
      const hh = Math.floor(e.minutes / 60), mm = e.minutes % 60;
      e.cands = hh === 12 ? [720 + mm, mm] : [hh * 60 + mm, (hh + 12) * 60 + mm]; // 12:xx → noon or midnight
    }
  }
  return raw;
}

export interface LeaveRow { empNo: string; name: string; type: string; fromKey: string; toKey: string }

export function parseLeaves(matrix: SheetMatrix): LeaveRow[] {
  const h = findHeaderRow(matrix, 'absence type');
  if (h < 0) return [];
  const cols = headerCols(matrix[h]);
  const c = (l: string) => cols.get(l) ?? -1;
  const C = {
    no: c('employee number'), name: c('employee name'), type: c('absence type'),
    from: c('start date'), to: c('end date'), approval: c('approval status'),
  };
  const out: LeaveRow[] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (txt(r[C.approval]).toUpperCase() !== 'APPROVED') continue; // all types, approved only
    const empNo = stripZeros(r[C.no]);
    const fromKey = parseDateKey(r[C.from]);
    const toKey = parseDateKey(r[C.to]) ?? fromKey;
    if (!empNo || !fromKey || !toKey) continue;
    out.push({ empNo, name: txt(r[C.name]), type: txt(r[C.type]), fromKey, toKey });
  }
  return out;
}

export interface ActiveRow { oldNo: string; newNo: string; name: string }

export function parseActive(matrix: SheetMatrix): ActiveRow[] {
  const h = findHeaderRow(matrix, 'old emp no');
  if (h < 0) return [];
  const cols = headerCols(matrix[h]);
  const cOld = cols.get('old emp no.') ?? cols.get('old emp no') ?? 0;
  const cNew = [...cols.entries()].find(([l], ) => l.startsWith('emp no') && !l.startsWith('old'))?.[1] ?? 1;
  const cName = [...cols.entries()].find(([l]) => l.includes('name'))?.[1] ?? 2;
  const out: ActiveRow[] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const r = matrix[i];
    const oldNo = stripZeros(r[cOld]);
    const newNo = stripZeros(r[cNew]);
    if (!newNo) continue;
    out.push({ oldNo, newNo, name: txt(r[cName]) });
  }
  return out;
}

// ---------------- gate-name matching ----------------

const STOP = new Set(['ifi', 'factory', 'f', 'mr', 'mrs']);

/** Tokenizes a person name: lowercase, parenthetical junk removed, 'Al X'/'Al-X' fused to 'alx'. */
export const nameTokens = (name: string): string[] => {
  const cleaned = name.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z؀-ۿ]+/g, ' ');
  const raw = cleaned.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 'al' && i + 1 < raw.length) { out.push('al' + raw[++i]); continue; }
    if (!STOP.has(raw[i]) && raw[i].length >= 2) out.push(raw[i]);
  }
  return out;
};

export interface EmployeeRef { code: string; newNo: string | null; names: string[] }

/**
 * Matches a gate user name against employees by token subset:
 * every gate token must appear in the employee's token pool (exact first,
 * then prefix≥4 fallback). A unique hit is a match; multiple hits at the
 * strictest level that produced hits → ambiguous.
 */
export function matchGateUser(user: string, employees: EmployeeRef[]):
  { emp?: EmployeeRef; ambiguous?: EmployeeRef[] } {
  const ut = nameTokens(user);
  if (ut.length === 0) return {};
  const pools = employees.map(e => ({ e, tokens: new Set(e.names.flatMap(nameTokens)) }));
  const hitsAt = (loose: boolean) => pools.filter(({ tokens }) =>
    ut.every(t => tokens.has(t) || (loose && t.length >= 4 && [...tokens].some(x => x.startsWith(t) || t.startsWith(x)))));
  const exact = hitsAt(false);
  if (exact.length === 1) return { emp: exact[0].e };
  if (exact.length > 1) return { ambiguous: exact.map(h => h.e) };
  const loose = hitsAt(true);
  if (loose.length === 1) return { emp: loose[0].e };
  if (loose.length > 1) return { ambiguous: loose.map(h => h.e) };
  return {};
}

// ---------------- the merge ----------------

export interface MergedRow extends TasRow {
  newNo: string | null;
  leaveType: string;
  inSource: '' | 'TAS' | 'Car Gate';
  outSource: '' | 'TAS' | 'Car Gate';
}

export interface MergeResult {
  rows: MergedRow[];
  summary: {
    employees: number; days: number;
    gateEvents: number; gateMatchedEvents: number;
    gateUsersMatched: number; gateUsersMatchedByNumber: number; gateUsersUnmatched: number;
    leaveRowsApplied: number; leaveDaysApplied: number;
    statusUpgraded: number; punchesImproved: number;
    /** Active-list employees absent from TAS whose gate/leave evidence created rows */
    employeesAddedNotInTas: number;
    /** approved leave rows whose dates fall entirely outside the report period */
    leavesOutsidePeriod: number;
  };
  unmatchedGateUsers: { user: string; events: number; reason: string }[];
  unresolvedLeaves: { empNo: string; name: string; type: string; from: string; to: string; reason: string }[];
}

const eachDay = (fromKey: string, toKey: string): string[] => {
  const out: string[] = [];
  const d = new Date(fromKey + 'T00:00:00Z');
  const end = new Date(toKey + 'T00:00:00Z');
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

const ABSENTISH = new Set(['absent', 'missing in', 'missing out', '']);

interface DayGate { ins: number[][]; outs: number[][] } // candidate lists per event

/**
 * Chooses one candidate per ambiguous (12h-format) gate event by minimizing a
 * plausibility score for the whole day: punches anchored to the schedule (or
 * the TAS punches, or a default office day), and a working span that stays
 * inside sane bounds. A 24h export has single candidates and passes through.
 */
function resolveGateDay(r: TasRow, g: DayGate): { ins: number[]; outs: number[] } {
  const events = [
    ...g.ins.map(c => ({ c, dir: 'in' as const })),
    ...g.outs.map(c => ({ c, dir: 'out' as const })),
  ];
  if (events.every(e => e.c.length === 1)) return { ins: g.ins.map(c => c[0]), outs: g.outs.map(c => c[0]) };

  const n = Math.min(events.length, 12);
  const anchorIn = r.schedIn ?? r.timeIn ?? 510; // default 08:30 office arrival
  let anchorOut = r.schedOut ?? r.timeOut ?? null;
  if (anchorOut !== null && r.schedIn !== null && r.schedOut !== null && r.schedOut < r.schedIn) anchorOut += 1440; // overnight shift
  if (anchorOut === null) anchorOut = anchorIn + 540;

  let best = { ins: g.ins.map(c => c[0]), outs: g.outs.map(c => c[0]) };
  let bestScore = Infinity;
  for (let mask = 0; mask < (1 << n); mask++) {
    const gi: number[] = [], go: number[] = [];
    for (let i = 0; i < n; i++) {
      const e = events[i];
      const v = e.c[Math.min((mask >> i) & 1, e.c.length - 1)];
      (e.dir === 'in' ? gi : go).push(v);
    }
    const ins = [...gi, ...(r.timeIn !== null ? [r.timeIn] : [])];
    const outs = [...go, ...(r.timeOut !== null ? [r.timeOut] : [])];
    const eIn = ins.length ? Math.min(...ins) : null;
    const eOutRaw = outs.length ? Math.max(...outs) : null;
    let pen = 0;
    let eOut = eOutRaw;
    if (eIn !== null && eOutRaw !== null) {
      eOut = eOutRaw >= eIn ? eOutRaw : eOutRaw + 1440;
      const dur = eOut - eIn;
      if (dur > 16 * 60) pen += 100000;   // impossible working span
      if (dur < 30) pen += 50000;
      pen += Math.abs(dur - 540) / 4;      // gentle bias towards a normal day
    }
    if (eIn !== null) pen += Math.abs(eIn - anchorIn);
    if (eOut !== null) pen += Math.abs(eOut - anchorOut);
    if (pen < bestScore) { bestScore = pen; best = { ins: gi, outs: go }; }
  }
  return best;
}

export function buildMergedReport(
  tas: TasRow[], gate: GateEvent[], leaves: LeaveRow[], active: ActiveRow[],
): MergeResult {
  // employee registry keyed by canonical TAS code
  const old2new = new Map(active.map(a => [a.oldNo, a.newNo]));
  const newSet = new Set(active.map(a => a.newNo));
  const nameByNew = new Map(active.map(a => [a.newNo, a.name]));

  const byCode = new Map<string, EmployeeRef>();
  for (const r of tas) {
    if (byCode.has(r.code)) continue;
    const newNo = newSet.has(r.code) ? r.code : old2new.get(r.code) ?? null;
    const names = [r.name];
    if (newNo && nameByNew.get(newNo)) names.push(nameByNew.get(newNo)!);
    byCode.set(r.code, { code: r.code, newNo, names });
  }
  const employees = [...byCode.values()];
  const byNew = new Map<string, EmployeeRef>();
  for (const e of employees) if (e.newNo) byNew.set(e.newNo, e);

  // report period comes from the TAS export itself
  const dateKeys = tas.map(r => r.dateKey).sort();
  const periodMin = dateKeys[0] ?? '0000-00-00';
  const periodMax = dateKeys[dateKeys.length - 1] ?? '9999-99-99';
  const companies = new Map<string, number>();
  for (const r of tas) companies.set(r.company, (companies.get(r.company) ?? 0) + 1);
  const commonCompany = [...companies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  // employees the Active list knows but TAS doesn't: their gate/leave evidence
  // still deserves rows — they are synthesized as 'Not in TAS' below
  const activeByAnyNo = new Map<string, ActiveRow>();
  for (const a of active) { activeByAnyNo.set(a.newNo, a); if (a.oldNo) activeByAnyNo.set(a.oldNo, a); }
  const extraByCode = new Map<string, EmployeeRef>();
  const extraEmp = (a: ActiveRow): EmployeeRef => {
    let e = extraByCode.get(a.newNo);
    if (!e) { e = { code: a.newNo, newNo: a.newNo, names: [a.name] }; extraByCode.set(a.newNo, e); }
    return e;
  };
  const activeOnlyRefs: EmployeeRef[] = active
    .filter(a => !byNew.has(a.newNo) && !byCode.has(a.newNo) && !byCode.has(a.oldNo))
    .map(a => ({ code: a.newNo, newNo: a.newNo, names: [a.name] }));

  // gate: resolve each distinct badge (ID + displayed name) once, then group
  // events per employee+day. The employee number — when the export carries it —
  // is authoritative; name matching is the fallback for older exports.
  const users = new Map<string, { user: string; empNos: string[]; events: GateEvent[] }>();
  for (const ev of gate) {
    const key = `${ev.empNos.join(',')}|${ev.user}`;
    const g = users.get(key) ?? { user: ev.user, empNos: ev.empNos, events: [] };
    g.events.push(ev);
    users.set(key, g);
  }
  const resolveByNumber = (nos: string[]): EmployeeRef | undefined => {
    for (const no of nos) {
      const bridged = old2new.get(no);
      const hit = byCode.get(no) ?? byNew.get(no)
        ?? (bridged !== undefined ? byCode.get(bridged) ?? byNew.get(bridged) : undefined);
      if (hit) return hit;
      const a = activeByAnyNo.get(no); // in the Active list but not in TAS → synthesized employee
      if (a) return extraEmp(a);
    }
    return undefined;
  };
  const unmatchedGateUsers: MergeResult['unmatchedGateUsers'] = [];
  const gateByEmpDay = new Map<string, DayGate>();
  let gateMatchedEvents = 0, gateUsersMatched = 0, gateUsersMatchedByNumber = 0;
  for (const [, grp] of users) {
    const { user, events } = grp;
    const byNumber = resolveByNumber(grp.empNos);
    const { emp, ambiguous } = byNumber
      ? { emp: byNumber, ambiguous: undefined }
      : matchGateUser(user, [...employees, ...activeOnlyRefs]);
    if (byNumber) gateUsersMatchedByNumber++;
    if (!emp) {
      const numNote = grp.empNos.length ? `emp no ${grp.empNos.join('/')} not found in TAS or Active list; ` : '';
      unmatchedGateUsers.push({
        user, events: events.length,
        reason: numNote + (ambiguous ? `ambiguous name: ${ambiguous.map(a => `${a.names[0]} (${a.code})`).join(' / ')}` : 'no employee matched'),
      });
      continue;
    }
    if (!byCode.has(emp.code) && !extraByCode.has(emp.code)) extraByCode.set(emp.code, emp); // name-matched active-only
    gateUsersMatched++;
    for (const ev of events) {
      gateMatchedEvents++;
      const k = `${emp.code}|${ev.dateKey}`;
      const g = gateByEmpDay.get(k) ?? { ins: [], outs: [] };
      (ev.dir === 'in' ? g.ins : g.outs).push(ev.cands);
      gateByEmpDay.set(k, g);
    }
  }

  // leaves: expand approved ranges into per-day map keyed by canonical code,
  // clipped to the report period; the un-appliable ones get an explicit reason
  const leaveByEmpDay = new Map<string, string>();
  const unresolvedLeaves: MergeResult['unresolvedLeaves'] = [];
  let leaveRowsApplied = 0, leavesOutsidePeriod = 0;
  for (const lv of leaves) {
    let emp = byNew.get(lv.empNo) ?? byCode.get(lv.empNo);
    if (!emp) {
      const a = activeByAnyNo.get(lv.empNo);
      if (a) emp = extraEmp(a);
    }
    if (!emp) {
      unresolvedLeaves.push({
        empNo: lv.empNo, name: lv.name, type: lv.type, from: lv.fromKey, to: lv.toKey,
        reason: 'employee number not found in TAS or the Active list',
      });
      continue;
    }
    const days = eachDay(lv.fromKey, lv.toKey).filter(d => d >= periodMin && d <= periodMax);
    if (days.length === 0) {
      leavesOutsidePeriod++;
      unresolvedLeaves.push({
        empNo: lv.empNo, name: lv.name, type: lv.type, from: lv.fromKey, to: lv.toKey,
        reason: `dates are outside the report period (${periodMin} → ${periodMax})`,
      });
      continue;
    }
    leaveRowsApplied++;
    for (const day of days) leaveByEmpDay.set(`${emp.code}|${day}`, lv.type);
  }

  // per-row merge, shared by real TAS rows and synthesized 'Not in TAS' rows
  const rows: MergedRow[] = [];
  let statusUpgraded = 0, punchesImproved = 0, leaveDaysApplied = 0;
  const mergeOne = (r: TasRow, emp: EmployeeRef): MergedRow => {
    const k = `${emp.code}|${r.dateKey}`;
    const g = gateByEmpDay.get(k);
    const resolved = g ? resolveGateDay(r, g) : { ins: [], outs: [] };

    // earliest IN across TAS + gate; latest OUT across TAS + gate
    const ins = [r.timeIn, ...resolved.ins].filter((x): x is number => x !== null);
    const outs = [r.timeOut, ...resolved.outs].filter((x): x is number => x !== null);
    const effIn = ins.length ? Math.min(...ins) : null;
    const effOut = outs.length ? Math.max(...outs) : null;
    const inSource: MergedRow['inSource'] = effIn === null ? '' : effIn === r.timeIn ? 'TAS' : 'Car Gate';
    const outSource: MergedRow['outSource'] = effOut === null ? '' : effOut === r.timeOut ? 'TAS' : 'Car Gate';
    const changed = (effIn !== r.timeIn) || (effOut !== r.timeOut);
    if (changed) punchesImproved++;

    const m: MergedRow = { ...r, newNo: emp.newNo, leaveType: '', inSource, outSource };
    m.timeIn = effIn; m.timeOut = effOut;

    if (changed && effIn !== null && effOut !== null) {
      const total = effOut >= effIn ? effOut - effIn : effOut + 1440 - effIn; // overnight-safe
      m.totalMin = total;
      m.lateMin = m.schedIn !== null && effIn > m.schedIn ? effIn - m.schedIn : null;
      const schedOutAbs = m.schedOut !== null && m.schedIn !== null && m.schedOut < m.schedIn ? m.schedOut + 1440 : m.schedOut;
      const effOutAbs = effOut >= effIn ? effOut : effOut + 1440;
      m.earlyMin = schedOutAbs !== null && effOutAbs < schedOutAbs ? schedOutAbs - effOutAbs : null;
      m.shortageMin = m.requiredMin !== null && total < m.requiredMin ? m.requiredMin - total : null;
      m.regularMin = m.requiredMin !== null ? Math.min(total, m.requiredMin) : total;
    }
    // status upgrade from gate punches
    const st = m.status.toLowerCase();
    if (ABSENTISH.has(st)) {
      if (effIn !== null && effOut !== null) { m.status = 'Present'; statusUpgraded++; }
      else if (effIn !== null && st !== 'missing out') { m.status = 'Missing Out'; statusUpgraded++; }
      else if (effOut !== null && effIn === null && st !== 'missing in') { m.status = 'Missing In'; statusUpgraded++; }
    }
    // approved leave: never show absence on covered days (all leave types)
    const lvType = leaveByEmpDay.get(k);
    if (lvType) {
      m.leaveType = lvType;
      leaveDaysApplied++;
      if (ABSENTISH.has(m.status.toLowerCase())) {
        m.status = lvType;
        m.lateMin = null; m.earlyMin = null; m.shortageMin = null;
      }
    }
    return m;
  };

  for (const r of tas) rows.push(mergeOne(r, byCode.get(r.code)!));

  // Active-list employees missing from TAS: synthesize rows for the days where
  // gate punches or approved leave prove something happened inside the period
  let employeesAddedNotInTas = 0;
  for (const emp of extraByCode.values()) {
    const dayKeys = new Set<string>();
    for (const key of gateByEmpDay.keys()) {
      if (key.startsWith(`${emp.code}|`)) dayKeys.add(key.slice(emp.code.length + 1));
    }
    for (const key of leaveByEmpDay.keys()) {
      if (key.startsWith(`${emp.code}|`)) dayKeys.add(key.slice(emp.code.length + 1));
    }
    const inPeriod = [...dayKeys].filter(d => d >= periodMin && d <= periodMax).sort();
    if (inPeriod.length === 0) continue;
    employeesAddedNotInTas++;
    for (const dateKey of inPeriod) {
      rows.push(mergeOne({
        empType: 'Not in TAS', company: commonCompany, code: emp.code, name: emp.names[0],
        dateKey, shift: '', status: '', schedIn: null, schedOut: null, timeIn: null, timeOut: null,
        totalMin: null, requiredMin: null, lateMin: null, earlyMin: null,
        regularMin: null, otMin: null, shortageMin: null, holidayOtMin: null,
      }, emp));
    }
  }

  return {
    rows,
    summary: {
      employees: employees.length,
      days: new Set(tas.map(r => r.dateKey)).size,
      gateEvents: gate.length, gateMatchedEvents,
      gateUsersMatched, gateUsersMatchedByNumber, gateUsersUnmatched: unmatchedGateUsers.length,
      leaveRowsApplied, leaveDaysApplied, statusUpgraded, punchesImproved,
      employeesAddedNotInTas, leavesOutsidePeriod,
    },
    unmatchedGateUsers: unmatchedGateUsers.sort((a, b) => b.events - a.events),
    unresolvedLeaves,
  };
}

/** Header labels for the output sheet — the TAS column design + merge extras. */
export const MERGED_HEADERS = [
  'Employee Type', 'Company', 'Employee Code', 'Emp No. (New)', 'Employee Name', 'Date',
  'Shift Code', 'Status', 'Scheduled IN', 'Scheduled OUT', 'Time In', 'Time Out',
  'Total Hours', 'Required Hours', 'Late Coming', 'Early Departure', 'Regular Hours',
  'Normal OT Hrs', 'Shortage Hours', 'Holiday OT Hrs', 'Leave Type', 'IN Source', 'OUT Source',
];

export const mergedRowCells = (m: MergedRow): (string | number)[] => [
  m.empType, m.company, m.code, m.newNo ?? '', m.name, m.dateKey,
  m.shift, m.status, fmtHm(m.schedIn), fmtHm(m.schedOut), fmtHm(m.timeIn), fmtHm(m.timeOut),
  fmtDur(m.totalMin), fmtDur(m.requiredMin), fmtDur(m.lateMin), fmtDur(m.earlyMin), fmtDur(m.regularMin),
  fmtDur(m.otMin), fmtDur(m.shortageMin), fmtDur(m.holidayOtMin), m.leaveType, m.inSource, m.outSource,
];
