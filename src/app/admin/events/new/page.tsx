"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud, Trash, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import RegistrationFormPicker from '../RegistrationFormPicker';
import EventOptionsPanel from '../EventOptionsPanel';
import { blankCategory, type CategoryDraft } from '../category-draft';
import { DEFAULT_REGISTRATION_FORM, type RegistrationForm } from '@/lib/registration-form';
import { DEFAULT_EVENT_TYPE, type EventType } from '@/lib/event-type';
import ConsentWaiverField from '@/app/admin/events/ConsentWaiverField';
import BankAccountsPanel from '@/app/admin/events/BankAccountsPanel';
import { cleanBankAccounts, type BankAccountDraft } from '@/app/admin/events/bank-account-draft';
import { offersBankTransfer } from '@/lib/registration-form';

export default function NewEventPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [successMsg, setSuccessMsg] = useState('');
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isSuccessClosing, setIsSuccessClosing] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    imageUrl: '',
    raceKitImageUrl: '',
    description: '',
    logisticsPickup: true,
    logisticsDeliveryFeeInside: 0,
    logisticsDeliveryFeeOutside: 0,
    // Pesos on this form; the API converts to centavos. ₱60 is the long-standing
    // default every event used back when the fee lived on the organizer.
    adminFee: 60,
    shirtSizeUpcharge: 100,
    consentWaiver: '',
    registrationForm: DEFAULT_REGISTRATION_FORM as RegistrationForm,
  });

  const [uploadingField, setUploadingField] = useState<string | null>(null);
  // How many category posters are uploading right now, for the same reason as
  // uploadingField: saving mid-upload would store a category without its
  // poster. A count rather than a boolean because two rows can upload at once,
  // and a latched flag would clear on the first one to finish.
  const [uploadingPosters, setUploadingPosters] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>([]);
  // Distances or packages. Freely switchable here — nothing is sold yet.
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE);

  // Uploads to blob storage and stores the returned URL. This used to inline the
  // file as a base64 data URL, which meant every event row carried megabytes of
  // text that each listing query then had to pull down.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setFormData(prev => ({ ...prev, [field]: data.url }));
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      e.target.value = '';
    } finally {
      setUploadingField(null);
    }
  };

  const [categories, setCategories] = useState<CategoryDraft[]>([blankCategory()]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic Validation
    if (!formData.title || !formData.date || !formData.location) {
      setError('Title, date, and location are required.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, eventType, categories, bankAccounts: cleanBankAccounts(bankAccounts) }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create event');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('Event created successfully!');
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      requestAnimationFrame(() => setIsOpen(true));
    }
  }, [error]);

  const closeErrorModal = () => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setError('');
    }, 150);
  };

  useEffect(() => {
    if (successMsg) {
      requestAnimationFrame(() => setIsSuccessOpen(true));
    }
  }, [successMsg]);

  const closeSuccessModal = () => {
    setIsSuccessOpen(false);
    setIsSuccessClosing(true);
    setTimeout(() => {
      setIsSuccessClosing(false);
      setSuccessMsg('');
      router.push('/admin/events');
    }, 150);
  };

  return (
    <>
      <header className="admin-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/events" className="text-secondary hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title">Create New Event</h1>
        </div>
      </header>

      <div className="admin-content max-w-4xl mx-auto">
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            error && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ zIndex: 100 }}
        >
          <div 
            className={`t-modal w-full max-w-md bg-[#111] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
            role="dialog"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500 shrink-0 mt-1">
                <AlertCircle size={24} strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold text-white">Action Failed</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{error}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-white/5">
              <button 
                type="button"
                onClick={closeErrorModal} 
                className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-white transition-colors"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>

        {/* Success Modal */}
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            successMsg && !isSuccessClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ zIndex: 100 }}
        >
          <div 
            className={`t-modal w-full max-w-md bg-[#111] border border-green-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isSuccessOpen ? 'is-open' : ''} ${isSuccessClosing ? 'is-closing' : ''}`}
            role="dialog"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500/10 rounded-full text-green-500 shrink-0 mt-1">
                <CheckCircle size={24} strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold text-white">Success</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{successMsg}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-white/5">
              <button 
                type="button"
                onClick={closeSuccessModal} 
                className="px-5 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium text-white transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="admin-form">
          {/* Basic Info */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Basic Information</h2>
            </div>
            <div className="admin-panel-content">
              <div className="form-grid">
              <div className="form-group form-group-full">
                <label className="form-label">Event Title</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="form-input"
                  placeholder="e.g. Manila Midnight Marathon 2025"
                  required
                />
              </div>
              <div className="form-group form-group-full">
                <label className="form-label">
                  About This Event <span className="text-xs opacity-70">- optional</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="form-input"
                  rows={5}
                  placeholder="Route, assembly time, cut-off, what runners should bring — anything they'd ask about before signing up."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input 
                  type="date" 
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input 
                  type="text" 
                  value={formData.location}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  className="form-input"
                  placeholder="e.g. BGC, Taguig"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input 
                  type="time" 
                  value={formData.startTime}
                  onChange={e => setFormData({...formData, startTime: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input 
                  type="time" 
                  value={formData.endTime}
                  onChange={e => setFormData({...formData, endTime: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cover Image</label>
                {!formData.imageUrl ? (
                  <div className="file-upload-wrapper" style={{ opacity: uploadingField ? 0.6 : 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'imageUrl')}
                      className="file-upload-input"
                      disabled={uploadingField !== null}
                    />
                    <div className="file-upload-content">
                      <div className="file-upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="file-upload-title">
                        {uploadingField === 'imageUrl' ? 'Uploading…' : 'Click to upload cover image'}
                      </div>
                      <div className="file-upload-desc">SVG, PNG, JPG or GIF (max. 800x400px)</div>
                    </div>
                  </div>
                ) : (
                  <div className="file-preview">
                    <img src={formData.imageUrl} alt="Cover Preview" />
                    <div className="file-preview-overlay">
                      <button 
                        type="button" 
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                        className="btn-remove-preview"
                      >
                        <Trash size={16} /> Remove Image
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label className="form-label">Race Kit Poster (Optional)</label>
                {!formData.raceKitImageUrl ? (
                  <div className="file-upload-wrapper" style={{ opacity: uploadingField ? 0.6 : 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'raceKitImageUrl')}
                      className="file-upload-input"
                      disabled={uploadingField !== null}
                    />
                    <div className="file-upload-content">
                      <div className="file-upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="file-upload-title">
                        {uploadingField === 'raceKitImageUrl' ? 'Uploading…' : 'Click to upload race kit poster'}
                      </div>
                      <div className="file-upload-desc">Optional • PNG, JPG (ideal for social sharing)</div>
                    </div>
                  </div>
                ) : (
                  <div className="file-preview">
                    <img src={formData.raceKitImageUrl} alt="Race Kit Preview" />
                    <div className="file-preview-overlay">
                      <button 
                        type="button" 
                        onClick={() => setFormData(prev => ({ ...prev, raceKitImageUrl: '' }))}
                        className="btn-remove-preview"
                      >
                        <Trash size={16} /> Remove Poster
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

          <EventOptionsPanel
            eventType={eventType}
            onEventTypeChange={setEventType}
            options={categories}
            onChange={setCategories}
            onError={setError}
            onBusyChange={busy => setUploadingPosters(n => (busy ? n + 1 : n - 1))}
          />

          <BankAccountsPanel
            accounts={bankAccounts}
            offersBankTransfer={offersBankTransfer(formData.registrationForm)}
            onChange={setBankAccounts}
            onError={setError}
            onBusyChange={busy => setUploadingPosters(n => (busy ? n + 1 : n - 1))}
          />

          {/* Logistics Options */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Logistics & Race Kits</h2>
            </div>
            <div className="admin-panel-content">
              <div className="form-grid">
                <div className="checkbox-group form-group-full">
                  <input
                    type="checkbox"
                    id="pickup"
                    checked={formData.logisticsPickup}
                    onChange={e => setFormData({...formData, logisticsPickup: e.target.checked})}
                    className="w-5 h-5 accent-accent-blue"
                  />
                  <label htmlFor="pickup" className="text-primary font-medium">Allow On-site Pickup (Free)</label>
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery — Inside Province (₱) <span className="text-xs opacity-70">- 0 to hide this option</span></label>
                  <input
                    type="number"
                    value={formData.logisticsDeliveryFeeInside}
                    onChange={e => setFormData({...formData, logisticsDeliveryFeeInside: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery — Outside Province (₱) <span className="text-xs opacity-70">- 0 to hide this option</span></label>
                  <input
                    type="number"
                    value={formData.logisticsDeliveryFeeOutside}
                    onChange={e => setFormData({...formData, logisticsDeliveryFeeOutside: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                </div>
                <p className="form-group-full text-xs text-secondary">
                  Runners pick their own zone at checkout. Leave both at 0 to offer pickup only.
                </p>
              </div>
            </div>
          </div>

          {/* Registration & Fees */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Registration & Fees</h2>
            </div>
            <div className="admin-panel-content">
              <div className="flex flex-col gap-6">
                <div className="form-group">
                  <label className="form-label">Admin Fee (₱) <span className="text-xs opacity-70">- charged per runner</span></label>
                  <input
                    type="number"
                    value={formData.adminFee}
                    onChange={e => setFormData({...formData, adminFee: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Large Size Surcharge (₱) <span className="text-xs opacity-70">- added once per runner in 4XL or above</span></label>
                  <input
                    type="number"
                    value={formData.shirtSizeUpcharge}
                    onChange={e => setFormData({...formData, shirtSizeUpcharge: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                  <p className="text-xs opacity-70 mt-1">
                    Set to 0 if the larger sizes cost the same. Only charged to runners
                    whose package actually includes a singlet or shirt.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Registration Form</label>
                  <RegistrationFormPicker
                    value={formData.registrationForm}
                    onChange={value => setFormData({...formData, registrationForm: value})}
                  />
                </div>
                <ConsentWaiverField
                  value={formData.consentWaiver}
                  eventTitle={formData.title}
                  onChange={next => setFormData({...formData, consentWaiver: next})}
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Link href="/admin/events" className="btn-cancel">
              Cancel
            </Link>
            {/* Saving mid-upload would store the event without its image URL. */}
            <button
              type="submit"
              disabled={isLoading || uploadingField !== null || uploadingPosters > 0}
              className="btn-gradient px-8 py-3 rounded-lg font-medium"
            >
              {isLoading ? 'Saving...' : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
