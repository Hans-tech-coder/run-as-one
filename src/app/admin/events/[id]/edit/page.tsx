"use client";

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, X, AlertCircle, CheckCircle, UploadCloud, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toPesos } from '@/lib/money';
import { formatInclusions } from '@/lib/inclusions';
import RegistrationFormPicker from '../../RegistrationFormPicker';
import EventOptionsPanel from '../../EventOptionsPanel';
import { blankCategory, type CategoryDraft } from '../../category-draft';
import { DEFAULT_REGISTRATION_FORM, asRegistrationForm, type RegistrationForm } from '@/lib/registration-form';
import { DEFAULT_EVENT_TYPE, asEventType, type EventType } from '@/lib/event-type';
import ConsentWaiverField from '@/app/admin/events/ConsentWaiverField';
import { formatWaiverParagraphs } from '@/lib/consent-waiver';
import BankAccountsPanel from '@/app/admin/events/BankAccountsPanel';
import { cleanBankAccounts, type BankAccountDraft } from '@/app/admin/events/bank-account-draft';
import { offersBankTransfer } from '@/lib/registration-form';

// The premade templates that used to sit under /public/certificates are gone —
// the only way to get a certificate background now is to upload one. An event
// saved back when the picker existed still points at a deleted file, so drop
// that path instead of previewing a 404.
const uploadedTemplate = (value: unknown) =>
  typeof value === 'string' && !value.startsWith('/certificates/template_') ? value : '';

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = React.use(params);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
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
    // Pesos on this form; the PUT route converts to centavos.
    adminFee: 60,
    shirtSizeUpcharge: 100,
    consentWaiver: '',
    registrationForm: DEFAULT_REGISTRATION_FORM as RegistrationForm,
    certificateTemplate: '',
    certificateCoordinates: JSON.stringify({ nameY: 50, timeY: 60, catY: 70 }),
  });

  // Not part of formData because EventOptionsPanel owns it rather than a plain
  // input. Editable while the event has no registrations and locked after —
  // see lockedReason where the panel is rendered. It has to be echoed back on
  // save regardless: leaving it out of the PUT would make asEventType() fall
  // back to RACE and silently retype every fun run.
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE);
  const [registrationCount, setRegistrationCount] = useState(0);

  const [categories, setCategories] = useState<CategoryDraft[]>([blankCategory()]);
  // How many category/package posters are uploading right now, for the same
  // reason as uploadingField: saving mid-upload would store a row without its
  // poster. A count rather than a boolean because two rows can upload at once,
  // and a latched flag would clear on the first one to finish.
  const [uploadingPosters, setUploadingPosters] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>([]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${id}`);
        if (!res.ok) throw new Error('Failed to fetch event');
        const data = await res.json();
        
        setFormData({
          title: data.title || '',
          date: data.date || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          location: data.location || '',
          imageUrl: data.imageUrl || '',
          raceKitImageUrl: data.raceKitImageUrl || '',
          description: data.description || '',
          logisticsPickup: data.logisticsPickup ?? true,
          // The API returns centavos; every money input on this form is pesos.
          // The PUT route converts back with toCentavos().
          logisticsDeliveryFeeInside: toPesos(data.logisticsDeliveryFeeInside),
          logisticsDeliveryFeeOutside: toPesos(data.logisticsDeliveryFeeOutside),
          adminFee: toPesos(data.adminFee),
          shirtSizeUpcharge: toPesos(data.shirtSizeUpcharge ?? 0),
          consentWaiver: formatWaiverParagraphs(data.consentWaiver),
          registrationForm: asRegistrationForm(data.registrationForm),
          certificateTemplate: uploadedTemplate(data.certificateTemplate),
          certificateCoordinates: data.certificateCoordinates || JSON.stringify({ nameY: 50, timeY: 60, catY: 70 }),
        });

        setBankAccounts(
          (data.bankAccounts ?? []).map((b: any) => ({
            id: b.id,
            bankName: b.bankName ?? '',
            accountName: b.accountName ?? '',
            accountNumber: b.accountNumber ?? '',
            qrImageUrl: b.qrImageUrl ?? '',
          })),
        );

        setEventType(asEventType(data.eventType));
        setRegistrationCount(data._count?.registrations ?? 0);

        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories.map((c: any) => ({
            id: c.id,
            name: c.name,
            distance: c.distance,
            price: toPesos(c.price),
            imageUrl: c.imageUrl || '',
            // Stored as an array, edited as lines — the same conversion the
            // money fields get, in the other direction.
            inclusions: formatInclusions(c.inclusions),
          })));
        }
      } catch (err) {
        setError('Could not load event data. Please try again.');
      } finally {
        setIsFetching(false);
      }
    };
    fetchEvent();
  }, [id]);

  // Uploads to blob storage and stores the returned URL. This used to inline the
  // file as a base64 data URL, which meant every event row carried megabytes of
  // text that each listing query then had to pull down.
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: string,
    kind: 'image' | 'template' = 'image'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!formData.title || !formData.date || !formData.location) {
      setError('Title, date, and location are required.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, eventType, categories, bankAccounts: cleanBankAccounts(bankAccounts) }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update event');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('Event updated successfully!');
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

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-secondary">Loading event...</div>
      </div>
    );
  }

  return (
    <>
      <header className="admin-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/events" className="text-secondary hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title">Edit Event</h1>
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

        {/* What the event sells. Switchable while nothing has been sold; locked
            once registrations exist — see lockedReason below. */}
        <EventOptionsPanel
            eventType={eventType}
            onEventTypeChange={setEventType}
            lockedReason={
              registrationCount > 0
                ? `Locked because ${registrationCount} registration${registrationCount === 1 ? ' has' : 's have'} already been taken. Switching now would change what those runners already paid for.`
                : null
            }
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

          {/* E-Certificate Settings */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">E-Certificate Settings</h2>
            </div>
            <div className="admin-panel-content">
              
              <div className="form-group mb-6">
                <label className="form-label">Certificate Template</label>
                <div className="file-upload-wrapper" style={{ opacity: uploadingField ? 0.6 : 1 }}>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, application/pdf"
                    onChange={e => handleImageUpload(e, 'certificateTemplate', 'template')}
                    className="file-upload-input"
                    disabled={uploadingField !== null}
                  />
                  <div className="file-upload-content">
                    <div className="file-upload-icon">
                      <UploadCloud size={32} />
                    </div>
                    <div className="file-upload-title">
                      {uploadingField === 'certificateTemplate' ? 'Uploading…' : 'Upload Certificate Template'}
                    </div>
                    <div className="file-upload-desc">PNG, JPG, or PDF (Landscape A4 recommended)</div>
                  </div>
                </div>
              </div>

              {/* Coordinates Preview */}
              {formData.certificateTemplate && (
                <div className="mt-8 border border-gray-700/50 rounded-lg p-6 bg-dark-card/50">
                  <h3 className="text-lg font-bold text-primary mb-4">Visual Layout Preview</h3>
                  <p className="text-secondary text-sm mb-6">Adjust the sliders to position the text exactly where you want it on your certificate.</p>
                  
                  <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sliders */}
                    <div className="w-full lg:w-1/3 flex flex-col gap-6">
                      {(() => {
                        let coords = { nameY: 50, timeY: 60, catY: 70 };
                        try {
                          coords = JSON.parse(formData.certificateCoordinates || '{}');
                        } catch(e) {}
                        
                        const updateCoord = (field: string, val: number) => {
                          const newCoords = { ...coords, [field]: val };
                          setFormData({ ...formData, certificateCoordinates: JSON.stringify(newCoords) });
                        };

                        return (
                          <>
                            <div>
                              <label className="form-label flex justify-between">
                                <span>Name Position (Y%)</span>
                                <span className="text-accent-blue">{coords.nameY || 50}%</span>
                              </label>
                              <input 
                                type="range" min="0" max="100" 
                                value={coords.nameY || 50} 
                                onChange={(e) => updateCoord('nameY', Number(e.target.value))}
                                className="w-full accent-accent-blue"
                              />
                            </div>
                            <div>
                              <label className="form-label flex justify-between">
                                <span>Finish Time Position (Y%)</span>
                                <span className="text-accent-blue">{coords.timeY || 60}%</span>
                              </label>
                              <input 
                                type="range" min="0" max="100" 
                                value={coords.timeY || 60} 
                                onChange={(e) => updateCoord('timeY', Number(e.target.value))}
                                className="w-full accent-accent-blue"
                              />
                            </div>
                            <div>
                              <label className="form-label flex justify-between">
                                <span>Category Position (Y%)</span>
                                <span className="text-accent-blue">{coords.catY || 70}%</span>
                              </label>
                              <input 
                                type="range" min="0" max="100" 
                                value={coords.catY || 70} 
                                onChange={(e) => updateCoord('catY', Number(e.target.value))}
                                className="w-full accent-accent-blue"
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Preview Box */}
                    <div className="w-full lg:w-2/3">
                      <div className="relative w-full aspect-[1.414] bg-dark-bg border border-gray-700/50 rounded-md overflow-hidden shadow-xl">
                        {/* Background Image */}
                        {formData.certificateTemplate.startsWith('data:application/pdf') ? (
                          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-secondary bg-dark-bg/80 z-0">
                            PDF Template Uploaded (Preview uses blank background)
                          </div>
                        ) : (
                          <img 
                            src={formData.certificateTemplate} 
                            alt="Certificate Background" 
                            className="absolute inset-0 w-full h-full object-cover z-0"
                          />
                        )}
                        
                        {/* Text Overlay */}
                        {(() => {
                          let coords = { nameY: 50, timeY: 60, catY: 70 };
                          try { coords = JSON.parse(formData.certificateCoordinates || '{}'); } catch(e) {}
                          
                          // Modern dark theme uses neon/white text, minimalist/dynamic use darker text.
                          // Just use a strong black with white stroke for maximum visibility on preview.
                          const textStyle = {
                            textShadow: '0 0 4px white, 0 0 10px white',
                            color: '#111'
                          };

                          return (
                            <div className="absolute inset-0 z-10 pointer-events-none">
                              {/* Name */}
                              <div 
                                className="absolute w-full text-center font-bold"
                                style={{ top: `${coords.nameY || 50}%`, transform: 'translateY(-50%)', fontSize: 'clamp(1rem, 3vw, 2.5rem)', ...textStyle }}
                              >
                                JUAN DELA CRUZ
                              </div>
                              {/* Time */}
                              <div 
                                className="absolute w-full text-center font-medium"
                                style={{ top: `${coords.timeY || 60}%`, transform: 'translateY(-50%)', fontSize: 'clamp(0.8rem, 1.5vw, 1.25rem)', ...textStyle }}
                              >
                                FINISH TIME: 04:32:15
                              </div>
                              {/* Category */}
                              <div 
                                className="absolute w-full text-center font-medium"
                                style={{ top: `${coords.catY || 70}%`, transform: 'translateY(-50%)', fontSize: 'clamp(0.7rem, 1.2vw, 1rem)', ...textStyle }}
                              >
                                CATEGORY: 42K FULL MARATHON
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
              {isLoading ? 'Saving...' : 'Update Event'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
