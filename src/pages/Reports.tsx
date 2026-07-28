// FR-39..FR-43 — reports with the exact PRD column sets and CSV export.
import { useMemo, useState } from 'react';
import { useStore, toCsv } from '../store';
import { fmtDate, fmtTime, fmtDur, fmtPct } from '../domain/model';
import { requiredCompletion } from '../domain/engine';
import { useSort, sortRows, Th } from './sort';

type Tab = 'fteDetailed' | 'fteSummary' | 'casualTimesheet' | 'casualSummary' | 'canteenReport' | 'nightAllowance';
const HR_TABS: Tab[] = ['fteDetailed', 'fteSummary', 'casualTimesheet', 'casualSummary', 'canteenReport', 'nightAllowance'];
const MANAGER_TABS: Tab[] = ['fteDetailed', 'fteSummary']; // team scope only (NFR-07)

export default function Reports() {
  const s = useStore();
  const { casuals, fteResults, casualResults, casualSummaries, canteen, cfg, incentives, t, lang } = s;
  // NFR-07: managers AND their delegated supervisors are locked to the manager's team
  const lockedMgr = s.role?.type === 'manager' ? s.role.no
    : s.role?.type === 'supervisor' ? s.role.managerNo : null;
  const TABS = lockedMgr ? MANAGER_TABS : HR_TABS;
  const employees = useMemo(
    () => (lockedMgr ? s.employees.filter(e => e.managerNo === lockedMgr) : s.employees),
    [s.employees, lockedMgr],
  );
  const [tab, setTab] = useState<Tab>('fteDetailed');
  const sort = useSort();
  const pickTab = (x: Tab) => { setTab(x); sort.reset(); };

  const name = (e: { name: string; nameAr: string }) => (lang === 'ar' ? e.nameAr : e.name);
  // FR-04/FR-38: manual corrections and their mandatory reason are dedicated
  // columns so reports can be filtered on them (survives CSV export)
  const manualLabel = (d: { inManual: boolean; outManual: boolean }) =>
    d.inManual && d.outManual ? t('manualBoth') : d.inManual ? t('manualIn') : d.outManual ? t('manualOut') : '';
  const reasonOf = (key: string, day: number) =>
    s.edits.find(e => e.key === key && e.day === day)?.reason ?? '';
  const statusText = (d: { status: string; lateIn: number }) =>
    d.status === 'worked' ? (d.lateIn > 0 ? t('late') : t('worked'))
      : d.status === 'holiday-worked' ? t('holidayWorked')
      : d.status === 'missing-out' ? t('missingOut')
      : d.status === 'missing-in' ? t('missingIn')
      : d.status === 'day-off' ? t('dayOff')
      : d.status === 'leave' ? t('leave')
      : d.status;

  const report = useMemo(() => {
    switch (tab) {
      case 'fteDetailed': {
        // FR-39 columns — matches the FTE Attendance screen (mod request: exports = website)
        const headers = [t('empNo'), t('empName'), t('lineManager'), t('date'), t('status'), t('in'), t('out'),
          t('shiftName'), t('shiftIn'), t('shiftOut'), t('totalHours'), t('shortageHours'), t('lateIn'), t('earlyOut'),
          t('ot'), t('completionPct'), t('manualTag'), t('editReason')];
        const rows: (string | number)[][] = [];
        for (const emp of employees) {
          for (const d of fteResults.get(emp.no)!) {
            if (d.status === 'rest' || d.status === 'not-employed' || d.status === 'absent' || d.status === 'leave' || d.status === 'day-off') continue;
            rows.push([emp.no, name(emp), emp.managerName ?? '—', fmtDate(d.day), statusText(d),
              fmtTime(d.inT), fmtTime(d.outT),
              d.shiftCode ?? '—', fmtTime(d.shiftStart), fmtTime(d.shiftEnd), fmtDur(d.worked), fmtDur(d.shortage), fmtDur(d.lateIn),
              fmtDur(d.earlyOut), fmtDur(d.otNormal + d.otHoliday), fmtPct(requiredCompletion(d)),
              manualLabel(d), reasonOf(emp.no, d.day)]);
          }
        }
        return { headers, rows };
      }
      case 'fteSummary': {
        // FR-40 totals
        const headers = [t('empNo'), t('empName'), t('dept'), t('totalHours'), t('totalShortage'), t('totalLateIn'),
          t('totalEarlyOut'), t('ot'), t('completionPct')];
        const rows = employees.map(emp => {
          const days = fteResults.get(emp.no)!;
          const sum = (f: (d: typeof days[0]) => number) => days.reduce((a, d) => a + f(d), 0);
          // period completion over days where it is computable (worked days with required hours)
          const cDays = days.filter(d => requiredCompletion(d) !== null);
          const reqSum = cDays.reduce((a, d) => a + d.required, 0);
          const achSum = cDays.reduce((a, d) => a + d.required - d.shortage + d.otNormal, 0);
          return [emp.no, name(emp), emp.dept, fmtDur(sum(d => d.worked)), fmtDur(sum(d => d.shortage)), fmtDur(sum(d => d.lateIn)),
            fmtDur(sum(d => d.earlyOut)), fmtDur(sum(d => d.otNormal + d.otHoliday)),
            fmtPct(reqSum > 0 ? achSum / reqSum : null)];
        });
        return { headers, rows };
      }
      case 'casualTimesheet': {
        // FR-42 casual timesheet template
        const headers = [t('iqama'), t('empName'), t('supplier'), t('supervisor'), t('religion'), 'CC', t('dept'),
          t('date'), t('status'), t('in'), t('out'), t('shiftName'), t('shiftIn'), t('shiftOut'), t('shortageHours'),
          t('totalHours'), t('lateIn'), t('earlyOut'), t('incentive'), t('ot'), t('calculatedDailySalary'),
          t('manualTag'), t('editReason')];
        const rows: (string | number)[][] = [];
        for (const c of casuals) {
          for (const d of casualResults.get(c.iqama)!) {
            if (d.status === 'absent') continue;
            rows.push([c.iqama, name(c), c.supplier, c.supervisor, t(c.religion === 'muslim' ? 'muslim' : 'nonMuslim'),
              c.costCenter, c.dept, fmtDate(d.day), statusText(d),
              fmtTime(d.inT), fmtTime(d.outT), d.shiftCode ?? t('dayOff'),
              fmtTime(d.shiftStart), fmtTime(d.shiftEnd), fmtDur(d.shortage), fmtDur(d.worked), fmtDur(d.lateIn),
              fmtDur(d.earlyOut), incentives[c.iqama] ?? 0, fmtDur(d.otMin), d.dailyPay.toFixed(2),
              manualLabel(d), reasonOf(c.iqama, d.day)]);
          }
        }
        return { headers, rows };
      }
      case 'casualSummary': {
        // FR-42 period summary incl. total salary
        const headers = [t('iqama'), t('empName'), t('supplier'), 'CC', t('dept'), t('jobTitle'),
          t('totalShortage'), t('totalLateIn'), t('totalEarlyOut'), t('ot'), t('attendancePay'),
          t('incentive'), t('deduction'), t('totalSalary')];
        const rows = casuals.map(c => {
          const sum = casualSummaries.get(c.iqama)!;
          return [c.iqama, name(c), c.supplier, c.costCenter, c.dept, c.jobTitle,
            fmtDur(sum.totalShortage), fmtDur(sum.totalLateIn), fmtDur(sum.totalEarlyOut), fmtDur(sum.totalOt),
            sum.attendancePay.toFixed(2), sum.incentive, sum.deduction.toFixed(2), sum.totalSalary.toFixed(2)];
        });
        return { headers, rows };
      }
      case 'canteenReport': {
        // FR-41
        const headers = ['#', t('empName'), t('device1Days'), t('device2Days'), t('amountSar')];
        const byKey = new Map<string, { c1: number; c2: number; amount: number }>();
        for (const ch of canteen) {
          const e = byKey.get(ch.key) ?? { c1: 0, c2: 0, amount: 0 };
          if (ch.device === 'canteen1') e.c1++; else e.c2++;
          e.amount += ch.amount;
          byKey.set(ch.key, e);
        }
        const rows = [...byKey.entries()].map(([key, v]) => {
          const emp = employees.find(e => e.no === key);
          const cas = casuals.find(c => c.iqama === key);
          const label = emp ? name(emp) : cas ? name(cas) : key;
          return [key, label + (emp?.canteenClass === 'vip' ? ' (VIP)' : ''), v.c1, v.c2, v.amount];
        }).sort((a, b) => (b[4] as number) - (a[4] as number));
        return { headers, rows };
      }
      case 'nightAllowance': {
        // FR-19 / BR-12
        const headers = [t('empNo'), t('empName'), t('dept'), t('eligibleDays'), t('amountSar')];
        const rows: (string | number)[][] = [];
        for (const emp of employees) {
          const days = fteResults.get(emp.no)!.filter(d => d.nightAllowanceDay).length;
          if (days > 0) rows.push([emp.no, name(emp), emp.dept, days, days * cfg.nightAllowance]);
        }
        rows.sort((a, b) => (b[4] as number) - (a[4] as number));
        return { headers, rows };
      }
    }
  }, [tab, employees, casuals, fteResults, casualResults, casualSummaries, canteen, incentives, cfg, s.edits, t, lang]);

  const sortedRows = useMemo(
    () => sortRows(report.rows, sort, (row, k) => row[Number(k)]),
    [report, sort.key, sort.dir],
  );

  return (
    <div className="page">
      <div className="tabs">
        {TABS.map(x => (
          <button key={x} className={tab === x ? 'active' : ''} onClick={() => pickTab(x)}>{t(x)}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={() => toCsv(report.headers, sortedRows)}>{t('exportCsv')}</button>
      </div>
      <div className="table-wrap" style={{ maxHeight: '70vh' }}>
        <table>
          <thead><tr>{report.headers.map((h, i) => <Th key={`${tab}-${i}`} k={String(i)} label={h} sort={sort} />)}</tr></thead>
          <tbody>
            {sortedRows.slice(0, 1200).map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">{report.rows.length} rows · {t('period')}</div>
    </div>
  );
}
