// FR-45 — Report Merge: upload the four real system exports (TAS, Car Gate,
// Leaves, Active list), auto-detect each one, and generate a single accurate
// attendance workbook following the TAS column design.
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  detectReportKind, parseTas, parseGate, parseLeaves, parseActive,
  buildMergedReport, mergedRowCells, MERGED_HEADERS,
} from '../domain/merge';
import type { ReportKind, SheetMatrix, MergeResult } from '../domain/merge';
import { readSheetMatrix } from '../domain/xlsx';

interface LoadedFile { name: string; matrix: SheetMatrix }
type Slots = Partial<Record<ReportKind, LoadedFile>>;

const SLOT_META: { kind: ReportKind; label: string; source: string }[] = [
  { kind: 'tas', label: 'TAS', source: 'HR Works — main attendance' },
  { kind: 'gate', label: 'Car Gate', source: 'Speca Time & Space — access events' },
  { kind: 'leaves', label: 'Leaves', source: 'Oracle Fusion — approved absences' },
  { kind: 'active', label: 'Active list', source: 'Oracle Fusion — old ↔ new emp numbers' },
];

export default function Merge() {
  const s = useStore();
  const { t } = s;
  const [slots, setSlots] = useState<Slots>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<MergeResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(t('mergeReading'));
    setResult(null);
    const errs: string[] = [];
    const next: Slots = { ...slots };
    for (const f of Array.from(list)) {
      try {
        const matrix = readSheetMatrix(await f.arrayBuffer());
        const kind = detectReportKind(matrix);
        if (!kind) { errs.push(`${f.name}: ${t('mergeUnknownFile')}`); continue; }
        next[kind] = { name: f.name, matrix };
      } catch {
        errs.push(`${f.name}: ${t('mergeReadError')}`);
      }
    }
    setSlots(next);
    setErrors(errs);
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const canGenerate = !!slots.tas && !!slots.active;

  const generate = () => {
    if (!canGenerate) return;
    setBusy(t('mergeWorking'));
    // defer so the busy note paints before the synchronous crunch
    setTimeout(() => {
      const res = buildMergedReport(
        parseTas(slots.tas!.matrix),
        slots.gate ? parseGate(slots.gate.matrix) : [],
        slots.leaves ? parseLeaves(slots.leaves.matrix) : [],
        parseActive(slots.active!.matrix),
      );
      setResult(res);
      setBusy('');
    }, 30);
  };

  const download = async () => {
    if (!result) return;
    setBusy(t('mergeWriting'));
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AIC Time & Attendance — Report Merge';
    const ws = wb.addWorksheet('Attendance', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = MERGED_HEADERS.map(h => ({ header: h, width: Math.max(11, Math.min(30, h.length + 4)) }));
    const hd = ws.getRow(1);
    hd.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B4A5A' } };
    hd.height = 20;
    for (const r of result.rows) {
      const row = ws.addRow(mergedRowCells(r));
      if (r.leaveType && r.status === r.leaveType) row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0DA' } };
      if (r.inSource === 'Car Gate') row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } };
      if (r.outSource === 'Car Gate') row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: MERGED_HEADERS.length } };

    const ex = wb.addWorksheet('Summary & Exceptions');
    ex.getColumn(1).width = 36; ex.getColumn(2).width = 30; ex.getColumn(3).width = 46;
    ex.getColumn(4).width = 14; ex.getColumn(5).width = 14;
    ex.addRow(['Merged attendance — summary']).font = { bold: true, size: 13 };
    for (const [k, v] of Object.entries(result.summary)) ex.addRow([k, v]);
    ex.addRow([]);
    ex.addRow(['Unmatched car-gate names', 'Events', 'Reason']).font = { bold: true };
    for (const u of result.unmatchedGateUsers) ex.addRow([u.user, u.events, u.reason]);
    ex.addRow([]);
    ex.addRow(['Approved leaves not applied', 'Name', 'Type', 'From', 'To', 'Reason']).font = { bold: true };
    for (const l of result.unresolvedLeaves) ex.addRow([l.empNo, l.name, l.type, l.from, l.to, l.reason]);
    ex.getColumn(6).width = 50;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Merged_Attendance.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy('');
  };

  const preview = useMemo(() => result?.rows.slice(0, 40).map(mergedRowCells) ?? [], [result]);

  return (
    <div className="page">
      <div className="panel">
        <h4>{t('mergeReports')}</h4>
        <p className="note">{t('mergeIntro')}</p>
        <div
          className="panel" style={{ border: '2px dashed #A9C23F', textAlign: 'center', padding: 24, cursor: 'pointer' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); void onFiles(e.dataTransfer.files); }}
        >
          <b>{t('mergeDrop')}</b>
          <div className="note">{t('mergeDropHint')}</div>
          <input ref={fileRef} type="file" multiple accept=".xlsx" style={{ display: 'none' }}
            onChange={e => void onFiles(e.target.files)} />
        </div>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          {SLOT_META.map(m => (
            <span key={m.kind} className={`pill ${slots[m.kind] ? 'ok' : 'muted'}`} title={m.source}>
              {slots[m.kind] ? '✓' : '…'} {m.label}{slots[m.kind] ? ` — ${slots[m.kind]!.name}` : ''}
            </span>
          ))}
        </div>
        {errors.map((e, i) => <div key={i} className="note" style={{ color: '#c62828' }}>⚠ {e}</div>)}
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="primary" disabled={!canGenerate || !!busy} onClick={generate}>{t('mergeGenerate')}</button>
          {result && <button className="primary" disabled={!!busy} onClick={() => void download()}>{t('mergeDownload')}</button>}
          {busy && <span className="note">{busy}</span>}
          {!canGenerate && <span className="note">{t('mergeNeed')}</span>}
        </div>
      </div>

      {result && (
        <>
          <div className="cards">
            <div className="card"><div className="kpi">{result.summary.employees}</div><div className="label">{t('mergeEmployees')}</div></div>
            <div className="card"><div className="kpi">{result.rows.length.toLocaleString()}</div><div className="label">{t('mergeRows')}</div></div>
            <div className="card"><div className="kpi">{result.summary.punchesImproved}</div><div className="label">{t('mergePunchesImproved')}</div></div>
            <div className="card"><div className="kpi">{result.summary.statusUpgraded}</div><div className="label">{t('mergeStatusUpgraded')}</div></div>
            <div className="card"><div className="kpi">{result.summary.leaveDaysApplied}</div><div className="label">{t('mergeLeaveDays')}</div></div>
            <div className="card"><div className={`kpi ${result.unmatchedGateUsers.length ? 'warn' : ''}`}>{result.unmatchedGateUsers.length}</div><div className="label">{t('mergeUnmatchedGate')}</div></div>
          </div>

          {(result.unmatchedGateUsers.length > 0 || result.unresolvedLeaves.length > 0) && (
            <div className="grid-2">
              <div className="panel">
                <h4>{t('mergeUnmatchedGate')}</h4>
                <div className="table-wrap" style={{ maxHeight: 260, border: 'none' }}>
                  <table>
                    <thead><tr><th>{t('empName')}</th><th>{t('mergeEvents')}</th><th>{t('mergeReason')}</th></tr></thead>
                    <tbody>
                      {result.unmatchedGateUsers.map((u, i) => (
                        <tr key={i}><td>{u.user}</td><td>{u.events}</td><td className="note">{u.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="note">{t('mergeGateNote')}</div>
              </div>
              <div className="panel">
                <h4>{t('mergeUnresolvedLeaves')}</h4>
                {result.unresolvedLeaves.length === 0
                  ? <p className="note">—</p>
                  : (
                    <div className="table-wrap" style={{ maxHeight: 260, border: 'none' }}>
                      <table>
                        <thead><tr><th>{t('empNo')}</th><th>{t('empName')}</th><th>{t('mergeLeaveType')}</th><th>{t('from')}</th><th>{t('to')}</th><th>{t('mergeReason')}</th></tr></thead>
                        <tbody>
                          {result.unresolvedLeaves.map((l, i) => (
                            <tr key={i}><td>{l.empNo}</td><td>{l.name}</td><td>{l.type}</td><td>{l.from}</td><td>{l.to}</td><td className="note">{l.reason}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </div>
          )}

          <h3>{t('mergePreview')}</h3>
          <div className="table-wrap" style={{ maxHeight: '52vh' }}>
            <table>
              <thead><tr>{MERGED_HEADERS.map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="note">{t('mergePreviewNote')}</div>
        </>
      )}
    </div>
  );
}
