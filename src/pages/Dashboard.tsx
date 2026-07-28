// FR-44 — real-time dashboards & value-added analytics.
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { MIN_PER_DAY, PERIOD_MONTH, PERIOD_YEAR, fmtDate, fmtDur } from '../domain/model';
import type { HrAlert } from '../domain/alerts';

function Rank({ title, items, unit }: { title: string; items: { who: string; val: number; disp?: string }[]; unit?: string }) {
  const max = Math.max(1, ...items.map(i => i.val));
  return (
    <div className="panel">
      <h4>{title}</h4>
      <ul className="ranklist">
        {items.map((i, idx) => (
          <li key={idx}>
            <span className="who">{i.who}</span>
            <span className="bar" style={{ width: `${Math.round((i.val / max) * 120)}px` }} />
            <span className="val">{i.disp ?? `${i.val}${unit ?? ''}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const s = useStore();
  const { employees, fteResults, casualSummaries, punches, t, lang } = s;
  // period filter (modification request #4)
  const [fromDay, setFromDay] = useState(0);
  const [toDay, setToDay] = useState(29);

  const stats = useMemo(() => {
    const deptLate = new Map<string, number>();
    const deptDays = new Map<string, { late: number; total: number }>();
    const empOt = new Map<string, number>();
    const empAbs = new Map<string, number>();
    let exceptions = 0, otTotal = 0, expected = 0, punched = 0;

    for (const emp of employees) {
      const days = fteResults.get(emp.no)!;
      for (const d of days) {
        if (d.day < fromDay || d.day > toDay) continue;
        if (d.status === 'worked' || d.status === 'holiday-worked' || d.status === 'missing-out' || d.status === 'missing-in') {
          punched++;
          expected++;
        } else if (d.status === 'absent') expected++;
        if (d.status === 'missing-out' || d.status === 'missing-in') exceptions++;
        if (d.lateIn > 0) {
          deptLate.set(emp.dept, (deptLate.get(emp.dept) ?? 0) + 1);
        }
        const dd = deptDays.get(emp.dept) ?? { late: 0, total: 0 };
        if (d.status === 'worked') { dd.total++; if (d.lateIn > 0) dd.late++; }
        deptDays.set(emp.dept, dd);
        otTotal += d.otNormal + d.otHoliday;
        if (d.otNormal + d.otHoliday > 0) empOt.set(emp.no, (empOt.get(emp.no) ?? 0) + d.otNormal + d.otHoliday);
        if (d.status === 'absent') empAbs.set(emp.no, (empAbs.get(emp.no) ?? 0) + 1);
      }
    }

    // "On site now" — snapshot at 10:00 on the simulated today
    const snap = s.cfg.simulatedToday * MIN_PER_DAY + 10 * 60;
    const onSiteKeys = new Set<string>();
    const lastEvent = new Map<string, 'in' | 'out'>();
    for (const p of punches) {
      if (p.deviceType === 'canteen1' || p.deviceType === 'canteen2') continue;
      if (p.t <= snap && p.t > snap - 16 * 60) lastEvent.set(p.key, p.dir);
    }
    for (const [k, dir] of lastEvent) if (dir === 'in') onSiteKeys.add(k);

    const name = (no: string) => {
      const e = employees.find(x => x.no === no);
      return e ? (lang === 'ar' ? e.nameAr : e.name) : no;
    };

    const punctual = [...deptDays.entries()]
      .filter(([, v]) => v.total > 20)
      .map(([dept, v]) => ({ who: dept, val: Math.round((1 - v.late / v.total) * 100), disp: `${Math.round((1 - v.late / v.total) * 100)}%` }))
      .sort((a, b) => b.val - a.val).slice(0, 5);
    const lateDepts = [...deptLate.entries()].map(([who, val]) => ({ who, val }))
      .sort((a, b) => b.val - a.val).slice(0, 5);
    const otTop = [...empOt.entries()].map(([no, val]) => ({ who: `${name(no)} (${no})`, val, disp: fmtDur(val) }))
      .sort((a, b) => b.val - a.val).slice(0, 10);
    const absTop = [...empAbs.entries()].map(([no, val]) => ({ who: `${name(no)} (${no})`, val }))
      .sort((a, b) => b.val - a.val).slice(0, 8);

    return {
      punctual, lateDepts, otTop, absTop, exceptions, otTotal,
      onSite: onSiteKeys.size,
      compliance: expected ? Math.round((punched / expected) * 100) : 100,
    };
  }, [employees, fteResults, punches, s.cfg, lang, fromDay, toDay]);

  const casualPayroll = [...casualSummaries.values()].reduce((sum, c) => sum + c.totalSalary, 0);

  const dayInput = (v: number, set: (n: number) => void) => (
    <input type="date" value={`2026-06-${String(v + 1).padStart(2, '0')}`}
      min="2026-06-01" max="2026-06-30"
      onChange={e => {
        const d = new Date(e.target.value + 'T00:00:00Z');
        if (d.getUTCFullYear() === PERIOD_YEAR && d.getUTCMonth() === PERIOD_MONTH) set(d.getUTCDate() - 1);
      }} />
  );

  return (
    <div className="page">
      <div className="toolbar">
        <label className="chk">{t('from')}</label>
        {dayInput(fromDay, setFromDay)}
        <label className="chk">{t('to')}</label>
        {dayInput(toDay, setToDay)}
      </div>
      <div className="cards">
        <div className="card"><div className="kpi">{stats.onSite}</div><div className="label">{t('onSiteNow')}</div></div>
        <div className="card">
          <div className={`kpi ${stats.compliance >= 95 ? '' : 'warn'}`}>{stats.compliance}%</div>
          <div className="label">{t('clockCompliance')} — {t('kpiVsTarget')}</div>
        </div>
        <div className="card"><div className={`kpi ${stats.exceptions ? 'warn' : ''}`}>{stats.exceptions}</div><div className="label">{t('openExceptions')}</div></div>
        <div className="card"><div className="kpi">{fmtDur(stats.otTotal)}</div><div className="label">{t('otHoursMtd')}</div></div>
        <div className="card"><div className="kpi">{Math.round(casualPayroll).toLocaleString()}</div><div className="label">{t('casualSummary')} — {t('sar')}</div></div>
        <div className="card"><div className={`kpi ${s.hrAlerts.length ? 'warn' : ''}`}>{s.hrAlerts.length}</div><div className="label">{t('hrAlerts')}</div></div>
      </div>

      {s.hrAlerts.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h4>⚠️ {t('alertsPanel')}</h4>
          <table>
            <thead><tr><th>{t('severity')}</th><th>{t('by')}</th><th>{t('employee')}</th><th>{t('what')}</th><th>{t('date')}</th></tr></thead>
            <tbody>
              {s.hrAlerts.map((a: HrAlert, i: number) => {
                const emp = employees.find(e => e.no === a.target);
                const cas = s.casuals.find(c => c.iqama === a.target);
                const who = emp ? (lang === 'ar' ? emp.nameAr : emp.name) : cas ? (lang === 'ar' ? cas.nameAr : cas.name) : a.target;
                const detail =
                  a.kind === 'big-shift' ? `${t('kindBigShift')} — ${fmtDur(a.value)}`
                    : a.kind === 'ot-concentration' ? `${t('kindOtConc')} — ×${a.value} ${t('times')}`
                    : a.kind === 'dayoff-ot' ? `${t('kindDayoffOt')} (${fmtDur(a.value)})`
                    : `${t('kindVolume')} — ${a.value} ${t('edits')}`;
                return (
                  <tr key={i}>
                    <td><span className={`pill ${a.severity === 'high' ? 'bad' : 'warn'}`}>{t(a.severity === 'high' ? 'sevHigh' : 'sevMedium')}</span></td>
                    <td>{a.by}</td>
                    <td>{a.target === '—' ? '—' : `${who} (${a.target})`}</td>
                    <td>{detail}</td>
                    <td>{a.day !== undefined ? fmtDate(a.day) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="note">{t('alertsNote')}</div>
        </div>
      )}
      <div className="grid-2">
        <Rank title={t('topPunctualDepts')} items={stats.punctual} />
        <Rank title={t('topLateDepts')} items={stats.lateDepts} />
        <Rank title={t('topOtEmployees')} items={stats.otTop} />
        <Rank title={t('topAbsence')} items={stats.absTop} unit=" d" />
      </div>
    </div>
  );
}
