"use client";

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, X, AlertCircle, CheckCircle, Trash2, UploadCloud, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toPesos } from '@/lib/money';

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
    logisticsDeliveryFee: 0,
    certificateTemplate: '',
    certificateCoordinates: JSON.stringify({ nameY: 50, timeY: 60, catY: 70 }),
  });

  const [categories, setCategories] = useState([
    { name: '', distance: '', price: 0 }
  ]);

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
          logisticsDeliveryFee: toPesos(data.logisticsDeliveryFee),
          certificateTemplate: data.certificateTemplate || '',
          certificateCoordinates: data.certificateCoordinates || JSON.stringify({ nameY: 50, timeY: 60, catY: 70 }),
        });

        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories.map((c: any) => ({
            id: c.id,
            name: c.name,
            distance: c.distance,
            price: toPesos(c.price)
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

  const handleAddCategory = () => {
    setCategories([...categories, { name: '', distance: '', price: 0 }]);
  };

  const handleRemoveCategory = (index: number) => {
    if (categories.length > 1) {
      const newCats = [...categories];
      newCats.splice(index, 1);
      setCategories(newCats);
    }
  };

  const handleCategoryChange = (index: number, field: string, value: string | number) => {
    const newCats = [...categories];
    newCats[index] = { ...newCats[index], [field]: value };
    setCategories(newCats);
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
        body: JSON.stringify({ ...formData, categories }),
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

        {/* Categories */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Distance Categories</h2>
            </div>
            <div className="admin-panel-content">
              <div className="flex flex-col gap-4">
                {categories.map((cat, idx) => (
                  <div key={idx} className="category-item-row">
                    <div className="form-group category-col">
                      {idx === 0 && <label className="form-label">Category Name</label>}
                      <input 
                        type="text" 
                        value={cat.name}
                        onChange={e => handleCategoryChange(idx, 'name', e.target.value)}
                        className="form-input"
                        placeholder="e.g. Full Marathon"
                        required
                      />
                    </div>
                    <div className="form-group category-col">
                      {idx === 0 && <label className="form-label">Distance</label>}
                      <input 
                        type="text" 
                        value={cat.distance}
                        onChange={e => handleCategoryChange(idx, 'distance', e.target.value)}
                        className="form-input"
                        placeholder="e.g. 42K"
                        required
                      />
                    </div>
                    <div className="form-group category-col-price">
                      {idx === 0 && <label className="form-label">Price (₱)</label>}
                      <input 
                        type="number" 
                        value={cat.price}
                        onChange={e => handleCategoryChange(idx, 'price', Number(e.target.value))}
                        className="form-input"
                        required
                        min={0}
                      />
                    </div>
                    {categories.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => handleRemoveCategory(idx)}
                        className="btn-remove mb-1"
                        title="Remove Category"
                        style={{ height: '42px' }}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
                
                <div className="pt-2">
                  <button 
                    type="button" 
                    onClick={handleAddCategory}
                    className="btn-add"
                  >
                    <Plus size={16} /> Add Another Category
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Logistics Options */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Logistics & Race Kits</h2>
            </div>
            <div className="admin-panel-content">
              <div className="form-grid">
                <div className="checkbox-group">
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
                  <label className="form-label">Delivery Fee (₱) <span className="text-xs opacity-70">- Set to 0 to disable delivery</span></label>
                  <input 
                    type="number" 
                    value={formData.logisticsDeliveryFee}
                    onChange={e => setFormData({...formData, logisticsDeliveryFee: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                </div>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {/* Premade 1 */}
                  <div 
                    className={`border-2 rounded-lg cursor-pointer overflow-hidden transition-all ${formData.certificateTemplate === '/certificates/template_modern_dark.png' ? 'border-accent-blue shadow-lg shadow-accent-blue/20' : 'border-gray-700/50 hover:border-gray-500'}`}
                    onClick={() => setFormData({...formData, certificateTemplate: '/certificates/template_modern_dark.png'})}
                  >
                    <img src="/certificates/template_modern_dark.png" alt="Modern Dark" className="w-full h-32 object-cover" />
                    <div className="p-2 text-center text-sm font-medium text-primary">Modern Dark</div>
                  </div>
                  {/* Premade 2 */}
                  <div 
                    className={`border-2 rounded-lg cursor-pointer overflow-hidden transition-all ${formData.certificateTemplate === '/certificates/template_dynamic.png' ? 'border-accent-blue shadow-lg shadow-accent-blue/20' : 'border-gray-700/50 hover:border-gray-500'}`}
                    onClick={() => setFormData({...formData, certificateTemplate: '/certificates/template_dynamic.png'})}
                  >
                    <img src="/certificates/template_dynamic.png" alt="Dynamic" className="w-full h-32 object-cover" />
                    <div className="p-2 text-center text-sm font-medium text-primary">Dynamic Energy</div>
                  </div>
                  {/* Premade 3 */}
                  <div 
                    className={`border-2 rounded-lg cursor-pointer overflow-hidden transition-all ${formData.certificateTemplate === '/certificates/template_minimalist.png' ? 'border-accent-blue shadow-lg shadow-accent-blue/20' : 'border-gray-700/50 hover:border-gray-500'}`}
                    onClick={() => setFormData({...formData, certificateTemplate: '/certificates/template_minimalist.png'})}
                  >
                    <img src="/certificates/template_minimalist.png" alt="Minimalist" className="w-full h-32 object-cover" />
                    <div className="p-2 text-center text-sm font-medium text-primary">Minimalist Classic</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-px bg-gray-700/50 flex-1"></div>
                  <div className="text-secondary text-sm font-medium">OR</div>
                  <div className="h-px bg-gray-700/50 flex-1"></div>
                </div>

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
                      {uploadingField === 'certificateTemplate' ? 'Uploading…' : 'Upload Custom Template'}
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
              disabled={isLoading || uploadingField !== null}
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
