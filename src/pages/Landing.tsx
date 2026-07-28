// Role selection landing page (NFR-07 RBAC): HR Operations vs Line Manager (own team only).
import { useMemo, useState } from 'react';
import { useStore } from '../store';

export default function Landing() {
  const s = useStore();
  const { employees, t, lang } = s;
  const [picked, setPicked] = useState<'hr' | 'manager' | 'supervisor' | null>(null);
  const [mgrNo, setMgrNo] = useState('');
  const [supNo, setSupNo] = useState('');

  const managers = useMemo(() =>
    employees
      .filter(e => e.segment === 'manager')
      .map(m => ({ ...m, team: employees.filter(e => e.managerNo === m.no).length }))
      .filter(m => m.team > 0),
  [employees]);

  // supervisors delegated by managers (persisted per browser)
  const supervisorOptions = useMemo(() =>
    Object.entries(s.supervisors).flatMap(([managerNo, empNo]) => {
      const sup = employees.find(e => e.no === empNo);
      const mgr = employees.find(e => e.no === managerNo);
      return sup && mgr ? [{ empNo, managerNo, sup, mgr }] : [];
    }),
  [s.supervisors, employees]);

  const enter = () => {
    if (picked === 'hr') s.setRole({ type: 'hr' });
    if (picked === 'manager' && mgrNo) s.setRole({ type: 'manager', no: mgrNo });
    if (picked === 'supervisor' && supNo) {
      const opt = supervisorOptions.find(o => o.empNo === supNo);
      if (opt) s.setRole({ type: 'supervisor', no: opt.empNo, managerNo: opt.managerNo });
    }
  };

  return (
    <div className="landing" dir={s.dir}>
      <button className="lang-btn landing-lang" onClick={() => s.setLang(lang === 'en' ? 'ar' : 'en')}>
        {t('langBtn')}
      </button>
      <div className="landing-hero">
        <div className="landing-logo">
          {/* simplified Savola "Λ" mark, SFC lime */}
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M32 6 C36 6 39 8.5 40.8 12.5 L57 48 C59.5 53.5 56 59 50 59 C46.5 59 43.8 57 42.4 53.8 L32 29 L21.6 53.8 C20.2 57 17.5 59 14 59 C8 59 4.5 53.5 7 48 L23.2 12.5 C25 8.5 28 6 32 6 Z" fill="#A9C23F" />
          </svg>
        </div>
        <h1>{t('appTitle')}</h1>
        <p>{t('appSubtitle')}</p>
      </div>
      <div className="landing-box">
        <h2>{t('landingWelcome')}</h2>
        <div className="role-cards">
          <button className={`role-card ${picked === 'hr' ? 'picked' : ''}`} onClick={() => setPicked('hr')}>
            <span className="role-icon">🗂️</span>
            <span className="role-name">{t('hrRole')}</span>
            <span className="role-desc">{t('hrRoleDesc')}</span>
          </button>
          <button className={`role-card ${picked === 'manager' ? 'picked' : ''}`} onClick={() => setPicked('manager')}>
            <span className="role-icon">👥</span>
            <span className="role-name">{t('managerRole')}</span>
            <span className="role-desc">{t('managerRoleDesc')}</span>
          </button>
          <button className={`role-card ${picked === 'supervisor' ? 'picked' : ''}`} onClick={() => setPicked('supervisor')}>
            <span className="role-icon">🛠️</span>
            <span className="role-name">{t('supervisorRole')}</span>
            <span className="role-desc">{t('supervisorRoleDesc')}</span>
          </button>
        </div>
        {picked === 'manager' && (
          <div className="mgr-pick">
            <label>{t('selectManager')}</label>
            <select value={mgrNo} onChange={e => setMgrNo(e.target.value)}>
              <option value="">—</option>
              {managers.map(m => (
                <option key={m.no} value={m.no}>
                  {(lang === 'ar' ? m.nameAr : m.name)} · {m.position} — {m.team} {t('teamMembers')}
                </option>
              ))}
            </select>
          </div>
        )}
        {picked === 'supervisor' && (
          <div className="mgr-pick">
            {supervisorOptions.length === 0
              ? <p className="note">{t('noSupervisor')}</p>
              : <>
                  <label>{t('selectSupervisor')}</label>
                  <select value={supNo} onChange={e => setSupNo(e.target.value)}>
                    <option value="">—</option>
                    {supervisorOptions.map(o => (
                      <option key={o.empNo} value={o.empNo}>
                        {(lang === 'ar' ? o.sup.nameAr : o.sup.name)} — {t('lineManager')}: {lang === 'ar' ? o.mgr.nameAr : o.mgr.name}
                      </option>
                    ))}
                  </select>
                </>}
          </div>
        )}
        <button
          className="primary landing-enter"
          disabled={!picked || (picked === 'manager' && !mgrNo) || (picked === 'supervisor' && !supNo)}
          onClick={enter}
        >
          {t('continueBtn')}
        </button>
        <p className="note" style={{ textAlign: 'center' }}>{t('landingHint')}</p>
      </div>
    </div>
  );
}
