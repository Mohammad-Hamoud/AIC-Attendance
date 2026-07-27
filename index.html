// Reusable column sorting for tables (modification request #2).
import { useMemo, useState } from 'react';

export interface SortState {
  key: string | null;
  dir: 1 | -1;
  toggle: (k: string) => void;
  reset: () => void;
}

export function useSort(defaultKey: string | null = null): SortState {
  const [key, setKey] = useState<string | null>(defaultKey);
  const [dir, setDir] = useState<1 | -1>(1);
  return {
    key, dir,
    toggle: (k: string) => {
      if (k === key) setDir(d => (d === 1 ? -1 : 1));
      else { setKey(k); setDir(1); }
    },
    reset: () => { setKey(null); setDir(1); },
  };
}

/** Numeric-aware value comparison: numbers, "1:30" durations, "1,234", "(22)" negatives; else string. */
export function smartCmp(a: unknown, b: unknown): number {
  const na = toNum(a), nb = toNum(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).replace(/[",‎]/g, '').replace(/✎.*$/, '').trim();
  const dur = s.match(/^(\d+):(\d{2})$/);
  if (dur) return Number(dur[1]) * 60 + Number(dur[2]);
  if (/^\(?-?\d+(\.\d+)?\)?%?$/.test(s)) return parseFloat(s.replace(/[()%]/g, '')) * (s.startsWith('(') ? -1 : 1);
  return null;
}

export function sortRows<T>(rows: T[], sort: SortState, accessor: (row: T, key: string) => unknown): T[] {
  if (!sort.key) return rows;
  const k = sort.key;
  return [...rows].sort((a, b) => smartCmp(accessor(a, k), accessor(b, k)) * sort.dir);
}

/** Clickable header cell with an asc/desc indicator. */
export function Th({ k, label, sort }: { k: string; label: string; sort: SortState }) {
  return (
    <th onClick={() => sort.toggle(k)} style={{ cursor: 'pointer', userSelect: 'none' }}
      title={label}>
      {label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

/** Convenience for array-shaped rows (Reports): sort by column index. */
export function useIndexSort(rows: (string | number)[][]): { sorted: (string | number)[][]; sort: SortState } {
  const sort = useSort();
  const sorted = useMemo(
    () => sortRows(rows, sort, (row, key) => row[Number(key)]),
    [rows, sort.key, sort.dir],
  );
  return { sorted, sort };
}
