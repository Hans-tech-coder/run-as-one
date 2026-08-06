"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, Download, Eye, MoreVertical, CheckCircle, Trash2, Edit, X } from 'lucide-react';

interface RegistrantsTableProps {
  eventId: string;
  runners: any[];
}

export default function RegistrantsTable({ eventId, runners: initialRunners }: RegistrantsTableProps) {
  const [runners, setRunners] = useState(initialRunners);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewingRunner, setViewingRunner] = useState<any | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeDropdown) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const handleStatusChange = async (registrationId: string, newStatus: string) => {
    setUpdatingId(registrationId);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setRunners(runners.map(r => r.registrationId === registrationId ? { ...r, status: newStatus } : r));
      } else {
        console.error('Failed to update status');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };
  
  const filteredRunners = runners.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.orderRef.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCSV = () => {
    const headers = [
      'Order Ref', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Birthdate', 
      'Category', 'Distance', 'Singlet Size', 'Emergency Contact', 'Emergency Phone', 
      'Medical Conditions', 'Logistics Method', 'Delivery Address', 'Payment Method', 'Status'
    ];
    
    const csvRows = filteredRunners.map(r => 
      [
        r.orderRef, r.firstName, r.lastName, r.email, r.phone, r.gender, r.birthdate,
        r.category, r.distance, r.size, r.emergencyContactName, r.emergencyContactPhone,
        `"${r.medicalConditions}"`, r.logisticsMethod, `"${r.deliveryAddress}"`, r.paymentMethod, r.status
      ].join(',')
    );
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `registrants_event_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by name, email, or order ref..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="toolbar-actions">
          <button className="btn-filter">
            <Filter size={16} /> Filter
          </button>
          <button onClick={handleExportCSV} className="btn-export">
            <Download size={16} /> Export to CSV
          </button>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order Ref</th>
              <th>Name</th>
              <th>Category</th>
              <th>Size</th>
              <th>Logistics</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRunners.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-secondary">
                  No registrants found.
                </td>
              </tr>
            ) : (
              filteredRunners.map((runner) => (
                <tr key={runner.id}>
                  <td className="text-secondary">
                    <div className="flex items-center gap-2">
                      {runner.orderRef}
                      <button 
                        onClick={() => setViewingRunner(runner)}
                        className="icon-btn"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </td>
                  <td className="font-medium text-primary">
                    <div>{runner.name}</div>
                    <div className="text-xs text-secondary font-normal">{runner.email}</div>
                  </td>
                  <td>{runner.category}</td>
                  <td>{runner.size}</td>
                  <td className="capitalize">{runner.logisticsMethod}</td>
                  <td className="capitalize">{runner.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : runner.paymentMethod}</td>
                  <td>
                    <span className={`status-badge ${runner.status === 'PAID' ? 'success' : 'pending'}`}>
                      {runner.status}
                    </span>
                  </td>
                  <td className="action-dropdown-container">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === runner.id ? null : runner.id);
                      }}
                      className={`action-dropdown-btn ${activeDropdown === runner.id ? 'active' : ''}`}
                    >
                      <MoreVertical size={18} />
                    </button>
                    
                    {activeDropdown === runner.id && (
                      <div className="action-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                        <button className="action-dropdown-item">
                          <Edit size={14} /> Edit Registrant
                        </button>
                        
                        {runner.status === 'PENDING' && runner.paymentMethod === 'bank_transfer' && (
                          <button 
                            onClick={() => handleStatusChange(runner.registrationId, 'PAID')}
                            disabled={updatingId === runner.registrationId}
                            className="action-dropdown-item success"
                          >
                            <CheckCircle size={14} /> Validate Payment
                          </button>
                        )}
                        
                        <div className="action-dropdown-divider"></div>
                        <button className="action-dropdown-item danger">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewingRunner && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">Registrant Details</h3>
              <button onClick={() => setViewingRunner(null)} className="modal-close">
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="modal-grid">
                <div className="modal-section">
                  <h4 className="modal-section-title">Runner Info</h4>
                  <div className="modal-details">
                    <p><span className="label">Name:</span> <span className="value">{viewingRunner.name}</span></p>
                    <p><span className="label">Email:</span> <span className="value">{viewingRunner.email}</span></p>
                    <p><span className="label">Phone:</span> <span className="value">{viewingRunner.phone}</span></p>
                    <p><span className="label">Gender:</span> <span className="value capitalize">{viewingRunner.gender}</span></p>
                    <p><span className="label">Birthdate:</span> <span className="value">{viewingRunner.birthdate}</span></p>
                  </div>
                </div>
                
                <div className="modal-section">
                  <h4 className="modal-section-title">Race Details</h4>
                  <div className="modal-details">
                    <p><span className="label">Category:</span> <span className="value">{viewingRunner.category}</span></p>
                    <p><span className="label">Distance:</span> <span className="value">{viewingRunner.distance}</span></p>
                    <p><span className="label">Singlet Size:</span> <span className="value">{viewingRunner.size}</span></p>
                  </div>
                </div>
              </div>
              
              <div className="modal-grid">
                <div className="modal-section">
                  <h4 className="modal-section-title">Emergency Contact</h4>
                  <div className="modal-details">
                    <p><span className="label">Name:</span> <span className="value">{viewingRunner.emergencyContactName}</span></p>
                    <p><span className="label">Phone:</span> <span className="value">{viewingRunner.emergencyContactPhone}</span></p>
                  </div>
                </div>
                
                <div className="modal-section">
                  <h4 className="modal-section-title">Medical Info</h4>
                  <div className="modal-details">
                    <p className="value" style={{ lineHeight: '1.5' }}>{viewingRunner.medicalConditions}</p>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h4 className="modal-section-title">Transaction Details</h4>
                <div className="modal-details">
                  <p><span className="label">Order Ref:</span> <span className="value">{viewingRunner.orderRef}</span></p>
                  <p><span className="label">Status:</span> 
                    <span className={`status-badge ${viewingRunner.status === 'PAID' ? 'success' : 'pending'}`} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                      {viewingRunner.status}
                    </span>
                  </p>
                  <p><span className="label">Payment Method:</span> <span className="value capitalize">{viewingRunner.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : viewingRunner.paymentMethod}</span></p>
                  <p><span className="label">Logistics:</span> <span className="value capitalize">{viewingRunner.logisticsMethod}</span></p>
                  {viewingRunner.logisticsMethod === 'delivery' && (
                    <p><span className="label">Address:</span> <span className="value">{viewingRunner.deliveryAddress}</span></p>
                  )}
                  {viewingRunner.paymentMethod === 'bank_transfer' && viewingRunner.transactionNumber && (
                    <p><span className="label">Transaction No.:</span> <span className="value">{viewingRunner.transactionNumber}</span></p>
                  )}
                  
                  {viewingRunner.paymentMethod === 'bank_transfer' && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <p className="value" style={{ marginBottom: '0.5rem' }}>Proof of Payment</p>
                      {viewingRunner.proofOfPayment ? (
                        <div className="mt-2 rounded-lg overflow-hidden border border-gray-800" style={{ maxHeight: '300px' }}>
                          <img 
                            src={viewingRunner.proofOfPayment} 
                            alt="Proof of Payment" 
                            className="w-full object-contain"
                            style={{ maxHeight: '300px' }}
                          />
                        </div>
                      ) : (
                        <div className="modal-proof-box">
                          <Eye size={24} style={{ marginBottom: '0.25rem', opacity: 0.5 }} />
                          <p style={{ fontSize: '0.75rem', margin: 0 }}>No image attached yet</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {viewingRunner.status === 'PENDING' && viewingRunner.paymentMethod === 'bank_transfer' && (
                  <button 
                    onClick={() => {
                      handleStatusChange(viewingRunner.registrationId, 'PAID');
                      setViewingRunner({ ...viewingRunner, status: 'PAID' });
                    }}
                    disabled={updatingId === viewingRunner.registrationId}
                    className="btn-gradient"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    <CheckCircle size={16} style={{ display: 'inline', marginRight: '0.5rem', marginBottom: '2px' }} />
                    {updatingId === viewingRunner.registrationId ? 'Validating...' : 'Validate Payment'}
                  </button>
                )}
              </div>
              <button 
                onClick={() => setViewingRunner(null)}
                className="modal-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
