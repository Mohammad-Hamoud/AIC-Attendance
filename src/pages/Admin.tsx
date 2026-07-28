// FR-34 HR admin console: Ramadan window, holidays, shift catalogue, policy params, devices, audit trail.
import { useState } from 'react';
import { useStore } from '../store';
import { fmtDate, fmtTime, fmtDur, PERIOD_MONTH, PERIOD_YEAR } from '../domain/model';
import type { ShiftDef, ShiftKind } from '../domain/model';
import { DEVICES } from '../domain/seed';

interface ShiftForm {
  code: string; nameEn: string; kind: ShiftKind; ramadan: boolean;
  start: string; end: string; requiredH: string; night: boolean;
}
const emptyShift: ShiftForm = {
  code: '', nameEn: '', kind: 'field', ramadan: false,
  start: '07:00', end: '15:00', requiredH: '8', night: false,
};
const KIND_ORDER: Record<ShiftKind, number> = { office: 0, field: 1, casual: 2 };

export default function Admin() {
  const s = useStore();
  const { cfg, setCfg, audit, t } = s;
  const [from, setFrom] = useState('2026-06-10');
  const [to, setTo] = useState('2026-06-20');
  const [holidayDate, setHolidayDate] = useState('2026-06-23');
  const [holidayName, setHolidayName] = useState('');
  const [sf, setSf] = useState<ShiftForm>(emptyShift);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [shiftErr, setShiftErr] = useState('');

  const toDayIdx = (iso: string): number | null => {
    const d = new Date(iso + 'T00:00:00Z');
    if (d.getUTCFullYear() !== PERIOD_YEAR || d.getUTCMonth() !== PERIOD_MONTH) return null;
    return d.getUTCDate() - 1;
  };

  const toMinOfDay = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const kindLabel = (k: ShiftKind) => t(k === 'office' ? 'office' : k === 'field' ? 'field' : 'casual');
  const shiftList = Object.values(cfg.shifts).sort((a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Number(!!a.ramadan) - Number(!!b.ramadan) || a.start - b.start);
  const kindCount = (k: ShiftKind) => shiftList.filter(x => x.kind === k).length;

  const startEditShift = (d: ShiftDef) => {
    setEditingCode(d.code);
    setShiftErr('');
    setSf({
      code: d.code, nameEn: d.nameEn, kind: d.kind, ramadan: !!d.ramadan,
      start: fmtTime(d.start), end: fmtTime(d.start + d.durMin),
      requiredH: String(d.required / 60), night: !!d.night,
    });
  };

  const saveShift = () => {
    const code = sf.code.trim().toUpperCase();
    const required = Math.round(Number(sf.requiredH) * 60);
    if (!code || !sf.nameEn.trim() || !(required > 0)) return;
    if (code !== editingCode && cfg.shifts[code]) { setShiftErr(t('codeExists')); return; }
    const start = toMinOfDay(sf.start);
    let durMin = toMinOfDay(sf.end) - start;
    if (durMin <= 0) durMin += 1440; // end at/before start → crosses midnight
    const def: ShiftDef = {
      code, nameEn: sf.nameEn.trim(), kind: sf.kind, start, durMin, required,
      ...(sf.ramadan ? { ramadan: true } : {}), ...(sf.night ? { night: true } : {}),
    };
    const next = { ...cfg.shifts };
    if (editingCode && editingCode !== code) delete next[editingCode];
    next[code] = def;
    setCfg({ ...cfg, shifts: next });
    setEditingCode(null); setSf(emptyShift); setShiftErr('');
  };

  const deleteShift = (code: string) => {
    if (!window.confirm(t('confirmDeleteShift'))) return;
    const next = { ...cfg.shifts };
    delete next[code];
    setCfg({ ...cfg, shifts: next });
    if (editingCode === code) { setEditingCode(null); setSf(emptyShift); }
  };

  const cancelShiftEdit = () => { setEditingCode(null); setSf(emptyShift); setShiftErr(''); };

  return (
    <div className="page">
      <div className="grid-2">
        <div className="panel">
          <h4>{t('ramadanWindow')}</h4>
          {cfg.ramadan
            ? <p>{fmtDate(cfg.ramadan.fromDay)} → {fmtDate(cfg.ramadan.toDay)} <span className="pill info">IR / CR / OFFR</span></p>
            : <p className="note">{t('ramadanOff')}</p>}
          <div className="toolbar">
            <label>{t('from')}</label>
            <input type="date" value={from} min="2026-06-01" max="2026-06-30" onChange={e => setFrom(e.target.value)} />
            <label>{t('to')}</label>
            <input type="date" value={to} min="2026-06-01" max="2026-06-30" onChange={e => setTo(e.target.value)} />
            <button className="primary" onClick={() => {
              const f = toDayIdx(from), tt = toDayIdx(to);
              if (f !== null && tt !== null && tt >= f) setCfg({ ...cfg, ramadan: { fromDay: f, toDay: tt } });
            }}>{t('apply')}</button>
            {cfg.ramadan && <button className="ghost" onClick={() => setCfg({ ...cfg, ramadan: null })}>{t('clear')}</button>}
          </div>
        </div>

        <div className="panel">
          <h4>{t('policyParams')}</h4>
          <div className="toolbar">
            <label>{t('gracePeriod')}</label>
            <input type="number" value={cfg.graceMin} min={0} max={120} style={{ width: 80 }}
              onChange={e => setCfg({ ...cfg, graceMin: Number(e.target.value) })} />
            <label>{t('otCap')}</label>
            <input type="number" value={cfg.otCapMin} min={0} max={480} step={30} style={{ width: 80 }}
              onChange={e => setCfg({ ...cfg, otCapMin: Number(e.target.value) })} />
          </div>
          <div className="note">BR-11 · FR-16 — {t('correctionsNote')}</div>
        </div>

        <div className="panel">
          <h4>{t('holidays')}</h4>
          <table>
            <thead><tr><th>{t('date')}</th><th></th><th></th></tr></thead>
            <tbody>
              {cfg.holidays.map((h, i) => (
                <tr key={i}>
                  <td>{fmtDate(h.day)}</td>
                  <td>{s.lang === 'ar' ? h.nameAr : h.name}</td>
                  <td><button className="link" onClick={() => setCfg({ ...cfg, holidays: cfg.holidays.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <input type="date" value={holidayDate} min="2026-06-01" max="2026-06-30" onChange={e => setHolidayDate(e.target.value)} />
            <input type="text" placeholder="Name" value={holidayName} onChange={e => setHolidayName(e.target.value)} />
            <button className="ghost" onClick={() => {
              const d = toDayIdx(holidayDate);
              if (d !== null && holidayName.trim()) {
                setCfg({ ...cfg, holidays: [...cfg.holidays, { day: d, name: holidayName.trim(), nameAr: holidayName.trim() }] });
                setHolidayName('');
              }
            }}>{t('addHoliday')}</button>
          </div>
        </div>

        <div className="panel">
          <h4>{t('devices')}</h4>
          <div className="table-wrap" style={{ maxHeight: 260, border: 'none' }}>
            <table>
              <tbody>
                {DEVICES.map(d => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.nameEn}</td>
                    <td><span className={`pill ${d.online ? 'ok' : 'bad'}`}>{t(d.online ? 'online' : 'offline')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h3>{t('shiftsPanel')}</h3>
      <div className="panel">
        <div className="table-wrap" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>{t('code')}</th><th>{t('shiftName')}</th><th>{t('segment')}</th>
                <th>{t('shiftIn')}</th><th>{t('shiftOut')}</th><th>{t('requiredH')}</th><th></th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {shiftList.map(d => (
                <tr key={d.code} style={editingCode === d.code ? { outline: '2px solid var(--accent, #8bc34a)' } : undefined}>
                  <td><b>{d.code}</b></td>
                  <td>{d.nameEn}</td>
                  <td>{kindLabel(d.kind)}{d.ramadan && <> <span className="pill info">{t('ramadanTag')}</span></>}</td>
                  <td>{fmtTime(d.start)}</td>
                  <td>{fmtTime(d.start + d.durMin)}{d.start + d.durMin > 1440 ? ' +1' : ''}</td>
                  <td>{fmtDur(d.required)}</td>
                  <td>{d.night && <span className="pill info">{t('night')}</span>}</td>
                  <td><button className="link" onClick={() => startEditShift(d)}>{t('edit')}</button></td>
                  <td>
                    <button className="link" disabled={kindCount(d.kind) <= 1}
                      title={kindCount(d.kind) <= 1 ? t('shiftsNote') : t('deleteBtn')}
                      onClick={() => deleteShift(d.code)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <label>{t('code')}</label>
          <input type="text" value={sf.code} style={{ width: 90 }} placeholder="I-4"
            onChange={e => setSf({ ...sf, code: e.target.value })} />
          <label>{t('shiftName')}</label>
          <input type="text" value={sf.nameEn} style={{ width: 200 }} placeholder="Field 07:00–15:00"
            onChange={e => setSf({ ...sf, nameEn: e.target.value })} />
          <label>{t('segment')}</label>
          <select value={sf.kind} onChange={e => setSf({ ...sf, kind: e.target.value as ShiftKind })}>
            <option value="office">{t('office')}</option>
            <option value="field">{t('field')}</option>
            <option value="casual">{t('casual')}</option>
          </select>
          <label>{t('shiftIn')}</label>
          <input type="time" value={sf.start} onChange={e => setSf({ ...sf, start: e.target.value })} />
          <label>{t('shiftOut')}</label>
          <input type="time" value={sf.end} onChange={e => setSf({ ...sf, end: e.target.value })} />
          <label>{t('requiredH')}</label>
          <input type="number" value={sf.requiredH} min={0.5} max={24} step={0.5} style={{ width: 70 }}
            onChange={e => setSf({ ...sf, requiredH: e.target.value })} />
          <label><input type="checkbox" checked={sf.ramadan}
            onChange={e => setSf({ ...sf, ramadan: e.target.checked })} /> {t('ramadanTag')}</label>
          <label><input type="checkbox" checked={sf.night}
            onChange={e => setSf({ ...sf, night: e.target.checked })} /> {t('night')}</label>
          <button className="primary" onClick={saveShift}>{editingCode ? t('updateShift') : t('addShift')}</button>
          {editingCode && <button className="ghost" onClick={cancelShiftEdit}>{t('cancel')}</button>}
        </div>
        {shiftErr && <div className="note" style={{ color: 'var(--bad, #c62828)' }}>{shiftErr}</div>}
        <div className="note">{t('shiftsNote')}</div>
      </div>

      <h3>{t('auditTrail')}</h3>
      <div className="panel">
        {audit.length === 0
          ? <p className="note">{t('noAudit')}</p>
          : (
            <table>
              <thead><tr><th>#</th><th>{t('by')}</th><th>{t('at')}</th><th>{t('employee')}</th><th>{t('what')}</th><th>{t('reason')}</th></tr></thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.seq}>
                    <td>{a.seq}</td><td>{a.actor}</td><td>{a.when}</td><td>{a.target}</td><td>{a.change}</td><td>{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
