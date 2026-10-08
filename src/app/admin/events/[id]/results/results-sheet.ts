import * as XLSX from 'xlsx';

/* How a timing company's spreadsheet becomes result rows: which row holds the
   column labels, which column is which field, and what each finisher row turns
   into. Pure, so the uploader's screen only holds state and the ways it is
   changed. */

export type Column = { label: string; index: number };

export type SheetRows = unknown[][];

/** One sheet's import settings. A column is named by its real sheet index, as a
 *  string because that is what the pickers hold; '' is "not chosen". */
export type SheetMapping = {
  categoryId: string;
  headerRow: number;
  columns: Column[];
  bibCol: string;
  nameCol: string;
  genderCol: string;
  chipCol: string;
  gunCol: string;
};

export type MappingField = 'categoryId' | 'bibCol' | 'nameCol' | 'genderCol' | 'chipCol' | 'gunCol';

export type ResultRow = {
  categoryId: string;
  bibNumber: string;
  name: string;
  gender: string;
  chipTime: string;
  gunTime: string | null;
  status: 'FINISHED';
};

/* Timing software almost never puts the column labels in row 1. A chip-timing
   export normally opens with a banner — the event name, the word "Results", the
   distance — and a few spacer rows before the real header. Reading row 1 as the
   header turns the whole mapper into a single nonsense option, so the header row
   is detected instead of assumed. */
const HEADER_KEYWORDS = [
  'bib', 'name', 'gender', 'sex', 'chip', 'gun', 'net', 'gross', 'time',
  'pos', 'rank', 'place', 'age', 'cat', 'team', 'club', 'finish', 'div',
];

const cellText = (value: unknown) => String(value ?? '').trim();

export const nonEmptyCells = (row: unknown[] | undefined) => (row || []).map(cellText).filter(Boolean);

export const detectHeaderRow = (rows: SheetRows) => {
  const limit = Math.min(rows.length, 30);
  let fallback = -1;

  for (let r = 0; r < limit; r++) {
    const cells = nonEmptyCells(rows[r]);
    if (cells.length < 2) continue;

    // Two or more recognisable labels on one row is a header. A banner line
    // ("BizRun Ver 2.0 2026") carries none, and a data row carries at most one.
    const hits = cells.filter(c =>
      HEADER_KEYWORDS.some(k => c.toLowerCase().includes(k))
    ).length;
    if (hits >= 2) return r;

    if (fallback === -1 && cells.length >= 3) fallback = r;
  }

  return fallback === -1 ? 0 : fallback;
};

/* Columns carry their real position in the sheet, so blank spacer columns and
   repeated labels ("TIME" twice) can never aim the import at the wrong cell. */
const buildColumns = (rows: SheetRows, headerRow: number): Column[] =>
  (rows[headerRow] || [])
    .map((label, index) => ({ label: cellText(label), index }))
    .filter(col => col.label !== '');

const findColumn = (columns: Column[], needles: string[], exclude: string[] = []) => {
  const hit = columns.find(col => {
    const label = col.label.toLowerCase();
    if (exclude.some(x => label.includes(x))) return false;
    return needles.some(n => label.includes(n));
  });
  return hit ? String(hit.index) : '';
};

export const buildMapping = (rows: SheetRows, headerRow: number, categoryId = ''): SheetMapping => {
  const columns = buildColumns(rows, headerRow);

  // A sheet with one unlabelled time column means chip time, so it is claimed
  // first; a second time column is then the gun time.
  const chipCol =
    findColumn(columns, ['chip', 'net']) || findColumn(columns, ['time'], ['gun', 'gross']);
  const gunCol =
    findColumn(columns, ['gun', 'gross']) ||
    columns
      .filter(c => c.label.toLowerCase().includes('time') && String(c.index) !== chipCol)
      .map(c => String(c.index))[0] ||
    '';

  return {
    categoryId,
    headerRow,
    columns,
    bibCol: findColumn(columns, ['bib']),
    nameCol: findColumn(columns, ['name', 'participant', 'runner']),
    genderCol: findColumn(columns, ['gender', 'sex', 'sx']),
    chipCol,
    gunCol,
  };
};

export const dataRows = (rows: SheetRows, headerRow: number) =>
  rows.slice(headerRow + 1).filter(row => nonEmptyCells(row).length > 0);

export const REQUIRED_FIELDS: Record<string, string> = {
  bibCol: 'Bib Number',
  nameCol: 'Runner Name',
  genderCol: 'Gender',
  chipCol: 'Chip Time',
};

export const listPhrase = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];

/** Every sheet of the file, every row kept (the header row is found later, not
 *  assumed), with a first-guess mapping for each sheet that has any rows. */
export const readWorkbook = (binary: string | ArrayBuffer | null | undefined) => {
  const wb = XLSX.read(binary, { type: 'binary' });

  const sheetsData: Record<string, SheetRows> = {};
  const mappings: Record<string, SheetMapping> = {};

  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, dateNF: "hh:mm:ss" }) as SheetRows;
    sheetsData[name] = rows;

    if (rows.length > 0) {
      mappings[name] = buildMapping(rows, detectHeaderRow(rows));
    }
  });

  return { sheetNames: wb.SheetNames, sheetsData, mappings };
};

const formatExcelTime = (val: unknown) => {
  if (typeof val === 'number' && val > 0 && val < 1) {
    // Excel stores times as a fraction of a 24-hour day
    const totalSeconds = Math.round(val * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    // Return H:MM:SS if hours < 10 for cleaner look, otherwise HH:MM:SS
    return hours < 10 ? `${hours}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  }
  return String(val).trim();
};

/** The finishers one mapped sheet holds. A row missing its bib, name or chip
 *  time is not read as a finish, so it is left out. */
export const sheetResults = (rows: SheetRows, mapping: SheetMapping): ResultRow[] => {
  // Values are real sheet column indexes, so they are used as they are.
  const bibIdx = Number(mapping.bibCol);
  const nameIdx = Number(mapping.nameCol);
  const genderIdx = Number(mapping.genderCol);
  const chipIdx = Number(mapping.chipCol);
  const gunIdx = mapping.gunCol === '' ? -1 : Number(mapping.gunCol);

  const results: ResultRow[] = [];
  dataRows(rows, mapping.headerRow).forEach(row => {
    if (row[bibIdx] && row[nameIdx] && row[chipIdx]) {
      results.push({
        categoryId: mapping.categoryId,
        bibNumber: String(row[bibIdx]).trim(),
        name: String(row[nameIdx]).trim(),
        gender: String(row[genderIdx] || 'Unknown').trim(),
        chipTime: formatExcelTime(row[chipIdx]),
        gunTime: (gunIdx >= 0 && row[gunIdx]) ? formatExcelTime(row[gunIdx]) : null,
        status: 'FINISHED'
      });
    }
  });
  return results;
};
