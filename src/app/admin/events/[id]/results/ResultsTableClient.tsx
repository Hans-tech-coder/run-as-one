'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Result {
  id: string;
  overallRank: number;
  categoryRank: number;
  genderRank: number;
  bibNumber: string;
  name: string;
  gender: string;
  category: { name: string };
  chipTime: string;
  gunTime: string | null;
}

interface ResultsTableClientProps {
  results: Result[];
}

export default function ResultsTableClient({ results }: ResultsTableClientProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  if (!results || results.length === 0) {
    return (
      <div className="admin-panel">
        <div className="admin-panel-content p-12 text-center text-secondary">
          <p>No results have been uploaded yet.</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(results.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = results.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
          <span>Leaderboard ({results.length} records)</span>
          
          <div className="flex items-center gap-4">
            <label className="text-sm font-normal text-secondary">Rows per page:</label>
            <select 
              className="form-input"
              style={{ padding: '0.25rem 2rem 0.25rem 0.5rem', height: '32px', minHeight: '32px', fontSize: '0.875rem', width: 'auto', minWidth: '70px', borderRadius: 'var(--radius-md)', backgroundPosition: 'right 0.5rem center' }}
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </h2>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Overall Rank</th>
              <th>Gender Rank</th>
              <th>Bib Number</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Category</th>
              <th>Chip Time</th>
              <th>Gun Time</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((result, index) => (
              <tr key={result.id}>
                <td className="text-secondary font-mono">{startIndex + index + 1}</td>
                <td className="font-bold text-accent-blue">#{result.categoryRank}</td>
                <td className="font-semibold text-accent-orange">#{result.genderRank}</td>
                <td>{result.bibNumber}</td>
                <td className="font-medium text-white">{result.name}</td>
                <td>{result.gender}</td>
                <td>
                  <span className="bg-white/5 px-2 py-1 rounded text-xs border border-white/10">
                    {result.category.name}
                  </span>
                </td>
                <td className="text-accent-orange font-mono">{result.chipTime}</td>
                <td className="text-secondary font-mono">{result.gunTime || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="p-4 border-t border-gray-700/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/[0.02]">
        <div className="text-sm text-secondary">
          Showing <span className="font-medium text-white">{startIndex + 1}</span> to <span className="font-medium text-white">{Math.min(startIndex + itemsPerPage, results.length)}</span> of <span className="font-medium text-white">{results.length}</span> results
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            className="icon-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          
          <div className="text-sm px-2 text-white font-medium">
            Page {currentPage} of {totalPages}
          </div>
          
          <button 
            className="icon-btn"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
