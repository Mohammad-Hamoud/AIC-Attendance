// FR-26/27, BR-15 — green/red gate validation + FR-48 compliance alerts.
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { validateFteAccess, validateCasualAccess } from '../domain/engine';
import { fmtDate } from '../domain/model';

export default function Access() {
  const s = useStore();
  const { employees, casuals, cfg, t, lang } = s;
  const [scanKey, setScanKey] = useState('');

  const today = cfg.simulatedToday;

  const scanResult = useMemo(() => {
    if (!scanKey) return null;
    const emp = employees.find(e => e.no === scanKey);
    if (emp) return { label: lang === 'ar' ? emp.nameAr : emp.name, ...validateFteAccess(emp, today) };
    const cas = casuals.find(c => c.iqama === scanKey);
    if (cas) return { label: lang === 'ar' ? cas.nameAr : cas.name, ...validateCasualAccess(cas, today) };
    return null;
  }, [scanKey, employees, casuals, today, lang]);

  const reasonText = (r: string) => ({
    'terminated': t('terminated'),
    'health-card-expired': t('hcExpired'),
    'ajeer-expired': t('ajeerExpired'),
    'inactive': t('inactive'),
    'not-yet-hired': t('notYetHired'),
  } as Record<string, string>)[r] ?? r;

  const redList = useMemo(() => {
    const rows: { key: string; name: string; type: string; reasons: string[] }[] = [];
    for (const e of employees) {
      const v = validateFteAccess(e, today);
      if (!v.green) rows.push({ key: e.no, name: lang === 'ar' ? e.nameAr : e.name, type: t('fte'), reasons: v.reasons });
    }
    for (const c of casuals) {
      const v = validateCasualAccess(c, today);
      if (!v.green) rows.push({ key: c.iqama, name: lang === 'ar' ? c.nameAr : c.name, type: t('casual'), reasons: v.reasons });
    }
    return rows;
  }, [employees, casuals, today, lang, t]);

  const expiring = useMemo(() =>
    casuals.flatMap(c => {
      const out: { c: typeof c; doc: string; day: number }[] = [];
      if (c.healthCardExpiryDay - today <= 60) out.push({ c, doc: t('healthCard'), day: c.healthCardExpiryDay });
      if (c.ajeerExpiryDay - today <= 60) out.push({ c, doc: t('ajeer'), day: c.ajeerExpiryDay });
      return out;
    }).sort((a, b) => a.day - b.day),
  [casuals, today, t]);

  return (
    <div className="page">
      <div className="grid-2">
        <div className="panel">
          <h4>{t('gateSimulator')}</h4>
          <div className="toolbar">
            <select value={scanKey} onChange={e => setScanKey(e.target.value)} style={{ minWidth: 260 }}>
              <option value="">— {t('scan')} —</option>
              <optgroup label={t('fte')}>
                {employees.map(e => <option key={e.no} value={e.no}>{e.no} · {lang === 'ar' ? e.nameAr : e.name}</option>)}
              </optgroup>
              <optgroup label={t('casual')}>
                {casuals.map(c => <option key={c.iqama} value={c.iqama}>{c.iqama} · {lang === 'ar' ? c.nameAr : c.name}</option>)}
              </optgroup>
            </select>
          </div>
          {scanResult && (
            <div className={`gate-result ${scanResult.green ? 'green' : 'red'}`}>
              {scanResult.label}
              <div>{scanResult.green ? t('green') : t('red')}</div>
              {!scanResult.green && (
                <div className="gate-reasons">{scanResult.reasons.map(reasonText).join(' · ')}</div>
              )}
            </div>
          )}
          <div className="note">{t('gateEventsToday')}</div>
        </div>

        <div className="panel">
          <h4>{t('expiryAlerts')}</h4>
          <table>
            <thead><tr><th>{t('iqama')}</th><th>{t('empName')}</th><th>{t('supplier')}</th><th></th><th>{t('expiresOn')}</th></tr></thead>
            <tbody>
              {expiring.map((e, i) => (
                <tr key={i}>
                  <td>{e.c.iqama}</td>
                  <td>{lang === 'ar' ? e.c.nameAr : e.c.name}</td>
                  <td>{e.c.supplier}</td>
                  <td>{e.doc}</td>
                  <td><span className={`pill ${e.day < today ? 'bad' : 'warn'}`}>{fmtDate(Math.min(e.day, 364))}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3>{t('red')} — {fmtDate(today)}</h3>
      <div className="table-wrap" style={{ maxHeight: '38vh' }}>
        <table>
          <thead><tr><th>#</th><th>{t('empName')}</th><th>{t('segment')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {redList.map(r => (
              <tr key={r.key}>
                <td>{r.key}</td><td>{r.name}</td><td>{r.type}</td>
                <td>{r.reasons.map((x, i) => <span key={i} className="pill bad" style={{ marginInlineEnd: 6 }}>{reasonText(x)}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
