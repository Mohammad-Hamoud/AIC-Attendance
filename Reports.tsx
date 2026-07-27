// FR-33 line-manager portal + FR-39 detailed report view with corrections (FR-38 audit),
// manager day-off grants, supervisor delegation and batch approval.
import { useMemo, useRef, useState } from 'react';
import { useStore, toCsv } from '../store';
import { fmtDate, fmtTime, fmtDur, fmtPct, resolveEditTime, MIN_PER_DAY, PERIOD_MONTH, PERIOD_YEAR } from '../domain/model';
import { requiredCompletion } from '../domain/engine';
import type { FteDayResult } from '../domain/engine';
import { useSort, sortRows, Th } from './sort';

function StatusPill({ d }: { d: FteDayResult }) {
  const s = useStore();
  switch (d.status) {
    case 'worked': return d.lateIn > 0 ? <span className="pill warn">{s.t('late')}</span> : <span className="pill ok">{s.t('worked')}</span>;
    case 'holiday-worked': return <span className="pill info">{s.t('holidayWorked')}</span>;
    case 'missing-out': return <span className="pill bad">{s.t('missingOut')}</span>;
    case 'missing-in': return <span className="pill bad">{s.t('missingIn')}</span>;
    case 'absent': return <span className="pill bad">{s.t('absent')}</span>;
    case 'rest': return <span className="pill muted">{s.t('rest')}</span>;
    case 'day-off': return <span className="pill muted">{s.t('dayOff')}</span>;
    case 'leave': return <span className="pill info">{s.t('leave')}{d.leaveType ? ` · ${d.leaveType}` : ''}</span>;
    default: return <span className="pill muted">{s.t('notEmployed')}</span>;
  }
}

interface EditTarget { key: string; day: number; inT: number | null; outT: number | null; label: string }

export function EditModal({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const s = useStore();
  // time inputs stay uncontrolled: the browser owns partial entry, so a
  // half-typed value keeps its badInput state instead of being clobbered
  const [inBad, setInBad] = useState(false);
  const [outBad, setOutBad] = useState(false);
  const [reason, setReason] = useState('');
  const inRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLInputElement>(null);
  const invalid = inBad || outBad;
  const origIn = target.inT !== null ? fmtTime(target.inT) : '';
  const origOut = target.outT !== null ? fmtTime(target.outT) : '';

  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    try { ref.current?.showPicker(); } catch { /* needs gesture / unsupported */ }
    ref.current?.focus();
  };
  const resetTimes = () => {
    if (inRef.current) inRef.current.value = origIn;
    if (outRef.current) outRef.current.value = origOut;
    setInBad(false); setOutBad(false);
  };

  const save = () => {
    if (!reason.trim() || invalid) return;
    const inV = inRef.current?.value ?? '';
    const outV = outRef.current?.value ?? '';
    // empty/invalid input keeps the original punch — a typo never deletes data
    const inT = resolveEditTime(inV, target.day, target.inT);
    let outT = resolveEditTime(outV, target.day, target.outT);
    const anchor = inT ?? target.inT;
    if (anchor !== null && outT !== null && outT <= anchor) outT += MIN_PER_DAY; // overnight correction
    // flag as manual only what actually changed (FR-04: source stays truthful)
    const changeIn = inT !== target.inT;
    const changeOut = outT !== target.outT;
    if (!changeIn && !changeOut) { onClose(); return; }
    const applied = s.requestEdit({
      key: target.key, day: target.day, inT, outT, changeIn, changeOut,
      origIn: target.inT, origOut: target.outT, // misuse monitor measures the shift size
    }, reason.trim(),
      `${target.label} ${fmtDate(target.day)}: ` +
      (changeIn ? `IN ${fmtTime(target.inT)}→${inV || '—'} ` : '') +
      (changeOut ? `OUT ${fmtTime(target.outT)}→${outV || '—'}` : ''));
    if (!applied) window.alert(s.t('sentForApproval')); // supervisor change queued for the manager
    onClose();
  };

  return (
    // an invalid (half-typed) time blocks dismissal by backdrop click — fix it or press Cancel
    <div className="modal-back" onClick={() => { if (!invalid) onClose(); }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h4>{s.t('editPunch')} — {target.label} · {fmtDate(target.day)}</h4>
        <div className="note">
          {s.t('originalTimes')}: <b>{fmtTime(target.inT)} → {fmtTime(target.outT)}</b>
          {' '}<button className="link" onClick={resetTimes}>{s.t('resetTimes')}</button>
        </div>
        {/* native time inputs (enforced HH:MM) + explicit clock button opening the picker */}
        <div className="row">
          <label>{s.t('in')}</label>
          <input ref={inRef} type="time" defaultValue={origIn} style={inBad ? { outline: '2px solid #c62828' } : undefined}
            onInput={e => setInBad(e.currentTarget.validity.badInput)}
            onBlur={e => setInBad(e.currentTarget.validity.badInput)} />
          <button className="ghost" title={s.t('pickTime')} onClick={() => openPicker(inRef)}>🕐</button>
        </div>
        <div className="row">
          <label>{s.t('out')}</label>
          <input ref={outRef} type="time" defaultValue={origOut} style={outBad ? { outline: '2px solid #c62828' } : undefined}
            onInput={e => setOutBad(e.currentTarget.validity.badInput)}
            onBlur={e => setOutBad(e.currentTarget.validity.badInput)} />
          <button className="ghost" title={s.t('pickTime')} onClick={() => openPicker(outRef)}>🕐</button>
        </div>
        <div className="row"><label>{s.t('reason')}</label><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} /></div>
        {invalid && <div className="note" style={{ color: '#c62828' }}>⚠ {s.t('invalidTime')}</div>}
        <div className="note">{s.t('correctionsNote')}</div>
        <div className="actions">
          <button className="ghost" onClick={onClose}>{s.t('cancel')}</button>
          <button className="primary" onClick={save} disabled={!reason.trim() || invalid}>{s.t('save')}</button>
        </div>
      </div>
    </div>
  );
}

