// Deterministic demo dataset for June 2026 (day 0 = Mon 2026-06-01).
// Punch data is regenerated from the active config, so setting a Ramadan
// window produces coherent IR/CR punches inside it.
import { MIN_PER_DAY, PERIOD_DAYS, shiftsOf, weekday, inRamadan, isPublicHoliday } from './model';
import type { Config, Employee, Casual, Punch, LeaveRecord, DeviceType } from './model';

// mulberry32 PRNG — deterministic across runs
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ahmed', 'Mohammed', 'Khalid', 'Faisal', 'Saad', 'Omar', 'Yousef', 'Abdullah', 'Salem', 'Nasser', 'Fahad', 'Turki', 'Hassan', 'Ali', 'Ibrahim', 'Majed', 'Rakan', 'Bandar', 'Waleed', 'Sultan', 'Noura', 'Sara', 'Reem', 'Huda'];
const FIRST_AR = ['أحمد', 'محمد', 'خالد', 'فيصل', 'سعد', 'عمر', 'يوسف', 'عبدالله', 'سالم', 'ناصر', 'فهد', 'تركي', 'حسن', 'علي', 'إبراهيم', 'ماجد', 'راكان', 'بندر', 'وليد', 'سلطان', 'نورة', 'سارة', 'ريم', 'هدى'];
const LAST = ['Al-Qahtani', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Harbi', 'Al-Zahrani', 'Al-Shehri', 'Al-Dossari', 'Al-Mutairi', 'Al-Subaie', 'Al-Amri', 'Khan', 'Rahman', 'Kumar', 'Fernandes', 'Santos', 'Cruz'];
const LAST_AR = ['القحطاني', 'العتيبي', 'الغامدي', 'الحربي', 'الزهراني', 'الشهري', 'الدوسري', 'المطيري', 'السبيعي', 'العمري', 'خان', 'رحمن', 'كومار', 'فرنانديز', 'سانتوس', 'كروز'];

export const DEVICES: { id: string; nameEn: string; type: DeviceType; online: boolean }[] = [
  { id: 'SEC-IN-01', nameEn: 'Security Building IN 1', type: 'face', online: true },
  { id: 'SEC-IN-02', nameEn: 'Security Building IN 2', type: 'face', online: true },
  { id: 'SEC-OUT-01', nameEn: 'Security Building OUT', type: 'face', online: true },
  { id: 'TRN-01', nameEn: 'Turnstile 01', type: 'face', online: true },
  { id: 'TRN-02', nameEn: 'Turnstile 02', type: 'face', online: true },
  { id: 'TRN-03', nameEn: 'Turnstile 03', type: 'face', online: true },
  { id: 'TRN-04', nameEn: 'Turnstile 04', type: 'face', online: false },
  { id: 'WH-OFF', nameEn: 'Warehouse Office', type: 'face', online: true },
  { id: 'CAN-AREA', nameEn: 'Canning Area', type: 'face', online: true },
  { id: 'REF-AREA', nameEn: 'Refinery Area', type: 'face', online: true },
  { id: 'UTL-AREA', nameEn: 'Utility Area', type: 'face', online: true },
  { id: 'SLM-WH', nameEn: 'Salama Warehouse', type: 'face', online: true },
  { id: 'HRJ-WH', nameEn: 'Haraj Warehouse 01', type: 'face', online: true },
  { id: 'HARBOUR', nameEn: 'AIC Harbour', type: 'face', online: true },
  { id: 'GRN-01', nameEn: 'Green Building 01', type: 'face', online: true },
  { id: 'GRN-02', nameEn: 'Green Building 02', type: 'face', online: true },
  { id: 'WH-LOAD', nameEn: 'Warehouse Loading Area', type: 'face', online: true },
  { id: 'COMP-01', nameEn: 'Factory Component 01', type: 'face', online: true },
  { id: 'CAR-GATE', nameEn: 'Car Gate Barrier (Time & Space)', type: 'gate', online: true },
  { id: 'CANTEEN-1', nameEn: 'Canteen 01 (5 SAR)', type: 'canteen1', online: true },
  { id: 'CANTEEN-2', nameEn: 'Canteen 02 (15/20 SAR)', type: 'canteen2', online: true },
];

const FIELD_DEVICES = ['TRN-01', 'TRN-02', 'TRN-03', 'CAN-AREA', 'REF-AREA', 'UTL-AREA', 'WH-LOAD'];
const OFFICE_DEVICES = ['SEC-IN-01', 'SEC-IN-02', 'GRN-01', 'GRN-02'];

export interface SeedData {
  employees: Employee[];
  casuals: Casual[];
  punches: Punch[];
  leaves: LeaveRecord[];
  incentives: Record<string, number>;   // iqama → SAR this month
  violations: Record<string, { count: number; notes: string[] }>;
}

export function buildMasterData(): Omit<SeedData, 'punches'> {
  const r = rng(20260601);
  const employees: Employee[] = [];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];

  const mkName = () => {
    const fi = Math.floor(r() * FIRST.length);
    const li = Math.floor(r() * LAST.length);
    return { en: `${FIRST[fi]} ${LAST[li]}`, ar: `${FIRST_AR[fi]} ${LAST_AR[li]}`, gender: fi >= 20 ? 'F' as const : 'M' as const };
  };

  // Managers first (OT-exempt, BR-14)
  const managerDefs = [
    { dept: 'Refinery', pos: 'Production Manager' },
    { dept: 'Canning', pos: 'Production Manager' },
    { dept: 'Warehouse', pos: 'Warehouse Manager' },
    { dept: 'Utility', pos: 'Utilities Manager' },
    { dept: 'HR', pos: 'HR Operations Manager' },
    { dept: 'Finance', pos: 'Finance Manager' },
  ];
  managerDefs.forEach((md, i) => {
    const n = mkName();
    employees.push({
      no: `10${String(i + 1).padStart(3, '0')}`, name: n.en, nameAr: n.ar, gender: n.gender,
      email: `mgr${i + 1}@savola.com`, company: 'AIC', dept: md.dept, costCenter: `CC-${md.dept.slice(0, 3).toUpperCase()}`,
      location: 'AIC Factory Jeddah', segment: 'manager', position: md.pos, grade: 'M2',
      religion: r() < 0.85 ? 'muslim' : 'non-muslim', managerNo: null, managerName: null,
      hireDay: -400 - Math.floor(r() * 1000), termDay: null, canteenClass: 'vip',
    });
  });
  const mgrFor = (dept: string) => employees.find(e => e.segment === 'manager' && e.dept === dept) ?? employees[0];

  // Office staff — 12
  const officeDepts = ['HR', 'Finance', 'HR', 'Finance', 'Warehouse', 'HR', 'Finance', 'Warehouse', 'HR', 'Finance', 'HR', 'Warehouse'];
  officeDepts.forEach((dept, i) => {
    const n = mkName();
    const m = mgrFor(dept);
    employees.push({
      no: `20${String(i + 1).padStart(3, '0')}`, name: n.en, nameAr: n.ar, gender: n.gender,
      email: `office${i + 1}@savola.com`, company: 'AIC', dept, costCenter: m.costCenter,
      location: 'AIC Factory Jeddah', segment: 'office', position: pick(['HR Specialist', 'Accountant', 'Planner', 'Coordinator']), grade: 'G7',
      religion: r() < 0.8 ? 'muslim' : 'non-muslim', managerNo: m.no, managerName: m.name,
      hireDay: -100 - Math.floor(r() * 2000), termDay: null, canteenClass: r() < 0.15 ? 'vip' : 'regular',
    });
  });

  // Field shift workers — 30 across 3 rotation teams
  const fieldDepts = ['Refinery', 'Canning', 'Utility', 'Warehouse'];
  for (let i = 0; i < 30; i++) {
    const n = mkName();
    const dept = fieldDepts[i % fieldDepts.length];
    const m = mgrFor(dept);
    employees.push({
      no: `30${String(i + 1).padStart(3, '0')}`, name: n.en, nameAr: n.ar, gender: 'M',
      email: `field${i + 1}@savola.com`, company: 'AIC', dept, costCenter: m.costCenter,
      location: 'AIC Factory Jeddah', segment: 'shift', position: pick(['Operator', 'Technician', 'Forklift Driver', 'Line Operator']), grade: 'G4',
      religion: r() < 0.7 ? 'muslim' : 'non-muslim', managerNo: m.no, managerName: m.name,
      hireDay: -50 - Math.floor(r() * 3000), termDay: null, canteenClass: 'regular',
    });
  }
  // Demo cases: one leaver mid-month (FR-22), one new joiner
  employees.find(e => e.no === '30005')!.termDay = 14;   // terminated 2026-06-15
  employees.find(e => e.no === '30021')!.hireDay = 9;    // joined 2026-06-10

  // Casuals — 16 across 2 suppliers
  const casuals: Casual[] = [];
  const suppliers = ['Al-Mawarid Manpower', 'Smasco'];
  for (let i = 0; i < 16; i++) {
    const n = mkName();
    casuals.push({
      iqama: `24${String(10000000 + i * 137 + Math.floor(r() * 90)).slice(0, 8)}`,
      name: n.en, nameAr: n.ar,
      supplier: suppliers[i % 2],
      supervisor: i % 2 === 0 ? 'Saeed Al-Amoudi' : 'Rashid Al-Nahdi',
      religion: r() < 0.6 ? 'muslim' : 'non-muslim',
      costCenter: 'CC-CAS', dept: pick(['Canning', 'Warehouse', 'Loading']),
      jobTitle: pick(['Loader', 'Picker', 'Helper', 'Cleaner']),
      monthlySalary: 2400 + Math.floor(r() * 5) * 300,
      healthCardExpiryDay: 60 + Math.floor(r() * 300),
      ajeerExpiryDay: 45 + Math.floor(r() * 300),
      active: true,
      dayOffWeekday: [5, 5, 5, 1, 2][i % 5], // mostly Friday, staggered for coverage
    });
  }
  // Demo compliance cases (FR-27/FR-48): expiring + expired documents
  casuals[3].healthCardExpiryDay = 20;  // expired 2026-06-21 → RED at gate after
  casuals[7].ajeerExpiryDay = 55;       // expires within 60 days → alert
  casuals[11].healthCardExpiryDay = 70; // expires within 60 days → alert
  casuals[14].active = false;           // deactivated

  // Approved leave consumed from "Fusion" (BR-10)
  const leaves: LeaveRecord[] = [
    { key: '20001', fromDay: 7, toDay: 11, type: 'annual' },
    { key: '20005', fromDay: 14, toDay: 15, type: 'sick' },
    { key: '30003', fromDay: 21, toDay: 25, type: 'annual' },
    { key: '30012', fromDay: 2, toDay: 2, type: 'death' },
    { key: '30018', fromDay: 16, toDay: 18, type: 'marriage' },
  ];

  const incentives: Record<string, number> = {};
  const violations: Record<string, { count: number; notes: string[] }> = {};
  casuals.forEach((c, i) => {
    if (i % 3 === 0) incentives[c.iqama] = 150 + (i % 4) * 50;
    if (i === 2) violations[c.iqama] = { count: 1, notes: ['2026-06-09 — safety violation (no helmet)'] };
    if (i === 9) violations[c.iqama] = { count: 2, notes: ['2026-06-04 — late gate misuse', '2026-06-17 — smoking area violation'] };
  });

  return { employees, casuals, leaves, incentives, violations };
}

