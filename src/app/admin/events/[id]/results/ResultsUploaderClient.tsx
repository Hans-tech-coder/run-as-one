'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, CheckCircle2, AlertCircle, Play, X, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import BusyLabel from '@/components/ui/BusyLabel';
import SheetMappingPanel from './SheetMappingPanel';
import type { UploadCategory } from './TargetCategoryPicker';
import {
  buildMapping,
  listPhrase,
  readWorkbook,
  REQUIRED_FIELDS,
  sheetResults,
  type MappingField,
  type ResultRow,
  type SheetMapping,
  type SheetRows,
} from './results-sheet';

/* The upload modal: the file, each sheet's mapping, and the one POST that
   replaces the mapped categories' results. Reading the sheet lives in
   results-sheet.ts and each sheet's form in SheetMappingPanel. */
export default function ResultsUploaderClient({ event }: { event: { id: string; categories: UploadCategory[] } }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheetsData, setSheetsData] = useState<Record<string, SheetRows>>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [invalidFields, setInvalidFields] = useState<Record<string, string[]>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Mapping configuration per sheet
  const [mappings, setMappings] = useState<Record<string, SheetMapping>>({});

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
        const workbook = readWorkbook(evt.target?.result);
        setSheetNames(workbook.sheetNames);
        setSheetsData(workbook.sheetsData);
        setMappings(workbook.mappings);
      } catch {
        setError('Failed to parse Excel file. Please ensure it is a valid .xlsx or .csv format.');
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const handleMappingChange = (sheetName: string, field: MappingField, value: string) => {
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

  const processAndUpload = async () => {
    setIsProcessing(true);
    setError('');
    setSuccess('');

    try {
      const finalResults: ResultRow[] = [];

      const importedSheets = sheetNames.filter(name => mappings[name]?.categoryId);
      if (importedSheets.length === 0) {
        throw new Error('No sheet is set to be imported. Choose a Target Category for at least one sheet.');
      }

      // Name every unmapped field on every sheet in one go, and mark them, so the
      // organizer never has to guess which dropdown the complaint is about.
      const missingBySheet: Record<string, string[]> = {};
      importedSheets.forEach(name => {
        const missing = Object.keys(REQUIRED_FIELDS).filter(field => !mappings[name][field as MappingField]);
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
        const rows = sheetResults(sheetsData[sheetName] || [], mappings[sheetName]);
        finalResults.push(...rows);
        if (rows.length === 0) emptySheets.push(sheetName);
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

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
              const mapping = mappings[sheetName];
              if (!mapping) return null;
              return (
                <SheetMappingPanel
                  key={sheetName}
                  sheetName={sheetName}
                  rows={sheetsData[sheetName] || []}
                  mapping={mapping}
                  missing={invalidFields[sheetName] || []}
                  categories={event.categories}
                  onFieldChange={(field, value) => handleMappingChange(sheetName, field, value)}
                  onHeaderRowChange={headerRow => handleHeaderRowChange(sheetName, headerRow)}
                />
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