export default function Attendance() {
  const s = useStore();
  const { employees, fteResults, t, lang } = s;
  // NFR-07: line managers and their delegated supervisors are locked to the team
  const lockedMgr = s.role?.type === 'manager' ? s.role.no
    : s.role?.type === 'supervisor' ? s.role.managerNo : null;
  const isManager = s.role?.type === 'manager';
  const isTeamView = lockedMgr !== null;
  const [dept, setDept] = useState('');
  const [mgrFilter, setMgr] = useState('');
  const mgr = lockedMgr ?? mgrFilter;
  const [q, setQ] = useState('');
  const [excOnly, setExcOnly] = useState(false);
  const [fromDay, setFromDay] = useState(0);
  const [toDay, setToDay] = useState(29);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [dayOffEmp, setDayOffEmp] = useState('');
  const [dayOffDate, setDayOffDate] = useState('2026-06-26');
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const depts = useMemo(() => [...new Set(employees.map(e => e.dept))].sort(), [employees]);
  const managers = useMemo(() => employees.filter(e => e.segment === 'manager'), [employees]);
  const team = useMemo(() => employees.filter(e => e.managerNo === mgr), [employees, mgr]);
  const name = (e: { name: string; nameAr: string } | undefined) =>
    e ? (lang === 'ar' ? e.nameAr : e.name) : '—';
  const empName = (no: string) => name(employees.find(e => e.no === no));

  const manualLabel = (d: FteDayResult) =>
    d.inManual && d.outManual ? t('manualBoth') : d.inManual ? t('manualIn') : d.outManual ? t('manualOut') : '';
  const reasonOf = (key: string, day: number) =>
    s.edits.find(e => e.key === key && e.day === day)?.reason ?? '';
  const statusText = (d: FteDayResult) =>
    d.status === 'worked' ? (d.lateIn > 0 ? t('late') : t('worked'))
      : d.status === 'holiday-worked' ? t('holidayWorked')
      : d.status === 'missing-out' ? t('missingOut')
      : d.status === 'missing-in' ? t('missingIn')
      : d.status === 'day-off' ? t('dayOff')
      : d.status === 'leave' ? `${t('leave')}${d.leaveType ? ` · ${d.leaveType}` : ''}`
      : t(d.status === 'rest' ? 'rest' : d.status === 'absent' ? 'absent' : 'notEmployed');

  const sort = useSort();
  const rows = useMemo(() => {
    const out: { emp: typeof employees[0]; d: FteDayResult }[] = [];
    for (const emp of employees) {
      if (dept && emp.dept !== dept) continue;
      if (mgr && emp.managerNo !== mgr) continue;
      if (q && !(`${emp.no} ${emp.name} ${emp.nameAr}`.toLowerCase().includes(q.toLowerCase()))) continue;
      for (const d of fteResults.get(emp.no)!) {
        if (d.day < fromDay || d.day > toDay) continue;
        if (d.status === 'rest' || d.status === 'not-employed') continue;
        // mod request #5: only rows NOT displayed as "Worked" — missing punches,
        // absences and late-ins (shortage alone still renders as Worked, so it's out)
        if (excOnly && !(d.status === 'missing-out' || d.status === 'missing-in' || d.status === 'absent' || d.lateIn > 0)) continue;
        out.push({ emp, d });
      }
    }
    const base = out.sort((a, b) => a.d.day - b.d.day || a.emp.no.localeCompare(b.emp.no));
    return sortRows(base, sort, (r, k) => ({
      empNo: r.emp.no, empName: name(r.emp),
      lineManager: r.emp.managerName ?? '', date: r.d.day, status: statusText(r.d),
      in: r.d.inT ?? -1, out: r.d.outT ?? -1, shift: r.d.shiftCode ?? '',
      shiftIn: r.d.shiftStart ?? -1, shiftOut: r.d.shiftEnd ?? -1,
      worked: r.d.worked, shortage: r.d.shortage, lateIn: r.d.lateIn, earlyOut: r.d.earlyOut,
      ot: r.d.otNormal + r.d.otHoliday,
      completion: requiredCompletion(r.d) ?? -1,
      manual: manualLabel(r.d), reason: reasonOf(r.emp.no, r.d.day),
    } as Record<string, unknown>)[k]);
  }, [employees, fteResults, s.edits, dept, mgr, q, excOnly, fromDay, toDay, sort.key, sort.dir, lang]);

  // #3: the export mirrors exactly what is on screen (filters, sorting, all columns)
  const exportCsv = () => {
    const headers = [t('empNo'), t('empName'), t('lineManager'), t('date'), t('status'), t('in'), t('out'),
      t('shiftName'), t('shiftIn'), t('shiftOut'), t('totalHours'), t('shortageHours'), t('lateIn'),
      t('earlyOut'), t('ot'), t('completionPct'), t('manualTag'), t('editReason')];
    toCsv(headers, rows.map(({ emp, d }) => [
      emp.no, name(emp), emp.managerName ?? '—', fmtDate(d.day), statusText(d),
      fmtTime(d.inT), fmtTime(d.outT), d.shiftCode ?? '—', fmtTime(d.shiftStart), fmtTime(d.shiftEnd),
      d.worked ? fmtDur(d.worked) : '', d.shortage ? fmtDur(d.shortage) : '', d.lateIn ? fmtDur(d.lateIn) : '',
      d.earlyOut ? fmtDur(d.earlyOut) : '', (d.otNormal + d.otHoliday) ? fmtDur(d.otNormal + d.otHoliday) : '',
      fmtPct(requiredCompletion(d)), manualLabel(d), reasonOf(emp.no, d.day),
    ]));
  };

  const dayInput = (v: number, set: (n: number) => void) => (
    <input type="date" value={`2026-06-${String(v + 1).padStart(2, '0')}`}
      min="2026-06-01" max="2026-06-30"
      onChange={e => {
        const d = new Date(e.target.value + 'T00:00:00Z');
        if (d.getUTCFullYear() === PERIOD_YEAR && d.getUTCMonth() === PERIOD_MONTH) set(d.getUTCDate() - 1);
      }} />
  );

  const toDayIdx = (iso: string): number | null => {
    const d = new Date(iso + 'T00:00:00Z');
    if (d.getUTCFullYear() !== PERIOD_YEAR || d.getUTCMonth() !== PERIOD_MONTH) return null;
    return d.getUTCDate() - 1;
  };

  const teamDayOffs = useMemo(
    () => s.dayOffs.filter(g => team.some(e => e.no === g.key)).sort((a, b) => a.day - b.day),
    [s.dayOffs, team],
  );
  const myPending = useMemo(
    () => s.pending.filter(p => p.managerNo === mgr),
    [s.pending, mgr],
  );
  const toggle = (id: number) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChecked = myPending.length > 0 && myPending.every(p => checked.has(p.id));

  return (
    <div className="page">
      <div className="toolbar">
        <input type="text" placeholder={t('searchName')} value={q} onChange={e => setQ(e.target.value)} />
        <select value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">{t('allDepts')}</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {!lockedMgr && (
          <select value={mgr} onChange={e => setMgr(e.target.value)}>
            <option value="">{t('allManagers')}</option>
            {managers.map(m => <option key={m.no} value={m.no}>{name(m)}</option>)}
          </select>
        )}
        <label className="chk">{t('from')}</label>
        {dayInput(fromDay, setFromDay)}
        <label className="chk">{t('to')}</label>
        {dayInput(toDay, setToDay)}
        <label className="chk"><input type="checkbox" checked={excOnly} onChange={e => setExcOnly(e.target.checked)} />{t('exceptionsOnly')}</label>
        <span className="note">{rows.length} {t('showingDays')}</span>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={exportCsv}>{t('exportCsv')}</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <Th k="empNo" label={t('empNo')} sort={sort} /><Th k="empName" label={t('empName')} sort={sort} />
            <Th k="lineManager" label={t('lineManager')} sort={sort} /><Th k="date" label={t('date')} sort={sort} />
            <Th k="status" label={t('status')} sort={sort} /><Th k="in" label={t('in')} sort={sort} />
            <Th k="out" label={t('out')} sort={sort} /><Th k="shift" label={t('shiftName')} sort={sort} />
            <Th k="shiftIn" label={t('shiftIn')} sort={sort} /><Th k="shiftOut" label={t('shiftOut')} sort={sort} />
            <Th k="worked" label={t('totalHours')} sort={sort} />
            <Th k="shortage" label={t('shortageHours')} sort={sort} /><Th k="lateIn" label={t('lateIn')} sort={sort} />
            <Th k="earlyOut" label={t('earlyOut')} sort={sort} /><Th k="ot" label={t('ot')} sort={sort} />
            <Th k="completion" label={t('completionPct')} sort={sort} />
            <Th k="manual" label={t('manualTag')} sort={sort} /><Th k="reason" label={t('editReason')} sort={sort} />
            <th></th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 800).map(({ emp, d }) => {
              const ot = d.otNormal + d.otHoliday;
              const cr = requiredCompletion(d);
              return (
                <tr key={`${emp.no}-${d.day}`}>
                  <td>{emp.no}</td>
                  <td>{name(emp)}</td>
                  <td>{lang === 'ar' ? (employees.find(m => m.no === emp.managerNo)?.nameAr ?? '—') : (emp.managerName ?? '—')}</td>
                  <td>{fmtDate(d.day)}</td>
                  <td><StatusPill d={d} /></td>
                  <td>{fmtTime(d.inT)}</td>
                  <td>{fmtTime(d.outT)}</td>
                  <td>{d.shiftCode ?? '—'}{d.nightAllowanceDay ? ' 🌙' : ''}</td>
                  <td>{fmtTime(d.shiftStart)}</td>
                  <td>{fmtTime(d.shiftEnd)}</td>
                  <td>{d.worked ? fmtDur(d.worked) : ''}</td>
                  <td>{d.shortage ? fmtDur(d.shortage) : ''}</td>
                  <td>{d.lateIn ? fmtDur(d.lateIn) : ''}</td>
                  <td>{d.earlyOut ? fmtDur(d.earlyOut) : ''}</td>
                  <td>{ot ? fmtDur(ot) : ''}{d.uncounted ? ' *' : ''}</td>
                  <td>{cr !== null && cr > 1 ? <b>{fmtPct(cr)}</b> : fmtPct(cr)}</td>
                  <td>{manualLabel(d) && <span className="pill info">✎ {manualLabel(d)}</span>}</td>
                  <td>{reasonOf(emp.no, d.day)}</td>
                  <td><button className="link" onClick={() => setEdit({
                    key: emp.no, day: d.day, inT: d.inT, outT: d.outT,
                    label: name(emp),
                  })}>{t('edit')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="note">{t('uncountedNote')} {t('manualNote')}</div>

      {isTeamView && (
        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="panel">
            <h4>{t('dayOffsPanel')}</h4>
            <div className="toolbar">
              <select value={dayOffEmp} onChange={e => setDayOffEmp(e.target.value)}>
                <option value="">—</option>
                {team.map(e => <option key={e.no} value={e.no}>{name(e)} ({e.no})</option>)}
              </select>
              <input type="date" value={dayOffDate} min="2026-06-01" max="2026-06-30"
                onChange={e => setDayOffDate(e.target.value)} />
              <button className="primary" disabled={!dayOffEmp} onClick={() => {
                const d = toDayIdx(dayOffDate);
                if (d === null || !dayOffEmp) return;
                const applied = s.requestDayOff(dayOffEmp, d);
                if (!applied) window.alert(t('sentForApproval'));
              }}>{t('addDayOffBtn')}</button>
            </div>
            {teamDayOffs.length > 0 && (
              <table>
                <tbody>
                  {teamDayOffs.map(g => (
                    <tr key={`${g.key}-${g.day}`}>
                      <td>{empName(g.key)} ({g.key})</td>
                      <td>{fmtDate(g.day)}</td>
                      <td><span className="pill muted">{t('dayOff')}</span></td>
                      <td>{isManager && <button className="link" onClick={() => s.removeDayOff(g.key, g.day)}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="note">{t('dayOffNote')}</div>
          </div>

          {isManager && (
            <div className="panel">
              <h4>{t('delegateSupervisor')}</h4>
              <div className="toolbar">
                <select value={s.supervisors[mgr] ?? ''} onChange={e => s.setSupervisor(mgr, e.target.value || null)}>
                  <option value="">{t('noneOption')}</option>
                  {team.map(e => <option key={e.no} value={e.no}>{name(e)} ({e.no})</option>)}
                </select>
              </div>
              <div className="note">{t('supervisorRoleDesc')}</div>

              <h4 style={{ marginTop: 16 }}>{t('pendingApprovals')}</h4>
              {myPending.length === 0
                ? <p className="note">{t('noPending')}</p>
                : <>
                    <table>
                      <thead><tr>
                        <th><label className="chk"><input type="checkbox" checked={allChecked}
                          onChange={e => setChecked(e.target.checked ? new Set(myPending.map(p => p.id)) : new Set())} />{t('selectAll')}</label></th>
                        <th>{t('employee')}</th><th>{t('what')}</th><th>{t('reason')}</th><th>{t('by')}</th><th>{t('at')}</th>
                      </tr></thead>
                      <tbody>
                        {myPending.map(p => (
                          <tr key={p.id}>
                            <td><input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} /></td>
                            <td>{empName(p.key)} ({p.key})</td>
                            <td>{p.kind === 'dayoff' ? `${t('dayOff')} · ${fmtDate(p.day)}` : p.label}</td>
                            <td>{p.reason}</td>
                            <td>{p.by}</td>
                            <td>{p.when}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="toolbar" style={{ marginTop: 10 }}>
                      <button className="primary" disabled={checked.size === 0}
                        onClick={() => { s.approvePending([...checked]); setChecked(new Set()); }}>
                        {t('approveSelected')} ({checked.size})
                      </button>
                      <button className="ghost" disabled={checked.size === 0}
                        onClick={() => { s.rejectPending([...checked]); setChecked(new Set()); }}>
                        {t('rejectSelected')}
                      </button>
                    </div>
                  </>}
            </div>
          )}
        </div>
      )}

      {edit && <EditModal target={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
