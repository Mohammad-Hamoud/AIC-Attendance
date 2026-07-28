// FR-28..32 — casual master data, timesheets, incentives, violations; FR-42 casual reports.
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { fmtDate, fmtTime, fmtDur } from '../domain/model';
import { EditModal } from './Attendance';
import { useSort, sortRows, Th } from './sort';

export default function Casuals() {
  const s = useStore();
  const { casuals, casualResults, casualSummaries, incentives, violations, t, lang, cfg } = s;
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ key: string; day: number; inT: number | null; outT: number | null; label: string } | null>(null);

  const sel = casuals.find(c => c.iqama === selected) ?? null;
  const expiryLabel = (day: number) => {
    const expired = day < cfg.simulatedToday;
    const soon = !expired && day - cfg.simulatedToday <= 60;
    return (
      <span className={`pill ${expired ? 'bad' : soon ? 'warn' : 'ok'}`}>
        {fmtDate(Math.min(day, 364))}{expired ? ` · ${t('hcExpired').split(' ')[0]}` : ''}
      </span>
    );
  };

  const totals = useMemo(() => {
    let salary = 0;
    for (const c of casuals) salary += casualSummaries.get(c.iqama)?.totalSalary ?? 0;
    return { salary };
  }, [casuals, casualSummaries]);

  const masterSort = useSort();
  const sortedCasuals = useMemo(() =>
    sortRows(casuals, masterSort, (c, k) => ({
      iqama: c.iqama, name: lang === 'ar' ? c.nameAr : c.name, supplier: c.supplier,
      supervisor: c.supervisor, religion: c.religion, dept: c.dept, jobTitle: c.jobTitle,
      salary: c.monthlySalary, hc: c.healthCardExpiryDay, ajeer: c.ajeerExpiryDay,
      status: c.active ? 1 : 0, incentive: incentives[c.iqama] ?? 0,
      violations: violations[c.iqama]?.count ?? 0,
      total: casualSummaries.get(c.iqama)?.totalSalary ?? 0,
    } as Record<string, unknown>)[k]),
  [casuals, masterSort.key, masterSort.dir, lang, incentives, violations, casualSummaries]);
  const daySort = useSort();

  return (
    <div className="page">
      {!sel && <>
        <div className="cards">
          <div className="card"><div className="kpi">{casuals.filter(c => c.active).length}</div><div className="label">{t('active')} — {t('casuals')}</div></div>
          <div className="card"><div className="kpi">{Math.round(totals.salary).toLocaleString()}</div><div className="label">{t('totalSalary')} ({t('sar')})</div></div>
          <div className="card"><div className="kpi warn">{casuals.filter(c => c.healthCardExpiryDay - cfg.simulatedToday <= 60 || c.ajeerExpiryDay - cfg.simulatedToday <= 60).length}</div><div className="label">{t('expiryAlerts')}</div></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <Th k="iqama" label={t('iqama')} sort={masterSort} /><Th k="name" label={t('empName')} sort={masterSort} />
              <Th k="supplier" label={t('supplier')} sort={masterSort} /><Th k="supervisor" label={t('supervisor')} sort={masterSort} />
              <Th k="religion" label={t('religion')} sort={masterSort} /><Th k="dept" label={t('dept')} sort={masterSort} />
              <Th k="jobTitle" label={t('jobTitle')} sort={masterSort} /><Th k="salary" label={t('monthlySalary')} sort={masterSort} />
              <Th k="hc" label={t('healthCard')} sort={masterSort} /><Th k="ajeer" label={t('ajeer')} sort={masterSort} />
              <Th k="status" label={t('status')} sort={masterSort} /><Th k="incentive" label={t('incentive')} sort={masterSort} />
              <Th k="violations" label={t('violations')} sort={masterSort} /><Th k="total" label={t('totalSalary')} sort={masterSort} /><th></th>
            </tr></thead>
            <tbody>
              {sortedCasuals.map(c => {
                const sum = casualSummaries.get(c.iqama)!;
                return (
                  <tr key={c.iqama}>
                    <td>{c.iqama}</td>
                    <td>{lang === 'ar' ? c.nameAr : c.name}</td>
                    <td>{c.supplier}</td>
                    <td>{c.supervisor}</td>
                    <td>{t(c.religion === 'muslim' ? 'muslim' : 'nonMuslim')}</td>
                    <td>{c.dept}</td>
                    <td>{c.jobTitle}</td>
                    <td>{c.monthlySalary.toLocaleString()}</td>
                    <td>{expiryLabel(c.healthCardExpiryDay)}</td>
                    <td>{expiryLabel(c.ajeerExpiryDay)}</td>
                    <td><span className={`pill ${c.active ? 'ok' : 'bad'}`}>{t(c.active ? 'active' : 'inactive')}</span></td>
                    <td>{incentives[c.iqama] ?? 0}</td>
                    <td>{violations[c.iqama]?.count ?? 0}</td>
                    <td><b>{sum.totalSalary.toLocaleString()}</b></td>
                    <td><button className="link" onClick={() => setSelected(c.iqama)}>{t('timesheet')}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {sel && (() => {
        const manualLabel = (d: { inManual: boolean; outManual: boolean }) =>
          d.inManual && d.outManual ? t('manualBoth') : d.inManual ? t('manualIn') : d.outManual ? t('manualOut') : '';
        const reasonOf = (day: number) =>
          s.edits.find(e => e.key === sel.iqama && e.day === day)?.reason ?? '';
        const statusLabel = (d: { status: string }) =>
          d.status === 'worked' ? t('worked')
            : d.status === 'holiday-worked' ? t('holidayWorked')
            : d.status === 'day-off' ? t('dayOff')
            : d.status === 'missing-out' ? t('missingOut')
            : d.status === 'missing-in' ? t('missingIn')
            : t('absent');
        const days = sortRows(casualResults.get(sel.iqama)!, daySort, (d, k) => ({
          date: d.day, status: statusLabel(d), in: d.inT ?? -1, out: d.outT ?? -1,
          shift: d.shiftCode ?? '', shiftIn: d.shiftStart ?? -1, shiftOut: d.shiftEnd ?? -1,
          shortage: d.shortage, worked: d.worked, lateIn: d.lateIn, earlyOut: d.earlyOut,
          ot: d.otMin, pay: d.dailyPay, manual: manualLabel(d), reason: reasonOf(d.day),
        } as Record<string, unknown>)[k]);
        const sum = casualSummaries.get(sel.iqama)!;
        return (
          <>
            <div className="toolbar">
              <button className="ghost" onClick={() => setSelected(null)}>←</button>
              <h2 style={{ margin: 0 }}>{lang === 'ar' ? sel.nameAr : sel.name} · {sel.iqama} — {t('timesheet')}</h2>
            </div>
            <div className="cards">
              <div className="card"><div className="kpi">{sum.daysWorked}</div><div className="label">{t('daysWorked')}</div></div>
              <div className="card"><div className="kpi">{sum.attendancePay.toLocaleString()}</div><div className="label">{t('attendancePay')} ({t('sar')})</div></div>
              <div className="card"><div className="kpi">{sum.incentive}</div><div className="label">{t('incentive')}</div></div>
              <div className="card"><div className="kpi bad">−{sum.deduction}</div><div className="label">{t('deduction')} ({violations[sel.iqama]?.count ?? 0} {t('violations')})</div></div>
              <div className="card"><div className="kpi">{sum.totalSalary.toLocaleString()}</div><div className="label">{t('totalSalary')} ({t('sar')})</div></div>
            </div>
            {violations[sel.iqama]?.notes.length ? (
              <div className="panel" style={{ marginBottom: 14 }}>
                <h4>{t('violations')}</h4>
                {violations[sel.iqama].notes.map((n, i) => <div key={i} className="note">• {n}</div>)}
              </div>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <Th k="date" label={t('date')} sort={daySort} /><Th k="status" label={t('status')} sort={daySort} />
                  <Th k="in" label={t('in')} sort={daySort} /><Th k="out" label={t('out')} sort={daySort} />
                  <Th k="shift" label={t('shiftName')} sort={daySort} /><Th k="shiftIn" label={t('shiftIn')} sort={daySort} />
                  <Th k="shiftOut" label={t('shiftOut')} sort={daySort} /><Th k="shortage" label={t('shortageHours')} sort={daySort} />
                  <Th k="worked" label={t('totalHours')} sort={daySort} /><Th k="lateIn" label={t('lateIn')} sort={daySort} />
                  <Th k="earlyOut" label={t('earlyOut')} sort={daySort} /><Th k="ot" label={t('ot')} sort={daySort} />
                  <Th k="pay" label={t('calculatedDailySalary')} sort={daySort} />
                  <Th k="manual" label={t('manualTag')} sort={daySort} /><Th k="reason" label={t('editReason')} sort={daySort} /><th></th>
                </tr></thead>
                <tbody>
                  {days.map(d => (
                    <tr key={d.day}>
                      <td>{fmtDate(d.day)}</td>
                      <td>{d.status === 'worked' ? <span className="pill ok">{t('worked')}</span>
                        : d.status === 'holiday-worked' ? <span className="pill info">{t('holidayWorked')} ×1.5</span>
                        : d.status === 'day-off' ? <span className="pill muted">{t('dayOff')}</span>
                        : d.status === 'missing-out' ? <span className="pill bad">{t('missingOut')}</span>
                        : d.status === 'missing-in' ? <span className="pill bad">{t('missingIn')}</span>
                        : <span className="pill bad">{t('absent')}</span>}</td>
                      <td>{fmtTime(d.inT)}</td>
                      <td>{fmtTime(d.outT)}</td>
                      <td>{d.shiftCode ?? '—'}</td>
                      <td>{fmtTime(d.shiftStart)}</td>
                      <td>{fmtTime(d.shiftEnd)}</td>
                      <td>{d.shortage ? fmtDur(d.shortage) : ''}</td>
                      <td>{d.worked ? fmtDur(d.worked) : ''}</td>
                      <td>{d.lateIn ? fmtDur(d.lateIn) : ''}</td>
                      <td>{d.earlyOut ? fmtDur(d.earlyOut) : ''}</td>
                      <td>{d.otMin ? fmtDur(d.otMin) : ''}</td>
                      <td><b>{d.dailyPay ? d.dailyPay.toFixed(2) : ''}</b></td>
                      <td>{manualLabel(d) && <span className="pill info">✎ {manualLabel(d)}</span>}</td>
                      <td>{reasonOf(d.day)}</td>
                      <td><button className="link" onClick={() => setEdit({
                        key: sel.iqama, day: d.day, inT: d.inT, outT: d.outT,
                        label: lang === 'ar' ? sel.nameAr : sel.name,
                      })}>{t('edit')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
      {edit && <EditModal target={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
