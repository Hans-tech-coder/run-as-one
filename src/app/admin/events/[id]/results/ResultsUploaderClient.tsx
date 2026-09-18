'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, Play, X, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';
import AdminSelect from '../../../AdminSelect';
import BusyLabel from '@/components/ui/BusyLabel';

type Column = { label: string; index: number };

/* Timing software almost never puts the column labels in row 1. A chip-timing
   export normally opens with a banner — the event name, the word "Results", the
   distance — and a few spacer rows before the real header. Reading row 1 as the
   header turns the whole mapper into a single nonsense option, so the header row
   is detected instead of assumed. */
const HEADER_KEYWORDS = [
  'bib', 'name', 'gender', 'sex', 'chip', 'gun', 'net', 'gross', 'time',
  'pos', 'rank', 'place', 'age', 'cat', 'team', 'club', 'finish', 'div',
];

const cellText = (value: any) => String(value ?? '').trim();

const nonEmptyCells = (row: any[] | undefined) => (row || []).map(cellText).filter(Boolean);

const detectHeaderRow = (rows: any[][]) => {
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
const buildColumns = (rows: any[][], headerRow: number): Column[] =>
  (rows[headerRow] || [])
    .map((label: any, index: number) => ({ label: cellText(label), index }))
    .filter((col: Column) => col.label !== '');

const findColumn = (columns: Column[], needles: string[], exclude: string[] = []) => {
  const hit = columns.find(col => {
    const label = col.label.toLowerCase();
    if (exclude.some(x => label.includes(x))) return false;
    return needles.some(n => label.includes(n));
  });
  return hit ? String(hit.index) : '';
};

const buildMapping = (rows: any[][], headerRow: number, categoryId = '') => {
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

const dataRows = (rows: any[][], headerRow: number) =>
  rows.slice(headerRow + 1).filter(row => nonEmptyCells(row).length > 0);

const REQUIRED_FIELDS: Record<string, string> = {
  bibCol: 'Bib Number',
  nameCol: 'Runner Name',
  genderCol: 'Gender',
  chipCol: 'Chip Time',
};

const listPhrase = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];

export default function ResultsUploaderClient({ event }: { event: any }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheetsData, setSheetsData] = useState<Record<string, any[][]>>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [invalidFields, setInvalidFields] = useState<Record<string, string[]>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Mapping configuration per sheet
  // sheetName -> { categoryId, bibCol, nameCol, genderCol, chipCol, gunCol }
  const [mappings, setMappings] = useState<Record<string, any>>({});
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setError('');
    setSuccess('');
    setInvalidFields({});

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        const newSheetsData: Record<string, any[][]> = {};
        const initialMappings: Record<string, any> = {};

        wb.SheetNames.forEach(name => {
          // Every row is kept: the header row is found below, not assumed.
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, dateNF: "hh:mm:ss" }) as any[][];
          newSheetsData[name] = rows;

          if (rows.length > 0) {
            initialMappings[name] = buildMapping(rows, detectHeaderRow(rows));
          }
        });

        setSheetNames(wb.SheetNames);
        setSheetsData(newSheetsData);
        setMappings(initialMappings);
      } catch (err) {
        setError('Failed to parse Excel file. Please ensure it is a valid .xlsx or .csv format.');
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const handleMappingChange = (sheetName: string, field: string, value: string) => {
    setMappings(prev => ({
      ...prev,
      [sheetName]: {
        ...prev[sheetName],
        [field]: value
      }
    }));
    // The field just answered the complaint against it, so drop the red border.
    setInvalidFields(prev => {
      if (!prev[sheetName]?.includes(field)) return prev;
      const remaining = prev[sheetName].filter(f => f !== field);
      const next = { ...prev };
      if (remaining.length) next[sheetName] = remaining;
      else delete next[sheetName];
      return next;
    });
  };

  // Re-reading the sheet from a different header row re-guesses every column,
  // so a wrong detection is one dropdown away from being corrected.
  const handleHeaderRowChange = (sheetName: string, headerRow: number) => {
    setMappings(prev => ({
      ...prev,
      [sheetName]: buildMapping(sheetsData[sheetName] || [], headerRow, prev[sheetName]?.categoryId || '')
    }));
    setInvalidFields(prev => {
      if (!prev[sheetName]) return prev;
      const next = { ...prev };
      delete next[sheetName];
      return next;
    });
  };

  const formatExcelTime = (val: any) => {
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

  const processAndUpload = async () => {
    setIsProcessing(true);
    setError('');
    setSuccess('');

    try {
      const finalResults: any[] = [];

      const importedSheets = sheetNames.filter(name => mappings[name]?.categoryId);
      if (importedSheets.length === 0) {
        throw new Error('No sheet is set to be imported. Choose a Target Category for at least one sheet.');
      }

      // Name every unmapped field on every sheet in one go, and mark them, so the
      // organizer never has to guess which dropdown the complaint is about.
      const missingBySheet: Record<string, string[]> = {};
      importedSheets.forEach(name => {
        const missing = Object.keys(REQUIRED_FIELDS).filter(field => !mappings[name][field]);
        if (missing.length) missingBySheet[name] = missing;
      });

      if (Object.keys(missingBySheet).length > 0) {
        setInvalidFields(missingBySheet);
        throw new Error(
          Object.entries(missingBySheet)
            .map(([name, fields]) =>
              `${name}: choose a column for ${listPhrase(fields.map(f => REQUIRED_FIELDS[f]))}.`)
            .join(' ')
        );
      }
      setInvalidFields({});

      const emptySheets: string[] = [];

      for (const sheetName of importedSheets) {
        const mapping = mappings[sheetName];

        // Values are real sheet column indexes, so they are used as they are.
        const bibIdx = Number(mapping.bibCol);
        const nameIdx = Number(mapping.nameCol);
        const genderIdx = Number(mapping.genderCol);
        const chipIdx = Number(mapping.chipCol);
        const gunIdx = mapping.gunCol === '' ? -1 : Number(mapping.gunCol);

        let kept = 0;
        dataRows(sheetsData[sheetName] || [], mapping.headerRow).forEach((row: any[]) => {
          if (row[bibIdx] && row[nameIdx] && row[chipIdx]) {
            kept++;
            finalResults.push({
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

        if (kept === 0) emptySheets.push(sheetName);
      }

      if (finalResults.length === 0) {
        throw new Error(
          `No rows could be read from ${listPhrase(emptySheets)}. Check that the Header Row points at the row holding the column labels.`
        );
      }

      const res = await fetch(`/api/admin/events/${event.id}/results/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: finalResults })
      });

      const resultData = await res.json();

      if (!res.ok) throw new Error(resultData.error || 'Upload failed');

      const skipped = emptySheets.length
        ? ` No usable rows were found in ${listPhrase(emptySheets)}, so ${emptySheets.length > 1 ? 'those sheets were' : 'that sheet was'} skipped.`
        : '';
      setSuccess(`Successfully processed and uploaded ${resultData.count} records. Overall and Gender ranks have been automatically computed!${skipped}`);
      setTimeout(() => {
        setIsOpen(false);
        router.refresh();
      }, 2000);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="btn-light"
      >
        <Plus size={16} />
        Upload results
      </button>

      {mounted && isOpen && createPortal(
        <div className="modal-overlay">
          {/* The older modal frame, capped at the viewport by .admin-modal-panel
              so its body scrolls inside it on a phone rather than the whole
              sheet running off the bottom of the screen. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-results-title"
            className="modal-container admin-modal-panel"
            style={{ maxWidth: '1000px' }}
          >
            <div className="modal-header">
              <h2 id="upload-results-title" className="modal-title">Upload Race Results</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="modal-close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body admin-modal-body flex-col gap-6">
              {/* Upload Zone */}
      <div className="file-upload-wrapper">
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="file-upload-input"
        />
        <div className="file-upload-content max-w-full">
          <div className="file-upload-icon">
            <UploadCloud size={32} />
          </div>
          {/* A timing export's file name is as long as its software made it. */}
          <div className="file-upload-title max-w-full [overflow-wrap:anywhere]">
            {file ? file.name : "Upload Excel Results"}
          </div>
          <div className="file-upload-desc">
            {file ? "File selected. Click to replace." : "Click or drag and drop your raw timing chip output (.xlsx, .csv)"}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-[var(--status-danger)]">
          <AlertCircle size={20} className="shrink-0" />
          <p className="text-sm min-w-0 [overflow-wrap:anywhere]">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/50 p-4 rounded-lg flex items-center gap-3 text-[var(--status-success)]">
          <CheckCircle2 size={20} className="shrink-0" />
          <p className="text-sm min-w-0 [overflow-wrap:anywhere]">{success}</p>
        </div>
      )}

      {/* Mapper UI */}
      {sheetNames.length > 0 && (
        <div className="modal-section" style={{ marginTop: '24px' }}>
          <h3 className="modal-section-title" style={{ fontSize: '1rem' }}>Column Mapping</h3>
          <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
            Map the columns from your Excel sheets to our database fields. If a sheet should not be imported, leave its Event Category unselected.
          </p>
          
          <div className="grid grid-cols-1 gap-6">
            {sheetNames.map(sheetName => {
              const map = mappings[sheetName];
              if (!map) return null;
              const columns: Column[] = map.columns || [];
              const rows: any[][] = sheetsData[sheetName] || [];
              const rowCount = dataRows(rows, map.headerRow).length;
              const missing: string[] = invalidFields[sheetName] || [];

              // Only the top of the sheet can plausibly hold labels, and a row
              // has to say something to be worth offering.
              const headerRowOptions = rows
                .slice(0, 30)
                .map((row, index) => ({ index, preview: nonEmptyCells(row).slice(0, 5).join(', ') }))
                .filter(opt => opt.preview !== '' || opt.index === map.headerRow);

              // A column's real sheet index is its value, so a repeated label
              // ("TIME" twice) still points the import at one cell.
              const columnOptions = columns.map(col => ({ value: String(col.index), label: col.label }));

              const columnError = (field: string) =>
                missing.includes(field)
                  ? `Choose the column that holds the ${REQUIRED_FIELDS[field].toLowerCase()}.`
                  : undefined;

              const required = (text: string) => (
                <>{text} <span style={{ color: 'var(--status-danger)' }}>*</span></>
              );

              return (
                // Visible overflow, not the panel's usual hidden: the column
                // pickers open their lists downward, and the last row of them
                // would otherwise be cut off at the panel's edge.
                <div
                  key={sheetName}
                  className="admin-panel mb-8 border border-[var(--dash-border)] hover:border-accent-blue/30 transition-colors"
                  style={{ overflow: 'visible' }}
                >
                  <div className="admin-panel-header border-b border-[var(--dash-border)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--ink-02)] p-5 rounded-t-[var(--radius-xl)]">
                    <div className="flex flex-col min-w-0 max-md:self-stretch">
                      <h4 className="font-bold text-lg text-primary flex items-center gap-2 min-w-0 [overflow-wrap:anywhere]">
                        <FileSpreadsheet size={18} className="text-accent-blue-ink shrink-0" /> {sheetName}
                      </h4>
                      <p className="text-xs text-secondary mt-1">
                        Found {rowCount} {rowCount === 1 ? 'row' : 'rows'} below the header on row {map.headerRow + 1}
                      </p>
                    </div>

                    <div className="w-full md:w-72 md:shrink-0 max-md:self-stretch">
                      <AdminSelect
                        label="Target Category"
                        listboxLabel={`Category the ${sheetName} sheet imports into`}
                        value={map.categoryId}
                        onChange={value => handleMappingChange(sheetName, 'categoryId', value)}
                        options={[
                          { value: '', label: 'Do not import this sheet' },
                          // A fun-run package has no distance to append.
                          ...event.categories.map((cat: any) => ({
                            value: cat.id,
                            label: `${cat.name}${cat.distance ? ` (${cat.distance})` : ''}`,
                          })),
                        ]}
                      />
                    </div>
                  </div>

                  {map.categoryId ? (
                    <div className="admin-panel-content">
                      <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <p className="text-sm text-secondary">Match your Excel columns to the required database fields below:</p>
                        {/* The row's preview is each option's small print, and
                            the chosen row's labels are spelled out under the
                            field, where they wrap instead of stretching a
                            native select past the edge of a phone. */}
                        <div className="min-w-0 md:flex-[0_1_320px]">
                          <AdminSelect
                            label="Header Row"
                            listboxLabel={`Row of ${sheetName} that holds the column labels`}
                            value={String(map.headerRow)}
                            onChange={value => handleHeaderRowChange(sheetName, Number(value))}
                            options={headerRowOptions.map(opt => ({
                              value: String(opt.index),
                              label: `Row ${opt.index + 1}`,
                              hint: opt.preview || undefined,
                            }))}
                            hint={
                              columns.length > 0
                                ? `Columns on this row: ${columns.map(col => col.label).join(', ')}`
                                : undefined
                            }
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <AdminSelect
                            label={required('Bib Number')}
                            listboxLabel="Column holding the bib number"
                            placeholder="Select column"
                            value={map.bibCol}
                            onChange={value => handleMappingChange(sheetName, 'bibCol', value)}
                            options={columnOptions}
                            error={columnError('bibCol')}
                          />
                        </div>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <AdminSelect
                            label={required('Runner Name')}
                            listboxLabel="Column holding the runner's name"
                            placeholder="Select column"
                            value={map.nameCol}
                            onChange={value => handleMappingChange(sheetName, 'nameCol', value)}
                            options={columnOptions}
                            error={columnError('nameCol')}
                          />
                        </div>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <AdminSelect
                            label={required('Gender')}
                            listboxLabel="Column holding the gender"
                            placeholder="Select column"
                            value={map.genderCol}
                            onChange={value => handleMappingChange(sheetName, 'genderCol', value)}
                            options={columnOptions}
                            error={columnError('genderCol')}
                          />
                        </div>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <AdminSelect
                            label={required('Chip Time')}
                            listboxLabel="Column holding the chip time"
                            placeholder="Select column"
                            value={map.chipCol}
                            onChange={value => handleMappingChange(sheetName, 'chipCol', value)}
                            options={columnOptions}
                            error={columnError('chipCol')}
                          />
                        </div>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <AdminSelect
                            label={<>Gun Time <span className="text-secondary">(Optional)</span></>}
                            listboxLabel="Column holding the gun time"
                            value={map.gunCol}
                            onChange={value => handleMappingChange(sheetName, 'gunCol', value)}
                            options={[{ value: '', label: 'None / Not Available' }, ...columnOptions]}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', borderTop: '1px solid var(--glass-border)' }}>
                      Select a Target Category above to configure column mapping for this sheet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Sticky at the foot of the scrolling body on a phone
              (.admin-modal-footer), so a mapping several sheets long never
              buries the button that finishes it. */}
          <div className="form-actions admin-modal-footer" style={{ marginTop: '24px' }}>
            <button 
              className="btn-light"
              onClick={processAndUpload}
              disabled={isProcessing}
            >
              <Play size={18} />
              {isProcessing ? (
                <BusyLabel>Processing</BusyLabel>
              ) : (
                'Process & Upload Results'
              )}
            </button>
          </div>
        </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
