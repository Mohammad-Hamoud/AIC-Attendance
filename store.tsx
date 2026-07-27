import { useState } from 'react';
import { StoreProvider, useStore } from './store';
import Landing from './pages/Landing';
import ModRequest from './pages/ModRequest';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Casuals from './pages/Casuals';
import Access from './pages/Access';
import Reports from './pages/Reports';
import Merge from './pages/Merge';
import Admin from './pages/Admin';
import type { TKey } from './domain/i18n';

type Page = 'dashboard' | 'attendance' | 'casuals' | 'access' | 'reports' | 'merge' | 'admin';

const HR_PAGES: { id: Page; label: TKey }[] = [
  { id: 'dashboard', label: 'dashboard' },
  { id: 'attendance', label: 'attendance' },
  { id: 'casuals', label: 'casuals' },
  { id: 'access', label: 'access' },
  { id: 'reports', label: 'reports' },
  { id: 'merge', label: 'mergeReports' },
  { id: 'admin', label: 'admin' },
];
// NFR-07: line managers see their own team only — corrections + team reports (FR-33)
const MANAGER_PAGES: { id: Page; label: TKey }[] = [
  { id: 'attendance', label: 'myTeam' },
  { id: 'reports', label: 'reports' },
];

function Shell() {
  const s = useStore();
  const isTeamView = s.role?.type === 'manager' || s.role?.type === 'supervisor';
  const pages = isTeamView ? MANAGER_PAGES : HR_PAGES;
  const [page, setPage] = useState<Page>(pages[0].id);
  const current = pages.some(p => p.id === page) ? page : pages[0].id;

  const roleLabel = isTeamView
    ? (() => {
        const m = s.employees.find(e => e.no === (s.role as { no: string }).no);
        const nm = m ? (s.lang === 'ar' ? m.nameAr : m.name) : s.t('managerRole');
        return s.role?.type === 'supervisor' ? `${nm} · ${s.t('supervisorRole')}` : nm;
      })()
    : s.t('hrRole');

  return (
    <div className="app" dir={s.dir}>
      <header className="topbar">
        <div>
          <h1>{s.t('appTitle')}</h1>
          <div className="sub">{s.t('appSubtitle')}</div>
        </div>
        <div className="spacer" />
        <span className="role-chip">
          {s.t('signedInAs')}: <b>{roleLabel}</b>
          <button onClick={() => s.setRole(null)}>{s.t('switchRole')}</button>
        </span>
        <span className="badge-period">{s.t('period')}</span>
        <button className="lang-btn" onClick={() => s.setLang(s.lang === 'en' ? 'ar' : 'en')}>
          {s.t('langBtn')}
        </button>
      </header>
      <nav className="nav">
        {pages.map(p => (
          <button key={p.id} className={current === p.id ? 'active' : ''} onClick={() => setPage(p.id)}>
            {s.t(p.label)}
          </button>
        ))}
      </nav>
      {current === 'dashboard' && <Dashboard />}
      {current === 'attendance' && <Attendance />}
      {current === 'casuals' && <Casuals />}
      {current === 'access' && <Access />}
      {current === 'reports' && <Reports />}
      {current === 'merge' && <Merge />}
      {current === 'admin' && <Admin />}
      <ModRequest screen={s.t(pages.find(p => p.id === current)!.label)} />
    </div>
  );
}

function Gate() {
  const s = useStore();
  return s.role ? <Shell /> : <Landing />;
}

export default function App() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  );
}
