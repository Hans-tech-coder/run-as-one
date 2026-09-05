'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, Play, X, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

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
        className="flex items-center gap-2 border border-white/10 rounded-md h-10 px-4 text-sm text-zinc-200 bg-transparent hover:bg-white/5 transition-all cursor-pointer"
      >
        <Plus size={16} />
        Upload results
      </button>

      {mounted && isOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '1000px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Upload Race Results</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="modal-close"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body flex-col gap-6">
              {/* Upload Zone */}
      <div className="file-upload-wrapper">
        <input 
          type="file" 
          accept=".xlsx, .xls, .csv" 
          onChange={handleFileUpload}
          className="file-upload-input"
        />
        <div className="file-upload-content">
          <div className="file-upload-icon">
            <UploadCloud size={32} />
          </div>
          <div className="file-upload-title">
            {file ? file.name : "Upload Excel Results"}
          </div>
          <div className="file-upload-desc">
            {file ? "File selected. Click to replace." : "Click or drag and drop your raw timing chip output (.xlsx, .csv)"}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-500">
          <AlertCircle size={20} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/50 p-4 rounded-lg flex items-center gap-3 text-green-400">
          <CheckCircle2 size={20} />
          <p className="text-sm">{success}</p>
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

              return (
                <div key={sheetName} className="admin-panel mb-8 border border-white/10 hover:border-accent-blue/30 transition-colors">
                  <div className="admin-panel-header border-b border-gray-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.02] p-5">
                    <div className="flex flex-col">
                      <h4 className="font-bold text-lg text-white flex items-center gap-2">
                        <FileSpreadsheet size={18} className="text-accent-blue" /> {sheetName}
                      </h4>
                      <p className="text-xs text-secondary mt-1">
                        Found {rowCount} {rowCount === 1 ? 'row' : 'rows'} below the header on row {map.headerRow + 1}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-secondary whitespace-nowrap">Target Category:</label>
                      <select 
                        className="form-input"
                        value={map.categoryId}
                        onChange={(e) => handleMappingChange(sheetName, 'categoryId', e.target.value)}
                      >
                        <option value="">-- Do not import this sheet --</option>
                        {/* A fun-run package has no distance to append. */}
                        {event.categories.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>{cat.name}{cat.distance ? ` (${cat.distance})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {map.categoryId ? (
                    <div className="admin-panel-content">
                      <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <p className="text-sm text-secondary">Match your Excel columns to the required database fields below:</p>
                        <div className="form-group mb-0" style={{ flex: '0 1 320px' }}>
                          <label className="form-label mb-1">Header Row</label>
                          <select
                            className="form-input"
                            value={String(map.headerRow)}
                            onChange={(e) => handleHeaderRowChange(sheetName, Number(e.target.value))}
                          >
                            {headerRowOptions.map(opt => (
                              <option key={opt.index} value={String(opt.index)}>
                                Row {opt.index + 1}{opt.preview ? ` — ${opt.preview}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Bib Number <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" aria-invalid={missing.includes('bibCol')} value={map.bibCol} onChange={(e) => handleMappingChange(sheetName, 'bibCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {columns.map(col => <option key={col.index} value={String(col.index)}>{col.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Runner Name <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" aria-invalid={missing.includes('nameCol')} value={map.nameCol} onChange={(e) => handleMappingChange(sheetName, 'nameCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {columns.map(col => <option key={col.index} value={String(col.index)}>{col.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Gender <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" aria-invalid={missing.includes('genderCol')} value={map.genderCol} onChange={(e) => handleMappingChange(sheetName, 'genderCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {columns.map(col => <option key={col.index} value={String(col.index)}>{col.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Chip Time <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" aria-invalid={missing.includes('chipCol')} value={map.chipCol} onChange={(e) => handleMappingChange(sheetName, 'chipCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {columns.map(col => <option key={col.index} value={String(col.index)}>{col.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Gun Time <span className="text-secondary">(Optional)</span></label>
                          <select className="form-input" value={map.gunCol} onChange={(e) => handleMappingChange(sheetName, 'gunCol', e.target.value)}>
                            <option value="">None / Not Available</option>
                            {columns.map(col => <option key={col.index} value={String(col.index)}>{col.label}</option>)}
                          </select>
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
          
          <div className="form-actions" style={{ marginTop: '24px' }}>
            <button 
              className="btn-gradient flex items-center gap-2"
              onClick={processAndUpload}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : (
                <>
                  <Play size={18} />
                  Process & Upload Results
                </>
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
