'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, Play, X, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

export default function ResultsUploaderClient({ event }: { event: any }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheetsData, setSheetsData] = useState<Record<string, any[]>>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
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
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        const newSheetsData: Record<string, any[]> = {};
        const initialMappings: Record<string, any> = {};
        
        wb.SheetNames.forEach(name => {
          // Read first row as headers
          const ws = wb.Sheets[name];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, dateNF: "hh:mm:ss" });
          newSheetsData[name] = data.slice(1); // Keep the data rows
          
          if (data.length > 0) {
            // First row represents the headers
            const headers = (data[0] as any[]).map(String);
            
            initialMappings[name] = {
              categoryId: '',
              bibCol: headers.find(h => h.toLowerCase().includes('bib')) || '',
              nameCol: headers.find(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('participant')) || '',
              genderCol: headers.find(h => h.toLowerCase().includes('gender') || h.toLowerCase().includes('sex') || h.toLowerCase() === 'sx') || '',
              chipCol: headers.find(h => h.toLowerCase().includes('chip') || h.toLowerCase().includes('net')) || '',
              gunCol: headers.find(h => h.toLowerCase().includes('gun') || h.toLowerCase().includes('gross')) || '',
              availableHeaders: headers.filter(h => h.trim() !== '')
            };
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

      for (const sheetName of sheetNames) {
        const mapping = mappings[sheetName];
        if (!mapping.categoryId) continue; // Skip unmapped sheets
        
        if (!mapping.bibCol || !mapping.nameCol || !mapping.genderCol || !mapping.chipCol) {
          throw new Error(`Please map all required columns for sheet: ${sheetName}`);
        }

        const data = sheetsData[sheetName];
        const headers = mappings[sheetName].availableHeaders;
        const bibIdx = headers.indexOf(mapping.bibCol);
        const nameIdx = headers.indexOf(mapping.nameCol);
        const genderIdx = headers.indexOf(mapping.genderCol);
        const chipIdx = headers.indexOf(mapping.chipCol);
        const gunIdx = headers.indexOf(mapping.gunCol);
        
        data.forEach((row: any[]) => {
          if (row[bibIdx] && row[nameIdx] && row[chipIdx]) {
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
      }

      if (finalResults.length === 0) {
        throw new Error('No valid records found to upload. Please check your column mappings.');
      }

      const res = await fetch(`/api/admin/events/${event.id}/results/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: finalResults })
      });

      const resultData = await res.json();

      if (!res.ok) throw new Error(resultData.error || 'Upload failed');

      setSuccess(`Successfully processed and uploaded ${resultData.count} records. Overall and Gender ranks have been automatically computed!`);
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          padding: '0.375rem 0.75rem',
          fontSize: '0.875rem',
          color: '#e4e4e7',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <Plus style={{ width: '14px', height: '14px' }} />
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
              const headers = map.availableHeaders || [];

              return (
                <div key={sheetName} className="admin-panel mb-8 border border-white/10 hover:border-accent-blue/30 transition-colors">
                  <div className="admin-panel-header border-b border-gray-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.02] p-5">
                    <div className="flex flex-col">
                      <h4 className="font-bold text-lg text-white flex items-center gap-2">
                        <FileSpreadsheet size={18} className="text-accent-blue" /> {sheetName}
                      </h4>
                      <p className="text-xs text-secondary mt-1">
                        Found {sheetsData[sheetName]?.length} rows in this sheet
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
                        {event.categories.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>{cat.name} ({cat.distance})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {map.categoryId ? (
                    <div className="admin-panel-content">
                      <div className="mb-4">
                        <p className="text-sm text-secondary">Match your Excel columns to the required database fields below:</p>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Bib Number <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" value={map.bibCol} onChange={(e) => handleMappingChange(sheetName, 'bibCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Runner Name <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" value={map.nameCol} onChange={(e) => handleMappingChange(sheetName, 'nameCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Gender <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" value={map.genderCol} onChange={(e) => handleMappingChange(sheetName, 'genderCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Chip Time <span style={{ color: '#ff4d4f' }}>*</span></label>
                          <select className="form-input" value={map.chipCol} onChange={(e) => handleMappingChange(sheetName, 'chipCol', e.target.value)}>
                            <option value="" disabled>Select Column</option>
                            {headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: '1 1 160px' }}>
                          <label className="form-label mb-1 flex items-center gap-1">Gun Time <span className="text-secondary">(Optional)</span></label>
                          <select className="form-input" value={map.gunCol} onChange={(e) => handleMappingChange(sheetName, 'gunCol', e.target.value)}>
                            <option value="">None / Not Available</option>
                            {headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
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
