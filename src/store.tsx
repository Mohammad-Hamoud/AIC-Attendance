// App-wide state: config, seeded data, computed results, edits, day offs,
// supervisor delegation (with manager approval queue) and audit trail.
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultConfig, fmtDate, MIN_PER_DAY } from './domain/model';
import type { Config, Employee, Casual, Punch } from './domain/model';
import {
  computeFte, computeCasual, summarizeCasual, computeCanteen,
} from './domain/engine';
import type { FteDayResult, CasualDayResult, CasualSummary, CanteenCharge } from './domain/engine';
import { buildMasterData, buildPunches } from './domain/seed';
import { detectSuspiciousActivity } from './domain/alerts';
import type { HrAlert } from './domain/alerts';
import { t as translate, type Lang, type TKey } from './domain/i18n';

export interface PunchEdit {
  key: string;        // emp no / iqama
  day: number;
  inT: number | null;  // corrected values (abs minutes)
  outT: number | null;
  changeIn: boolean;   // only the changed direction is replaced by a manual punch;
  changeOut: boolean;  // the untouched one keeps its original device source (FR-04)
  reason?: string;     // FR-33 mandatory reason, surfaced as a report column
  origIn?: number | null;  // values before the correction — misuse monitor measures the shift size
  origOut?: number | null;
  by?: string;             // who authored the change (supervisor for approved pending items)
}

export type Role =
  | { type: 'hr' }
  | { type: 'manager'; no: string }
  | { type: 'supervisor'; no: string; managerNo: string };

export interface AuditEntry {
  seq: number;
  actor: string;
  when: string;
  target: string;
  change: string;
  reason: string;
}

export interface DayOffGrant { key: string; day: number; by?: string }

/**
 * Merges a follow-up correction into an earlier one for the same employee+day.
 * Change flags accumulate (an IN-only second edit must not revert an earlier
 * OUT correction), the first edit's original device times are preserved for
 * the misuse monitor, and reasons chain for the audit/report column.
 */
export function mergePunchEdit(existing: PunchEdit | undefined, incoming: PunchEdit): PunchEdit {
  if (!existing) return incoming;
  return {
    ...incoming,
    changeIn: incoming.changeIn || existing.changeIn,
    changeOut: incoming.changeOut || existing.changeOut,
    inT: incoming.changeIn ? incoming.inT : existing.changeIn ? existing.inT : incoming.inT,
    outT: incoming.changeOut ? incoming.outT : existing.changeOut ? existing.outT : incoming.outT,
    origIn: existing.origIn !== undefined ? existing.origIn : incoming.origIn,
    origOut: existing.origOut !== undefined ? existing.origOut : incoming.origOut,
    reason: existing.reason && incoming.reason && existing.reason !== incoming.reason
      ? `${existing.reason} · ${incoming.reason}`
      : incoming.reason ?? existing.reason,
  };
}

// A change submitted by a delegated supervisor, awaiting manager approval.
export interface PendingChange {
  id: number;
  kind: 'edit' | 'dayoff';
  key: string;         // employee affected
  day: number;
  edit?: PunchEdit;
  reason: string;
  by: string;          // supervisor display name
  when: string;
  managerNo: string;   // approval queue owner
  label: string;
}

interface Store {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  dir: 'ltr' | 'rtl';
  role: Role | null;
  setRole: (r: Role | null) => void;
  cfg: Config;
  setCfg: (c: Config) => void;
  employees: Employee[];
  casuals: Casual[];
  punches: Punch[];
  fteResults: Map<string, FteDayResult[]>;
  casualResults: Map<string, CasualDayResult[]>;
  casualSummaries: Map<string, CasualSummary>;
  canteen: CanteenCharge[];
  incentives: Record<string, number>;
  violations: Record<string, { count: number; notes: string[] }>;
  audit: AuditEntry[];
  edits: PunchEdit[];
  applyEdit: (edit: PunchEdit, reason: string, label: string) => void;
  requestEdit: (edit: PunchEdit, reason: string, label: string) => boolean; // true = applied, false = pending
  dayOffs: DayOffGrant[];
  addDayOff: (key: string, day: number) => void;
  removeDayOff: (key: string, day: number) => void;
  requestDayOff: (key: string, day: number) => boolean;
  supervisors: Record<string, string>; // managerNo → delegated supervisor empNo
  setSupervisor: (managerNo: string, empNo: string | null) => void;
  pending: PendingChange[];
  approvePending: (ids: number[]) => void;
  rejectPending: (ids: number[]) => void;
  hrAlerts: HrAlert[]; // authority-misuse monitor — informs HR, never blocks
}

const Ctx = createContext<Store | null>(null);

const loadRole = (): Role | null => {
  try {
    const raw = localStorage.getItem('aic-role');
    return raw ? (JSON.parse(raw) as Role) : null;
  } catch { return null; }
};

