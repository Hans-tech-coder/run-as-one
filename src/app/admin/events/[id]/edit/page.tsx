"use client";

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, UploadCloud, Trash } from 'lucide-react';
import Link from 'next/link';

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState('');
  
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
          logisticsDeliveryFee: data.logisticsDeliveryFee || 0,
        });

        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories.map((c: any) => ({
            name: c.name,
            distance: c.distance,
            price: c.price
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
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

      router.push('/admin/events');
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
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
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

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
                  <div className="file-upload-wrapper">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'imageUrl')}
                      className="file-upload-input"
                    />
                    <div className="file-upload-content">
                      <div className="file-upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="file-upload-title">Click to upload cover image</div>
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
                  <div className="file-upload-wrapper">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'raceKitImageUrl')}
                      className="file-upload-input"
                    />
                    <div className="file-upload-content">
                      <div className="file-upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="file-upload-title">Click to upload race kit poster</div>
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

          <div className="form-actions">
            <Link href="/admin/events" className="btn-cancel">
              Cancel
            </Link>
            <button 
              type="submit" 
              disabled={isLoading}
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
