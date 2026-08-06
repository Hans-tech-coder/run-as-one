"use client";

import React, { useState } from 'react';
import { Plus, Tag, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PromoCodesClient({ initialPromos, organizerId }: { initialPromos: any[], organizerId: string }) {
  const router = useRouter();
  const [promos, setPromos] = useState(initialPromos);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    usageLimit: ''
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch('/api/admin/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          organizerId,
          discountValue: parseFloat(formData.discountValue),
          usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      
      setPromos([data, ...promos]);
      setShowModal(false);
      setFormData({ code: '', discountType: 'PERCENTAGE', discountValue: '', usageLimit: '' });
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h2 className="admin-panel-title">Discount Codes</h2>
          <button 
            onClick={() => setShowModal(true)}
            className="btn-gradient px-4 py-2 flex items-center gap-2 text-sm"
          >
            <Plus size={16} /> New Code
          </button>
        </div>
        
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Used</th>
                <th>Limit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {promos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-secondary">
                    No promo codes created yet.
                  </td>
                </tr>
              ) : (
                promos.map(promo => (
                  <tr key={promo.id}>
                    <td className="font-bold text-accent-blue">{promo.code}</td>
                    <td>{promo.discountType}</td>
                    <td>{promo.discountType === 'PERCENTAGE' ? `${promo.discountValue}%` : `₱${promo.discountValue.toLocaleString()}`}</td>
                    <td>{promo.usageCount}</td>
                    <td>{promo.usageLimit || 'Unlimited'}</td>
                    <td>
                      <span className={`status-badge ${(!promo.usageLimit || promo.usageCount < promo.usageLimit) ? 'success' : 'pending'}`}>
                        {(!promo.usageLimit || promo.usageCount < promo.usageLimit) ? 'Active' : 'Fully Used'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-secondary hover:text-white"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Tag size={20} className="text-accent-orange" />
              Create Promo Code
            </h2>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Code (e.g. EARLYBIRD20)</label>
                <input 
                  type="text" 
                  required
                  className="form-input" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                />
              </div>
              
              <div className="flex gap-4">
                <div className="form-group flex-1">
                  <label className="form-label">Discount Type</label>
                  <select 
                    className="form-input"
                    value={formData.discountType}
                    onChange={e => setFormData({...formData, discountType: e.target.value})}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (₱)</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Value</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    className="form-input" 
                    value={formData.discountValue}
                    onChange={e => setFormData({...formData, discountValue: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Usage Limit (Leave blank for unlimited)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  min="1"
                  value={formData.usageLimit}
                  onChange={e => setFormData({...formData, usageLimit: e.target.value})}
                />
              </div>
              
              <button 
                type="submit" 
                className="btn-gradient w-full mt-4"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Promo Code'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
