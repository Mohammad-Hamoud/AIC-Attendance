// Merge engine tests — fixtures mirror the real TAS / Car Gate / Leaves /
// Active list report shapes (title rows, header rows, value conventions).
import { describe, it, expect } from 'vitest';
import {
  detectReportKind, parseTas, parseGate, parseLeaves, parseActive,
  parseTasDur, parseDateKey, nameTokens, matchGateUser, buildMergedReport,
} from './merge';
import type { SheetMatrix } from './merge';

const TAS: SheetMatrix = [
  [],
  [null, null, null, null, null, 'Detailed Report - Detail Report'],
  [null, null, null, null, null, null, null, 'From ‎01-Jun-26 To ‎30-Jun-26'],
  ['Employee\nType', 'Company', 'Employee Code', 'Employee Name', 'Date', null, 'Shift\nCode', null, 'Status',
    'Scheduled\nIN', null, null, 'Scheduled\nOUT', null, 'Time\nIn', 'Time\nOut', null, 'Total\nHours', 'Required\nHours',
    'Late\nComing', 'Early\nDeparture', 'Regular\nHours', 'Normal\nOT\nHrs', 'Shortage\nHours', 'Holiday\nOT\nHrs'],
  // present day with TAS punches
  ['Permanent- Factory', 'Afia International Company', '10486', 'Ahmad Mohammed Al-Amoudi', '01-Jun-26', null, 'I-1', null, 'Present',
    '07:00', null, null, '15:00', null, '07:49', '16:03', null, 8.14, 8, '00:49', null, 8, null, null, null],
  // absent day (gate will rescue it)
  ['Permanent- Factory', 'Afia International Company', '10486', 'Ahmad Mohammed Al-Amoudi', '02-Jun-26', null, 'I-1', null, 'Absent',
    '07:00', null, null, '15:00', null, null, null, null, null, 8, null, null, null, null, null, null],
  // absent day covered by approved leave (via NEW number through active list)
  ['Permanent- Factory', 'Afia International Company', '10486', 'Ahmad Mohammed Al-Amoudi', '03-Jun-26', null, 'I-1', null, 'Absent',
    '07:00', null, null, '15:00', null, null, null, null, null, 8, null, null, null, null, null, null],
  // missing-out day; gate provides a later OUT
  ['Permanent', 'Afia International Company', '0107564', 'Saved Ahmed Shaikh', '01-Jun-26', null, 'OFC-1', null, 'Missing Out',
    '08:00', null, null, '17:00', null, '08:02', null, null, null, 9, null, null, null, null, null, null],
  // employee not in active list — untouched by joins
  ['Permanent- Factory', 'Afia International Company', '10279', 'Mohammed Ajaz Hassan', '01-Jun-26', null, 'I-2', null, 'Weekly Off',
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
];

const GATE: SheetMatrix = [
  ['Event Log'],
  ['Profile: 240,239; Date Range: 01-006-2026 - 30-006-2026'],
  ['User', 'Date/Time', null, 'Event', 'Location', null, null, 'Detailed access status', null, null, null, null, 'Origin'],
  // rescues Ahmad's absent 02-Jun (in + out)
  ['Al Amoudi Ahmad', '02-Jun-2026 6:58:24 ', null, 'Access In', 'Afia- Employee Ent. Gate Barrier- CR- IN', null, null, null, null, null, null, null, 'Terminal'],
  ['Al Amoudi Ahmad', '02-Jun-2026 15:07:11 ', null, 'Access Out', 'Afia- Employee Ent. Gate Barrier- CR- OUT', null, null, null, null, null, null, null, 'Terminal'],
  // earlier IN than TAS on 01-Jun (earliest wins) + rejected event ignored
  ['Al Amoudi Ahmad', '01-Jun-2026 7:31:02 ', null, 'Access In', 'gate', null, null, null, null, null, null, null, 'Terminal'],
  ['Al Amoudi Ahmad', '01-Jun-2026 7:35:00 ', null, 'Rejected Access', 'gate', null, null, null, null, null, null, null, 'Terminal'],
  // provides the missing OUT for Saved Ahmed Shaikh (matched via new-number name)
  ['Shaikh Saved', '01-Jun-2026 17:22:45 ', null, 'Access Out', 'gate', null, null, null, null, null, null, null, 'Terminal'],
  // visitors/trainees never match
  ['Trainee (F) 7', '01-Jun-2026 9:00:00 ', null, 'Access In', 'gate', null, null, null, null, null, null, null, 'Terminal'],
];

const LEAVES: SheetMatrix = [
  ['SFC Leave Report Details'],
  ['Employee Number', 'Employee Name', 'Hire Date', 'Department', 'Job', 'Grade', 'Position', null, 'Legal Employer',
    'Payroll', 'Absence Type', 'Start Date', 'End Date', 'Month', 'Absence Days', 'Absence Category', 'Absence Reason', 'Approval Status', 'Absence Status'],
  // Ahmad (new no 100486) approved annual leave covering 03-Jun
  ['100486', 'Ahmad Mohammed Al Amoudi', '01-Jan-2010', 'Ops', 'Default', '11', 'Operator', null, 'Afia', 'AIC',
    'Annual Leave', '03-Jun-2026', '04-Jun-2026', 'June', '2', 'Annual', null, 'APPROVED', 'SUBMITTED'],
  // denied leave must be ignored
  ['100486', 'Ahmad Mohammed Al Amoudi', '01-Jan-2010', 'Ops', 'Default', '11', 'Operator', null, 'Afia', 'AIC',
    'Sick Leave', '02-Jun-2026', '02-Jun-2026', 'June', '1', 'Sickness', null, 'DENIED', 'SUBMITTED'],
  // unknown employee → exception list
  ['999999', 'Ghost Person', '01-Jan-2020', 'Ops', 'Default', '11', 'X', null, 'Afia', 'AIC',
    'Annual Leave', '05-Jun-2026', '06-Jun-2026', 'June', '2', 'Annual', null, 'APPROVED', 'SUBMITTED'],
];

const ACTIVE: SheetMatrix = [
  ['Old Emp No.', 'Emp No.', 'Emp Name'],
  ['10486', '100486', 'Ahmad Mohammed Al Amoudi'],
  ['107564', '107564', 'Saved Ahmed Shaikh'],
  ['45391', '100020', 'George Joy Elenjical'],
];

describe('report kind detection', () => {
  it('recognizes all four report shapes', () => {
    expect(detectReportKind(TAS)).toBe('tas');
    expect(detectReportKind(GATE)).toBe('gate');
    expect(detectReportKind(LEAVES)).toBe('leaves');
    expect(detectReportKind(ACTIVE)).toBe('active');
  });
});

describe('value conventions', () => {
  it('TAS H.MM duration convention: 8.14 = 8h14m', () => {
    expect(parseTasDur(8.14)).toBe(8 * 60 + 14);
    expect(parseTasDur('8.1400000000000006')).toBe(8 * 60 + 14);
    expect(parseTasDur(8)).toBe(480);
    expect(parseTasDur('00:49')).toBe(49);
  });
  it('date variants normalize to the same key', () => {
    expect(parseDateKey('01-Jun-26')).toBe('2026-06-01');
    expect(parseDateKey('01-Jun-2026')).toBe('2026-06-01');
    expect(parseDateKey('01-Jun-2026 4:18:57 ')).toBe('2026-06-01');
  });
  it('name tokens fuse Al prefixes and drop parentheses', () => {
    expect(nameTokens('Al Amri Abdulrahman')).toEqual(['alamri', 'abdulrahman']);
    expect(nameTokens('Mohannad Al-Jehani')).toEqual(['mohannad', 'aljehani']);
    expect(nameTokens('Al Harthy Abed  (IFI Factory)')).toEqual(['alharthy', 'abed']);
  });
});

describe('gate user matching', () => {
  const employees = [
    { code: '10486', newNo: '100486', names: ['Ahmad Mohammed Al-Amoudi', 'Ahmad Mohammed Al Amoudi'] },
    { code: '107564', newNo: '107564', names: ['Saved Ahmed Shaikh'] },
    { code: '10279', newNo: null, names: ['Mohammed Ajaz Hassan'] },
  ];
  it('matches reordered partial names uniquely', () => {
    expect(matchGateUser('Al Amoudi Ahmad', employees).emp?.code).toBe('10486');
    expect(matchGateUser('Shaikh Saved', employees).emp?.code).toBe('107564');
  });
  it('reports no match for visitors/trainees', () => {
    const r = matchGateUser('Trainee (F) 7', employees);
    expect(r.emp).toBeUndefined();
  });
  it('reports ambiguity instead of guessing', () => {
    const twins = [
      { code: '1', newNo: null, names: ['Mohammed Ali Hassan'] },
      { code: '2', newNo: null, names: ['Mohammed Hassan Omar'] },
    ];
    const r = matchGateUser('Mohammed Hassan', twins);
    expect(r.emp).toBeUndefined();
    expect(r.ambiguous?.length).toBe(2);
  });
});

describe('12-hour gate exports (Speca prints no AM/PM)', () => {
  const GATE12: SheetMatrix = [
    ['Event Log'],
    ['Profile: 240,239'],
    ['User', 'Date/Time', null, 'Event'],
    // office worker, TAS absent: 8:59 in / 4:55 "out" — the out is really 4:55 PM
    ['Shaikh Saved', '01-Jun-2026 8:59:24 ', null, 'Access In'],
    ['Shaikh Saved', '01-Jun-2026 4:55:11 ', null, 'Access Out'],
    // afternoon-shift worker (sched 15:00): "2:58" in is really 14:58
    ['Al Amoudi Ahmad', '07-Jun-2026 2:58:00 ', null, 'Access In'],
    ['Al Amoudi Ahmad', '07-Jun-2026 11:07:00 ', null, 'Access Out'],
  ];
  const TAS12: SheetMatrix = [
    ['Employee Type', 'Company', 'Employee Code', 'Employee Name', 'Date', 'Shift Code', 'Status',
      'Scheduled IN', 'Scheduled OUT', 'Time In', 'Time Out', 'Total Hours', 'Required Hours',
      'Late Coming', 'Early Departure', 'Regular Hours', 'Normal OT Hrs', 'Shortage Hours', 'Holiday OT Hrs'],
    ['Permanent', 'Afia', '0107564', 'Saved Ahmed Shaikh', '01-Jun-26', 'OFC-1', 'Absent',
      null, null, null, null, null, 9, null, null, null, null, null, null],
    ['Permanent- Factory', 'Afia', '10486', 'Ahmad Mohammed Al-Amoudi', '07-Jun-26', 'I-2', 'Absent',
      '15:00', '23:00', null, null, null, 8, null, null, null, null, null, null],
  ];
  it('detects 12h mode: every event carries two candidates', () => {
    const evs = parseGate(GATE12);
    expect(evs[0].cands).toEqual([8 * 60 + 59, 20 * 60 + 59]);
  });
  it('office day resolves to 08:59 → 16:55 (not a 20-hour day)', () => {
    const res = buildMergedReport(parseTas(TAS12), parseGate(GATE12), [], parseActive(ACTIVE));
    const r = res.rows.find(x => x.code === '107564' && x.dateKey === '2026-06-01')!;
    expect(r.timeIn).toBe(8 * 60 + 59);
    expect(r.timeOut).toBe(16 * 60 + 55);
    expect(r.status).toBe('Present');
  });
  it('afternoon shift resolves against the schedule: 2:58 → 14:58, 11:07 → 23:07', () => {
    const res = buildMergedReport(parseTas(TAS12), parseGate(GATE12), [], parseActive(ACTIVE));
    const r = res.rows.find(x => x.code === '10486' && x.dateKey === '2026-06-07')!;
    expect(r.timeIn).toBe(14 * 60 + 58);
    expect(r.timeOut).toBe(23 * 60 + 7);
  });
  it('a 24h export passes through untouched (hours ≥ 13 present)', () => {
    const evs = parseGate(GATE);
    expect(evs.every(e => e.cands.length === 1)).toBe(true);
  });
});

describe('gate export with the new ID column (employee numbers, some as new(old))', () => {
  const GATE_ID: SheetMatrix = [
    ['Event Log'],
    ['Profile: 239,240; Date Range: 01-006-2026 - 30-006-2026'],
    ['ID', 'User', 'Date/Time', 'Event', 'Location'],
    // new(old) combo — resolves by number even though the name alone is ambiguous rubbish
    ['100486(10486)', 'A. A.', '02-Jun-2026 6:58:24 ', 'Access In'],
    ['100486(10486)', 'A. A.', '02-Jun-2026 15:07:11 ', 'Access Out'],
    // plain new number only
    ['107564', 'Shaikh S.', '01-Jun-2026 17:22:45 ', 'Access Out'],
    // old number only (bridges via active list old→new… and is the TAS code itself)
    ['10486', 'Whoever', '01-Jun-2026 7:31:02 ', 'Access In'],
    // number not known anywhere + name matches nothing → exception mentions the number
    ['555555', 'Mystery Person', '01-Jun-2026 9:00:00 ', 'Access In'],
    // empty ID + name matches → name fallback still works
    ['', 'Al Amoudi Ahmad', '01-Jun-2026 18:40:00 ', 'Access Out'],
    // empty ID + trainee → unmatched as before
    ['', 'Trainee (F) 7', '01-Jun-2026 9:00:00 ', 'Access In'],
  ];
  const res = buildMergedReport(parseTas(TAS), parseGate(GATE_ID), [], parseActive(ACTIVE));
  const row = (code: string, dateKey: string) => res.rows.find(r => r.code === code && r.dateKey === dateKey)!;

  it('parses single, dual-bracket and empty IDs', () => {
    const evs = parseGate(GATE_ID);
    expect(evs[0].empNos).toEqual(['100486', '10486']);
    expect(evs[2].empNos).toEqual(['107564']);
    expect(evs[5].empNos).toEqual([]);
  });
  it('numbers are authoritative: unusable names still match by ID', () => {
    const r = row('10486', '2026-06-02');
    expect(r.status).toBe('Present');
    expect(r.inSource).toBe('Car Gate');
    expect(r.outSource).toBe('Car Gate');
  });
  it('old-only and new-only numbers both bridge to the TAS employee', () => {
    const r = row('10486', '2026-06-01'); // gate IN 07:31 (old no) beats TAS 07:49; name-fallback OUT 18:40 beats TAS 16:03
    expect(r.timeIn).toBe(7 * 60 + 31);
    expect(row('107564', '2026-06-01').timeOut).toBe(17 * 60 + 22);
  });
  it('empty-ID rows fall back to name matching', () => {
    expect(row('10486', '2026-06-01').timeOut).toBe(18 * 60 + 40);
    expect(row('10486', '2026-06-01').outSource).toBe('Car Gate');
  });
  it('unknown numbers are reported with the number in the reason', () => {
    const u = res.unmatchedGateUsers.find(x => x.user === 'Mystery Person')!;
    expect(u.reason).toContain('555555');
    expect(res.unmatchedGateUsers.some(x => x.user === 'Trainee (F) 7')).toBe(true);
  });
  it('summary tracks number-based matches', () => {
    expect(res.summary.gateUsersMatchedByNumber).toBe(3);
    expect(res.summary.gateUsersMatched).toBe(4); // 3 by number + 1 by name
  });
});

describe('employees in the Active list but missing from TAS', () => {
  // George (100020/45391) exists only in the Active list; the period is June (from TAS dates)
  const GATE_X: SheetMatrix = [
    ['Event Log'],
    ['Profile'],
    ['ID', 'User', 'Date/Time', 'Event'],
    ['100020(45391)', 'George Elenjical', '02-Jun-2026 8:01:00 ', 'Access In'],
    ['100020(45391)', 'George Elenjical', '02-Jun-2026 17:03:00 ', 'Access Out'],
    ['100020(45391)', 'George Elenjical', '03-Jun-2026 8:05:00 ', 'Access In'],
  ];
  const LEAVES_X: SheetMatrix = [
    ['SFC Leave Report Details'],
    ['Employee Number', 'Employee Name', 'Hire Date', 'Department', 'Job', 'Grade', 'Position', null, 'Legal Employer',
      'Payroll', 'Absence Type', 'Start Date', 'End Date', 'Month', 'Absence Days', 'Absence Category', 'Absence Reason', 'Approval Status', 'Absence Status'],
    // inside the period, for the not-in-TAS employee → synthesized leave row
    ['100020', 'George Joy Elenjical', '01-Jan-1991', 'Fin', 'Default', '18', 'Director', null, 'Afia', 'AIC',
      'Annual Leave', '01-Jun-2026', '01-Jun-2026', 'June', '1', 'Annual', null, 'APPROVED', 'SUBMITTED'],
    // entirely outside the period (July), for a TAS employee → reported, not silently lost
    ['100486', 'Ahmad Mohammed Al Amoudi', '01-Jan-2010', 'Ops', 'Default', '11', 'Operator', null, 'Afia', 'AIC',
      'Sick Leave', '05-Jul-2026', '05-Jul-2026', 'July', '1', 'Sickness', null, 'APPROVED', 'SUBMITTED'],
    // unknown number → not-found reason
    ['999999', 'Ghost Person', '01-Jan-2020', 'Ops', 'Default', '11', 'X', null, 'Afia', 'AIC',
      'Annual Leave', '05-Jun-2026', '06-Jun-2026', 'June', '2', 'Annual', null, 'APPROVED', 'SUBMITTED'],
  ];
  const res = buildMergedReport(parseTas(TAS), parseGate(GATE_X), parseLeaves(LEAVES_X), parseActive(ACTIVE));
  const g = (dateKey: string) => res.rows.find(r => r.code === '100020' && r.dateKey === dateKey);

  it('synthesizes rows from gate evidence, marked Not in TAS', () => {
    const r = g('2026-06-02')!;
    expect(r.empType).toBe('Not in TAS');
    expect(r.status).toBe('Present');
    expect(r.timeIn).toBe(8 * 60 + 1);
    expect(r.timeOut).toBe(17 * 60 + 3);
    expect(r.inSource).toBe('Car Gate');
    expect(g('2026-06-03')!.status).toBe('Missing Out'); // in-only day
  });
  it('synthesizes leave rows inside the period for not-in-TAS employees', () => {
    expect(g('2026-06-01')!.status).toBe('Annual Leave');
    expect(g('2026-06-01')!.leaveType).toBe('Annual Leave');
  });
  it('reports outside-period leaves with a clear reason instead of dropping them', () => {
    const l = res.unresolvedLeaves.find(x => x.empNo === '100486')!;
    expect(l.reason).toContain('outside the report period');
    expect(res.summary.leavesOutsidePeriod).toBe(1);
  });
  it('unknown employee numbers keep the not-found reason', () => {
    expect(res.unresolvedLeaves.find(x => x.empNo === '999999')!.reason).toContain('not found');
  });
  it('counts the synthesized employees', () => {
    expect(res.summary.employeesAddedNotInTas).toBe(1);
  });
});

describe('buildMergedReport — the full pipeline on realistic fixtures', () => {
  const result = buildMergedReport(parseTas(TAS), parseGate(GATE), parseLeaves(LEAVES), parseActive(ACTIVE));
  const row = (code: string, dateKey: string) => result.rows.find(r => r.code === code && r.dateKey === dateKey)!;

  it('keeps every TAS row and the TAS column data', () => {
    expect(result.rows).toHaveLength(5);
    expect(row('10279', '2026-06-01').status).toBe('Weekly Off'); // untouched employee
  });
  it('earliest IN wins: gate 07:31 beats TAS 07:49; latest OUT stays TAS 16:03', () => {
    const r = row('10486', '2026-06-01');
    expect(r.timeIn).toBe(7 * 60 + 31);
    expect(r.inSource).toBe('Car Gate');
    expect(r.timeOut).toBe(16 * 60 + 3);
    expect(r.outSource).toBe('TAS');
    expect(r.totalMin).toBe(16 * 60 + 3 - (7 * 60 + 31));
    expect(r.lateMin).toBe(31); // recomputed vs 07:00 schedule
  });
  it('gate-only day upgrades Absent → Present with both punches', () => {
    const r = row('10486', '2026-06-02');
    expect(r.status).toBe('Present');
    expect(r.timeIn).toBe(6 * 60 + 58);
    expect(r.timeOut).toBe(15 * 60 + 7);
    expect(r.inSource).toBe('Car Gate');
    expect(r.outSource).toBe('Car Gate');
  });
  it('approved leave replaces Absent (DENIED rows ignored)', () => {
    expect(row('10486', '2026-06-03').status).toBe('Annual Leave');
    expect(row('10486', '2026-06-03').leaveType).toBe('Annual Leave');
    expect(row('10486', '2026-06-02').leaveType).toBe(''); // denied sick leave not applied
  });
  it('gate OUT completes a Missing Out day', () => {
    const r = row('107564', '2026-06-01');
    expect(r.status).toBe('Present');
    expect(r.timeOut).toBe(17 * 60 + 22);
    expect(r.outSource).toBe('Car Gate');
  });
  it('exceptions: trainees unmatched, ghost leave unresolved', () => {
    expect(result.unmatchedGateUsers.map(u => u.user)).toContain('Trainee (F) 7');
    expect(result.unresolvedLeaves.map(l => l.empNo)).toContain('999999');
  });
  it('summary counts are coherent', () => {
    expect(result.summary.employees).toBe(3);
    expect(result.summary.gateUsersMatched).toBe(2);
    expect(result.summary.gateUsersUnmatched).toBe(1);
    expect(result.summary.leaveRowsApplied).toBe(1);
  });
});
