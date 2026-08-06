"use client";

import React, { useEffect, useState } from 'react';
import { Search, Filter, Edit, CheckCircle, Ban, AlertCircle } from 'lucide-react';

interface Organizer {
  id: string;
  name: string;
  email: string;
  status: string;
  adminFee: number;
  createdAt: string;
  _count: {
    events: number;
  };
}

export default function OrganizersManagementPage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAdminFee, setEditAdminFee] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const fetchOrganizers = async () => {
    try {
      const res = await fetch('/api/superadmin/organizers');
      if (res.ok) {
        const data = await res.json();
        setOrganizers(data.organizers);
      }
    } catch (error) {
      console.error('Failed to fetch organizers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!confirm(`Are you sure you want to change this organizer's status to ${newStatus}?`)) return;
    
    try {
      const res = await fetch(`/api/superadmin/organizers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (res.ok) {
        fetchOrganizers(); // Refresh list
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    }
  };

  const startEditing = (org: Organizer) => {
    setEditingId(org.id);
    setEditAdminFee(org.adminFee);
  };

  const saveAdminFee = async (id: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/superadmin/organizers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminFee: editAdminFee }),
      });
      
      if (res.ok) {
        setEditingId(null);
        fetchOrganizers(); // Refresh list
      } else {
        alert('Failed to update admin fee');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredOrganizers = organizers.filter(o => 
    o.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Organizer Accounts</h1>
      </header>

      <div className="admin-content">
        <div className="admin-panel">
          <div className="admin-toolbar">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search by name or email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="toolbar-actions">
              <button className="btn-filter">
                <Filter size={16} /> Filter
              </button>
            </div>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organizer Details</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Admin Fee</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-secondary">
                      Loading organizers...
                    </td>
                  </tr>
                ) : filteredOrganizers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-secondary">
                      No organizers found.
                    </td>
                  </tr>
                ) : (
                  filteredOrganizers.map((org) => (
                    <tr key={org.id}>
                      <td className="font-medium text-primary">
                        <div>{org.name}</div>
                        <div className="text-xs text-secondary font-normal">{org.email}</div>
                      </td>
                      <td>{org._count.events}</td>
                      <td>
                        <span className={`status-badge ${
                          org.status === 'APPROVED' ? 'success' : 
                          org.status === 'SUSPENDED' ? 'pending' : ''
                        }`} style={org.status === 'PENDING' ? { background: 'rgba(255, 255, 255, 0.1)', color: 'white' } : {}}>
                          {org.status}
                        </span>
                      </td>
                      <td>
                        {editingId === org.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-secondary">₱</span>
                            <input 
                              type="number" 
                              value={editAdminFee} 
                              onChange={(e) => setEditAdminFee(Number(e.target.value))}
                              className="form-input py-1 px-2"
                              style={{ width: '80px', minHeight: '32px' }}
                            />
                            <button 
                              onClick={() => saveAdminFee(org.id)} 
                              disabled={isSaving}
                              className="text-accent-blue text-sm"
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => setEditingId(null)} 
                              className="text-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span>₱{org.adminFee}</span>
                            <button onClick={() => startEditing(org)} className="text-secondary hover:text-accent-blue" title="Edit Admin Fee">
                              <Edit size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {org.status !== 'APPROVED' && (
                            <button 
                              onClick={() => handleStatusChange(org.id, 'APPROVED')}
                              className="btn-filter hover:text-green-500"
                              title="Approve Organizer"
                              style={{ padding: '0 10px' }}
                            >
                              <CheckCircle size={16} />
                            </button>
                          )}
                          
                          {org.status !== 'SUSPENDED' && (
                            <button 
                              onClick={() => handleStatusChange(org.id, 'SUSPENDED')}
                              className="btn-filter hover:text-red-500"
                              title="Suspend Organizer"
                              style={{ padding: '0 10px', color: '#ff4d4f' }}
                            >
                              <Ban size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