const loadSupervisors = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem('aic-supervisors');
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const [role, setRoleState] = useState<Role | null>(loadRole);
  const [cfg, setCfg] = useState<Config>(defaultConfig());
  const setRole = (r: Role | null) => {
    setRoleState(r);
    try {
      if (r) localStorage.setItem('aic-role', JSON.stringify(r));
      else localStorage.removeItem('aic-role');
    } catch { /* private mode */ }
  };
  const [edits, setEdits] = useState<PunchEdit[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [dayOffs, setDayOffs] = useState<DayOffGrant[]>([]);
  const [supervisors, setSupervisorsState] = useState<Record<string, string>>(loadSupervisors);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const pendingSeq = useRef(1);

  const master = useMemo(() => buildMasterData(), []);
  const basePunches = useMemo(
    () => buildPunches(master.employees, master.casuals, master.leaves, cfg),
    [master, cfg],
  );

  const actorLabel = () => {
    if (role?.type === 'manager') return master.employees.find(e => e.no === role.no)?.email ?? 'manager@savola.com';
    if (role?.type === 'supervisor') return master.employees.find(e => e.no === role.no)?.email ?? 'supervisor@savola.com';
    return 'hr.operations@savola.com';
  };
  const pushAudit = (target: string, change: string, reason: string) =>
    setAudit(prev => [{
      seq: prev.length + 1, actor: actorLabel(), when: new Date().toLocaleString(), target, change, reason,
    }, ...prev]);

  // Manual corrections (FR-32/33): only the changed direction is replaced by a
  // manual punch; unchanged punches keep their device source.
  const punches = useMemo(() => {
    if (!edits.length) return basePunches;
    const byEdit = new Map(edits.map(e => [e.key, edits.filter(x => x.key === e.key)]));
    const kept = basePunches.filter(p => {
      if (p.deviceType === 'canteen1' || p.deviceType === 'canteen2') return true;
      const myEdits = byEdit.get(p.key);
      if (!myEdits) return true;
      for (const e of myEdits) {
        const dayStart = e.day * MIN_PER_DAY;
        if (p.dir === 'in' && e.changeIn && p.t >= dayStart && p.t < dayStart + MIN_PER_DAY) return false;
        // overnight OUTs of day D land on D+1 morning — drop up to D+1 12:00
        if (p.dir === 'out' && e.changeOut && p.t >= dayStart && p.t < dayStart + MIN_PER_DAY + 720) return false;
      }
      return true;
    });
    for (const e of edits) {
      if (e.changeIn && e.inT !== null) kept.push({ key: e.key, t: e.inT, dir: 'in', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' });
      if (e.changeOut && e.outT !== null) kept.push({ key: e.key, t: e.outT, dir: 'out', deviceId: 'MANUAL', deviceType: 'manual', modality: 'manual' });
    }
    return kept.sort((a, b) => a.t - b.t);
  }, [basePunches, edits]);

  const byKey = useMemo(() => {
    const m = new Map<string, Punch[]>();
    for (const p of punches) {
      const arr = m.get(p.key);
      if (arr) arr.push(p); else m.set(p.key, [p]);
    }
    return m;
  }, [punches]);

  const fteResults = useMemo(() => {
    const m = new Map<string, FteDayResult[]>();
    for (const emp of master.employees) {
      const grants = dayOffs.filter(g => g.key === emp.no).map(g => g.day);
      m.set(emp.no, computeFte(emp, byKey.get(emp.no) ?? [], master.leaves, cfg, grants));
    }
    return m;
  }, [master, byKey, cfg, dayOffs]);

  const casualResults = useMemo(() => {
    const m = new Map<string, CasualDayResult[]>();
    for (const c of master.casuals) {
      m.set(c.iqama, computeCasual(c, byKey.get(c.iqama) ?? [], cfg));
    }
    return m;
  }, [master, byKey, cfg]);

  const casualSummaries = useMemo(() => {
    const m = new Map<string, CasualSummary>();
    for (const c of master.casuals) {
      m.set(c.iqama, summarizeCasual(
        c, casualResults.get(c.iqama)!,
        master.incentives[c.iqama] ?? 0,
        master.violations[c.iqama]?.count ?? 0,
      ));
    }
    return m;
  }, [master, casualResults]);

  const canteen = useMemo(() => {
    const classOf = (key: string) =>
      master.employees.find(e => e.no === key)?.canteenClass ?? 'regular';
    return computeCanteen(punches, classOf, cfg);
  }, [punches, master, cfg]);

  const applyEdit = (edit: PunchEdit, reason: string, label: string, by?: string) => {
    setEdits(prev => {
      const existing = prev.find(e => e.key === edit.key && e.day === edit.day);
      const rec = mergePunchEdit(existing, { ...edit, reason, by: by ?? edit.by ?? actorLabel() });
      return [...prev.filter(e => !(e.key === edit.key && e.day === edit.day)), rec];
    });
    pushAudit(edit.key, label, reason);
  };

  const addDayOff = (key: string, day: number, by?: string) => {
    if (dayOffs.some(g => g.key === key && g.day === day)) return; // idempotent — no duplicate grant or audit noise
    const grant = { key, day, by: by ?? actorLabel() };
    setDayOffs(prev => prev.some(g => g.key === key && g.day === day) ? prev : [...prev, grant]);
    pushAudit(key, `Day off granted ${fmtDate(day)}`, 'FR-33 manager day-off grant');
  };

  const removeDayOff = (key: string, day: number) => {
    setDayOffs(prev => prev.filter(g => !(g.key === key && g.day === day)));
    pushAudit(key, `Day off removed ${fmtDate(day)}`, 'FR-33 manager day-off grant');
  };

  const supervisorName = () =>
    master.employees.find(e => e.no === (role as { no: string }).no)?.name ?? 'Supervisor';

  const submitPending = (p: Omit<PendingChange, 'id' | 'by' | 'when' | 'managerNo'>) => {
    const managerNo = role?.type === 'supervisor' ? role.managerNo : '';
    // no duplicate approval requests: a resubmission for the same employee/day/kind
    // merges into the earlier pending item (an IN-only follow-up keeps the OUT request)
    setPending(prev => {
      const existing = prev.find(x => x.kind === p.kind && x.key === p.key && x.day === p.day);
      const edit = p.kind === 'edit' && p.edit ? mergePunchEdit(existing?.edit, p.edit) : p.edit;
      return [...prev.filter(x => !(x.kind === p.kind && x.key === p.key && x.day === p.day)), {
        ...p, edit,
        reason: edit?.reason ?? p.reason,
        label: existing && existing.label !== p.label ? `${existing.label} · ${p.label}` : p.label,
        id: pendingSeq.current++, by: supervisorName(), when: new Date().toLocaleString(), managerNo,
      }];
    });
  };

  // Supervisor changes queue for manager approval; everyone else applies directly.
  const requestEdit = (edit: PunchEdit, reason: string, label: string): boolean => {
    if (role?.type === 'supervisor') {
      submitPending({ kind: 'edit', key: edit.key, day: edit.day, edit: { ...edit, reason }, reason, label });
      return false;
    }
    applyEdit(edit, reason, label);
    return true;
  };

  const requestDayOff = (key: string, day: number): boolean => {
    if (dayOffs.some(g => g.key === key && g.day === day)) return true; // already granted — nothing to request
    if (role?.type === 'supervisor') {
      submitPending({ kind: 'dayoff', key, day, reason: 'Day off request', label: `Day off ${fmtDate(day)}` });
      return false;
    }
    addDayOff(key, day);
    return true;
  };

  const approvePending = (ids: number[]) => {
    const items = pending.filter(p => ids.includes(p.id));
    for (const p of items) {
      // misuse attribution stays with the supervisor who authored the change
      if (p.kind === 'edit' && p.edit) applyEdit(p.edit, p.reason, `${p.label} · requested by ${p.by}`, p.by);
      else addDayOff(p.key, p.day, p.by);
    }
    setPending(prev => prev.filter(p => !ids.includes(p.id)));
  };

  const rejectPending = (ids: number[]) => {
    setPending(prev => prev.filter(p => !ids.includes(p.id)));
  };

  // Misuse monitor: recomputed live; HR's own corrections are not self-reported
  const hrAlerts = useMemo(
    () => detectSuspiciousActivity(edits, dayOffs, fteResults, casualResults)
      .filter(a => a.by !== 'hr.operations@savola.com'),
    [edits, dayOffs, fteResults, casualResults],
  );

  const setSupervisor = (managerNo: string, empNo: string | null) => {
    setSupervisorsState(prev => {
      const next = { ...prev };
      if (empNo) next[managerNo] = empNo; else delete next[managerNo];
      try { localStorage.setItem('aic-supervisors', JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  const store: Store = {
    lang, setLang,
    t: (k: TKey) => translate(k, lang),
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    role, setRole,
    cfg, setCfg,
    employees: master.employees,
    casuals: master.casuals,
    punches,
    fteResults, casualResults, casualSummaries, canteen,
    incentives: master.incentives,
    violations: master.violations,
    audit, edits, applyEdit, requestEdit,
    dayOffs, addDayOff, removeDayOff, requestDayOff,
    supervisors, setSupervisor,
    pending, approvePending, rejectPending,
    hrAlerts,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): void {
  // quote + neutralize leading formula chars (=+-@) against CSV injection in Excel
  const esc = (v: string | number) => {
    let s = String(v).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };
  const csv = '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