// ---------------- punch generation (config-aware) ----------------

export function buildPunches(
  employees: Employee[], casuals: Casual[], leaves: LeaveRecord[], cfg: Config,
): Punch[] {
  const r = rng(987654321);
  const punches: Punch[] = [];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const jitter = (spread: number) => Math.floor(r() * spread * 2) - spread;

  const onLeave = (key: string, day: number) =>
    leaves.some(l => l.key === key && day >= l.fromDay && day <= l.toDay);

  const push = (key: string, t: number, dir: 'in' | 'out', deviceId: string, type: DeviceType, modality: Punch['modality'] = 'face') =>
    punches.push({ key, t, dir, deviceId, deviceType: type, modality });

  for (const emp of employees) {
    const drives = r() < 0.3; // some employees also punch at the car gate (FR-02)
    for (let day = 0; day < PERIOD_DAYS; day++) {
      if (day < emp.hireDay || (emp.termDay !== null && day > emp.termDay)) continue;
      if (onLeave(emp.no, day)) continue;
      const ram = inRamadan(day, cfg);
      const holiday = !!isPublicHoliday(day, cfg);
      const wd = weekday(day);
      const rest = emp.segment === 'shift' ? wd === 5 : (wd === 5 || wd === 6);
      // occasional rest-day / holiday work for field staff → holiday OT (BR-09)
      if (rest || holiday) {
        if (emp.segment === 'shift' && r() < 0.08) {
          const start = day * MIN_PER_DAY + 420 + jitter(10);
          push(emp.no, start, 'in', pick(FIELD_DEVICES), 'face');
          push(emp.no, start + 480 + jitter(20), 'out', pick(FIELD_DEVICES), 'face');
        }
        continue;
      }
      if (r() < 0.025) continue; // unexplained absence

      let inT: number, outT: number, devicePool = FIELD_DEVICES;
      if (emp.segment === 'shift') {
        const muslimRam = ram && emp.religion === 'muslim';
        const team = Number(emp.no) % 3;
        const week = Math.floor(day / 7);
        const defs = shiftsOf(cfg.shifts, 'field', muslimRam);
        // backward rotation (…I-3 → I-2 → I-1…) so a night week never overlaps the next week's shift
        const s = defs[(team + (defs.length - 1) * week) % defs.length];
        inT = day * MIN_PER_DAY + s.start - 8 + jitter(18);
        outT = day * MIN_PER_DAY + s.start + s.durMin + 6 + jitter(12);
        // some pre-approved OT days (FR-20): stay 1–3h after shift
        if (r() < 0.18) outT += 30 + Math.floor(r() * 5) * 30 + jitter(8);
        if (r() < 0.05) inT += 45 + Math.floor(r() * 40); // late beyond grace (FR-49)
      } else {
        devicePool = OFFICE_DEVICES;
        const muslimRam = ram && emp.religion === 'muslim';
        const band = pick(shiftsOf(cfg.shifts, 'office', muslimRam));
        inT = day * MIN_PER_DAY + band.start + 4 + jitter(14);
        outT = day * MIN_PER_DAY + band.start + band.durMin + 5 + jitter(10);
        if (r() < 0.06) inT += 40 + Math.floor(r() * 50); // office lateness
      }

      const inDev = drives && r() < 0.5 ? 'CAR-GATE' : pick(devicePool);
      push(emp.no, inT, 'in', inDev, inDev === 'CAR-GATE' ? 'gate' : 'face', inDev === 'CAR-GATE' ? 'vehicle' : 'face');
      // BR-02 demo: a second IN from a different source minutes later merges to earliest
      if (r() < 0.15) push(emp.no, inT + 3 + Math.floor(r() * 5), 'in', pick(devicePool), 'face');
      if (r() < 0.03) {
        // missing OUT exception (FR-33/FR-36 correction workflow)
      } else {
        const outDev = drives && r() < 0.5 ? 'CAR-GATE' : pick(devicePool);
        push(emp.no, outT, 'out', outDev, outDev === 'CAR-GATE' ? 'gate' : 'face', outDev === 'CAR-GATE' ? 'vehicle' : 'face');
      }
      // canteen consumption (FR-41)
      if (emp.segment !== 'shift' || r() < 0.6) {
        if (r() < 0.55) push(emp.no, day * MIN_PER_DAY + 740 + jitter(30), 'in', 'CANTEEN-1', 'canteen1');
        if (r() < 0.2) push(emp.no, day * MIN_PER_DAY + 760 + jitter(30), 'in', 'CANTEEN-2', 'canteen2');
      }
    }
  }

  for (const c of casuals) {
    if (!c.active) continue;
    const night = Number(c.iqama) % 4 === 0; // some casuals on C-2 night pattern
    for (let day = 0; day < PERIOD_DAYS; day++) {
      if (weekday(day) === c.dayOffWeekday) continue;         // assigned paid day-off
      if (c.healthCardExpiryDay < day || c.ajeerExpiryDay < day) continue; // RED at gate → no punches
      if (r() < 0.04) continue;                               // absence
      const ram = inRamadan(day, cfg);
      const defs = shiftsOf(cfg.shifts, 'casual', ram);
      const s = night ? defs[defs.length - 1] : defs[0];
      const inT = day * MIN_PER_DAY + s.start - 5 + jitter(15);
      const outT = day * MIN_PER_DAY + s.start + s.durMin + 4 + jitter(10);
      push(c.iqama, inT, 'in', pick(FIELD_DEVICES), 'face');
      if (r() >= 0.03) push(c.iqama, outT, 'out', pick(FIELD_DEVICES), 'face');
      if (r() < 0.5) push(c.iqama, day * MIN_PER_DAY + s.start + 300 + jitter(40), 'in', 'CANTEEN-1', 'canteen1');
    }
  }

  return punches.sort((a, b) => a.t - b.t);
}
