// Minimal, fast .xlsx sheet reader: unzip (fflate) + direct XML scan.
// Reads the first worksheet into a row matrix (index 0 = column A) in a
// fraction of the time a full workbook library needs — the TAS export is
// ~14k styled rows and must stay responsive in the browser.
import { unzipSync, strFromU8 } from 'fflate';
import type { SheetMatrix, Cell } from './merge';

const unescapeXml = (s: string): string => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readSheetMatrix(buf: ArrayBuffer): SheetMatrix {
  const files = unzipSync(new Uint8Array(buf));
  // shared strings (rich-text runs concatenated)
  const ss: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const xml = strFromU8(files['xl/sharedStrings.xml']);
    for (const si of xml.split('<si>').slice(1)) {
      const parts = [...si.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]);
      ss.push(unescapeXml(parts.join('')));
    }
  }
  // first worksheet (sheet1 by convention; fall back to the first sheetN present)
  const sheetPath = files['xl/worksheets/sheet1.xml']
    ? 'xl/worksheets/sheet1.xml'
    : Object.keys(files).find(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetPath) return [];
  const xml = strFromU8(files[sheetPath]);

  const matrix: SheetMatrix = [];
  const rowRe = /<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowIdx = Number(rm[1]) - 1;
    const row: Cell[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[2])) !== null) {
      const attrs = cm[1];
      const body = cm[2] ?? '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!ref) continue;
      const t = /t="([^"]*)"/.exec(attrs)?.[1];
      let value: Cell = null;
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
      if (t === 's' && v !== undefined) value = ss[Number(v)] ?? '';
      else if (t === 'inlineStr' && inline !== undefined) value = unescapeXml(inline);
      else if (t === 'str' && v !== undefined) value = unescapeXml(v);
      else if (v !== undefined) {
        const n = Number(v);
        value = Number.isNaN(n) ? unescapeXml(v) : n;
      }
      if (value !== null && value !== '') row[colIndex(ref)] = value;
    }
    if (row.length) matrix[rowIdx] = row;
  }
  // normalize holes so consumers can iterate
  for (let i = 0; i < matrix.length; i++) if (!matrix[i]) matrix[i] = [];
  return matrix;
}
