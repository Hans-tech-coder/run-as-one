"use client";

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, ArrowLeft, Plus, Trash2, CheckCircle2, UploadCloud, FileImage, X, Info, Ruler } from 'lucide-react';
import './RegistrationWizard.css';

interface Participant {
  id: number;
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  birthdate: string;
  singletSize: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalConditions: string;
}

export default function RegistrationWizardClient({ event, eventId, registration }: { event: any, eventId: string, registration?: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSuccessParam = searchParams.get('success') === 'true';
  const isCancelParam = searchParams.get('cancel') === 'true';

  const [step, setStep] = useState(isCancelParam && registration ? 3 : 1);
  const [participants, setParticipants] = useState<Participant[]>(
    isCancelParam && registration?.runners?.length > 0 
      ? registration.runners.map((r: any, idx: number) => ({
          id: r.id || Date.now() + idx,
          categoryId: r.categoryId || '',
          firstName: r.firstName || '',
          lastName: r.lastName || '',
          email: r.email || '',
          phone: r.phone || '',
          gender: r.gender || '',
          birthdate: r.birthdate || '',
          singletSize: r.singletSize || '',
          emergencyContactName: r.emergencyContactName || '',
          emergencyContactPhone: r.emergencyContactPhone || '',
          medicalConditions: r.medicalConditions || ''
        }))
      : [{
          id: Date.now(), categoryId: '', firstName: '', lastName: '', email: '', phone: '',
          gender: '', birthdate: '', singletSize: '', emergencyContactName: '', emergencyContactPhone: '', medicalConditions: ''
        }]
  );
  
  // Logistics state
  const [logisticsMethod, setLogisticsMethod] = useState<'pickup' | 'delivery'>(
    isCancelParam && registration ? registration.logisticsMethod || 'pickup' : 'pickup'
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    isCancelParam && registration ? registration.deliveryAddress || '' : ''
  );
  
  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'gcash' | 'paymaya' | 'qrph' | 'card' | 'bank_transfer'>('gcash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderRef, setOrderRef] = useState<string>(isCancelParam && registration ? registration.orderRef : '');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedBankModal, setSelectedBankModal] = useState<any | null>(null);
  const [transactionNumber, setTransactionNumber] = useState('');
  const [showSizeGuideModal, setShowSizeGuideModal] = useState(false);

  const [adminFeePerRunner, setAdminFeePerRunner] = useState(60);

  React.useEffect(() => {
    if (isSuccessParam) {
      setOrderRef(`RM-${Math.floor(Math.random() * 1000000)}`);
    }

    const fetchAdminFee = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/fee`);
        if (res.ok) {
          const data = await res.json();
          setAdminFeePerRunner(data.adminFee);
        }
      } catch (err) {
        console.error('Failed to fetch admin fee', err);
      }
    };

    fetchAdminFee();
  }, [isSuccessParam, eventId]);

  // Handlers
  const handleParticipantChange = (index: number, field: keyof Participant, value: string) => {
    const newParticipants = [...participants];
    newParticipants[index] = { ...newParticipants[index], [field]: value };
    setParticipants(newParticipants);
  };

  const addParticipant = () => {
    setParticipants([...participants, {
      id: Date.now(), categoryId: participants[0].categoryId || '', firstName: '', lastName: '', email: '', phone: '',
      gender: '', birthdate: '', singletSize: '', emergencyContactName: '', emergencyContactPhone: '', medicalConditions: ''
    }]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length > 1) {
      const newParticipants = [...participants];
      newParticipants.splice(index, 1);
      setParticipants(newParticipants);
    }
  };

  // Calculations
  const subtotal = participants.reduce((total, p) => {
    const cat = event.categories.find((c: any) => c.id === p.categoryId);
    return total + (cat ? cat.price : 0);
  }, 0);
  
  const deliveryFee = logisticsMethod === 'delivery' ? event.logisticsDeliveryFee : 0;
  
  // Platform Fee (DB-driven per participant)
  const platformFee = adminFeePerRunner * participants.length;
  
  // Dynamic Transaction Fee based on payment method
  let transactionFee = 0;
  if (step === 3 && paymentMethod !== 'bank_transfer') {
    const baseAmountForFee = subtotal + deliveryFee + platformFee; // Include admin fee in computation as requested
    
    // Using VAT-inclusive rates (PayMongo deducts this from the total gross amount)
    // Formula to perfectly cover the fee: Fee = (Base * rate + fixed) / (1 - rate)
    if (paymentMethod === 'gcash') {
      const rate = 0.025; // 2.5%
      transactionFee = (baseAmountForFee * rate) / (1 - rate);
    } else if (paymentMethod === 'paymaya') {
      const rate = 0.02; // 2.0%
      transactionFee = (baseAmountForFee * rate) / (1 - rate);
    } else if (paymentMethod === 'qrph') {
      const rate = 0.015; // 1.5%
      transactionFee = (baseAmountForFee * rate) / (1 - rate);
    } else if (paymentMethod === 'card') {
      const rate = 0.035; // 3.5%
      const fixed = 15; // ₱15
      transactionFee = (baseAmountForFee * rate + fixed) / (1 - rate);
    }
    
    // Round to 2 decimal places to avoid floating point issues, or round to nearest integer. 
    // PayMongo accepts amounts in cents, so rounding to nearest integer is safer for whole pesos, but we can do Math.ceil to be safe and ensure the merchant doesn't lose out.
    transactionFee = Math.ceil(transactionFee);
  }
  
  const totalAmount = subtotal + deliveryFee + platformFee + transactionFee;

  // Validation checks
  const validateStep1 = () => {
    return participants.every(p => 
      p.categoryId && p.firstName && p.lastName && p.email && p.phone && p.gender && p.birthdate && p.singletSize && p.emergencyContactName && p.emergencyContactPhone
    );
  };

  const validateStep2 = () => {
    return logisticsMethod === 'pickup' || (logisticsMethod === 'delivery' && deliveryAddress.trim() !== '');
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) {
      alert("Please complete all required fields and select a category for all runners.");
      return;
    }
    if (step === 2 && !validateStep2()) {
      alert("Please provide a complete delivery address.");
      return;
    }
    setStep(prev => prev + 1);
  };

  const handleBack = () => setStep(prev => prev - 1);

  const bankOptions = [
    { id: 'bdo', name: 'BDO Unibank', accountName: 'Run As One Events', accountNumber: '0012 3456 7890', qrCode: 'https://via.placeholder.com/200?text=BDO+QR+Code' },
    { id: 'bpi', name: 'BPI', accountName: 'Run As One Events', accountNumber: '0987 6543 21', qrCode: 'https://via.placeholder.com/200?text=BPI+QR+Code' },
    { id: 'metrobank', name: 'Metrobank', accountName: 'Run As One Events', accountNumber: '1122 3344 55', qrCode: 'https://via.placeholder.com/200?text=Metrobank+QR+Code' },
  ];

  const handleCheckout = async () => {
    if (paymentMethod === 'bank_transfer') {
      setStep(4);
      return;
    }

    setIsProcessing(true);
    try {
      const baseUrl = window.location.origin;
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalAmount,
          description: `Registration for ${event.title}`,
          successUrl: `${baseUrl}/events/${eventId}/register?success=true`,
          cancelUrl: `${baseUrl}/events/${eventId}/register`,
          customerEmail: participants[0].email,
          customerName: `${participants[0].firstName} ${participants[0].lastName}`,
          eventId: eventId,
          participants: participants,
          logisticsMethod: logisticsMethod,
          deliveryAddress: deliveryAddress,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          transactionFee: transactionFee,
          paymentMethod: paymentMethod
        })
      });

      const data = await response.json();

      if (response.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert(data.error || 'Failed to create checkout session. Please check your PayMongo API keys in .env.local.');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error(error);
      alert('An unexpected error occurred.');
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setProofFile(e.target.files[0]);
    }
  };

  const handleManualSubmit = async () => {
    if (!proofFile) {
      alert("Please upload your deposit slip or proof of payment.");
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('proofFile', proofFile);
      
      // Append primitive registration data
      formData.append('eventId', eventId);
      formData.append('customerEmail', participants[0].email);
      formData.append('customerName', `${participants[0].firstName} ${participants[0].lastName}`);
      formData.append('logisticsMethod', logisticsMethod);
      formData.append('deliveryAddress', deliveryAddress || '');
      formData.append('subtotal', subtotal.toString());
      formData.append('deliveryFee', deliveryFee.toString());
      formData.append('platformFee', platformFee.toString());
      formData.append('transactionFee', transactionFee.toString());
      formData.append('totalAmount', totalAmount.toString());
      formData.append('paymentMethod', paymentMethod);
      formData.append('transactionNumber', transactionNumber);

      // Append complex data as JSON string
      formData.append('participants', JSON.stringify(participants));

      const response = await fetch('/api/checkout/manual', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to success UI within this wizard
        router.push(`/events/${eventId}/register?success=true&orderRef=${data.orderRef}`);
      } else {
        alert(data.error || 'Failed to submit registration. Please try again.');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error(error);
      alert('An unexpected error occurred during submission.');
      setIsProcessing(false);
    }
  };

  if (isSuccessParam) {
    return (
      <div className="wizard-page">
        <div className="container success-container py-8">
          <div className="glass-panel success-card">
            <CheckCircle2 size={80} className="text-accent-blue mb-4" />
            <h1>Registration Successful!</h1>
            <p>You have successfully registered for <strong>{event.title}</strong>.</p>
            <p>Your registration confirmation and simulated e-receipt have been sent to {registration?.customerEmail || participants[0].email}.</p>
            <div className="success-summary">
              <div><strong>Order Reference:</strong> #{registration?.orderRef || orderRef}</div>
              <div><strong>Total Paid:</strong> ₱{(registration?.totalAmount || totalAmount).toLocaleString()}</div>
            </div>
            <button className="btn-gradient w-full mt-6" onClick={() => router.push('/')}>Return to Homepage</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-page">
      <div className="container wizard-container py-8">
        
        {/* Sidebar Summary */}
        <aside className="wizard-sidebar">
          <div className="glass-panel sticky-sidebar p-8">
            <div className="event-mini-info">
              <img src={event.imageUrl} alt="Event" className="mini-image" />
              <div>
                <h3 className="text-primary">{event.title}</h3>
                <div className="text-sm text-secondary">{event.date}</div>
              </div>
            </div>

            <div className="order-summary mt-6">
              <h4 className="mb-4 text-primary">Order Summary</h4>
              {participants.map((p, idx) => {
                const cat = event.categories.find((c: any) => c.id === p.categoryId);
                return (
                  <div key={p.id} className="summary-line">
                    <span>Runner {idx + 1} {cat ? `(${cat.name})` : ''}</span>
                    <span>₱{cat ? cat.price.toLocaleString() : '0'}</span>
                  </div>
                );
              })}
              
              {logisticsMethod === 'delivery' && (
                <div className="summary-line text-secondary">
                  <span>Delivery Fee</span>
                  <span>₱{deliveryFee.toLocaleString()}</span>
                </div>
              )}
              
              <div className="summary-line text-secondary mt-2">
                <span>Admin Fee (₱{adminFeePerRunner}/runner)</span>
                <span>₱{platformFee.toLocaleString()}</span>
              </div>
              
              {step === 3 && paymentMethod !== 'bank_transfer' && (
                <div className="summary-line text-secondary">
                  <span>Transaction Fee</span>
                  <span>₱{transactionFee.toLocaleString()}</span>
                </div>
              )}
              
              <div className="summary-line total-line mt-4">
                <strong>Total</strong>
                <strong className="text-accent-orange text-xl">₱{totalAmount.toLocaleString()}</strong>
              </div>
            </div>

            {/* Step Progress Indicators */}
            <div className="steps-indicator mt-8">
              {[1, 2, 3, 4].map(s => {
                // If payment isn't bank transfer, hide the 4th step dot logically if we only want 3 steps, 
                // but simpler to show 4 steps only if bank transfer is selected or just let it exist.
                // Let's only render step 4 dot if payment method is bank transfer or we are on step 4.
                if (s === 4 && paymentMethod !== 'bank_transfer' && step < 4) return null;

                return (
                  <div key={s} className={`step-dot ${step === s ? 'active' : step > s ? 'completed' : ''}`}>
                    {step > s ? <CheckCircle2 size={14} /> : s}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Main Wizard Form */}
        <section className="wizard-content">
          <div className="glass-panel p-8 form-panel">
            
            {/* Header / Back button */}
            <div className="form-header">
              {step > 1 && (
                <button className="back-btn" onClick={handleBack}>
                  <ArrowLeft size={20} /> Back
                </button>
              )}
              <h2>
                {step === 1 && "Runner Details & Categories"}
                {step === 2 && "Logistics"}
                {step === 3 && "Checkout & Payment"}
                {step === 4 && "Upload Proof of Payment"}
              </h2>
            </div>

            {/* STEP 1: Categories & Details */}
            {step === 1 && (
              <div className="step-content">
                <p className="text-secondary mb-6">Select a distance category and fill out the details for each runner. You can add multiple runners in one transaction.</p>
                
                {participants.map((p, idx) => (
                  <div key={p.id} className="participant-form-block mb-8">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b">
                      <h3>Runner {idx + 1} Details</h3>
                      {idx > 0 && (
                        <button className="text-red hover-text-red" onClick={() => removeParticipant(idx)}>
                          <Trash2 size={18} /> Remove
                        </button>
                      )}
                    </div>

                    <h4 className="mb-3 text-secondary">Select Category</h4>
                    <div className="category-grid mb-6">
                      {event.categories.map((cat: any) => (
                        <div 
                          key={cat.id} 
                          className={`category-card ${p.categoryId === cat.id ? 'selected' : ''}`}
                          onClick={() => handleParticipantChange(idx, 'categoryId', cat.id)}
                        >
                          <div className="cat-name">{cat.name}</div>
                          <div className="cat-distance">{cat.distance}</div>
                          <div className="cat-price">₱{cat.price.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    
                    <h4 className="mb-3 text-secondary">Personal Information</h4>
                    <div className="form-grid">
                      <div className="input-group">
                        <label>First Name</label>
                        <input type="text" value={p.firstName} onChange={(e) => handleParticipantChange(idx, 'firstName', e.target.value)} placeholder="Juan" />
                      </div>
                      <div className="input-group">
                        <label>Last Name</label>
                        <input type="text" value={p.lastName} onChange={(e) => handleParticipantChange(idx, 'lastName', e.target.value)} placeholder="Dela Cruz" />
                      </div>
                      <div className="input-group">
                        <label>Email Address</label>
                        <input type="email" value={p.email} onChange={(e) => handleParticipantChange(idx, 'email', e.target.value)} placeholder="juan@example.com" />
                      </div>
                      <div className="input-group">
                        <label>Mobile Number</label>
                        <input type="tel" value={p.phone} onChange={(e) => handleParticipantChange(idx, 'phone', e.target.value)} placeholder="09xxxxxxxxx" />
                      </div>
                      <div className="input-group">
                        <label>Gender</label>
                        <select value={p.gender} onChange={(e) => handleParticipantChange(idx, 'gender', e.target.value)}>
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Birthdate</label>
                        <input type="date" value={p.birthdate} onChange={(e) => handleParticipantChange(idx, 'birthdate', e.target.value)} />
                      </div>
                      <div className="input-group">
                        <div className="flex justify-between items-center mb-1">
                          <label className="mb-0">Singlet Size</label>
                          <button 
                            type="button" 
                            style={{ background: 'transparent', border: 'none', padding: 0, minWidth: 0 }}
                            className="text-xs text-accent-blue flex items-center hover:text-white transition-colors"
                            onClick={() => setShowSizeGuideModal(true)}
                          >
                            <Ruler size={14} style={{ marginRight: '4px' }} /> Size Guide
                          </button>
                        </div>
                        <select value={p.singletSize} onChange={(e) => handleParticipantChange(idx, 'singletSize', e.target.value)}>
                          <option value="">Select Size</option>
                          <option value="XS">XS</option>
                          <option value="S">S</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                        </select>
                      </div>
                    </div>

                    <h4 className="mt-6 mb-3 text-secondary">Health & Emergency Info</h4>
                    <div className="form-grid">
                      <div className="input-group">
                        <label>Emergency Contact Name</label>
                        <input type="text" value={p.emergencyContactName} onChange={(e) => handleParticipantChange(idx, 'emergencyContactName', e.target.value)} placeholder="Maria Dela Cruz" />
                      </div>
                      <div className="input-group">
                        <label>Emergency Contact No.</label>
                        <input type="tel" value={p.emergencyContactPhone} onChange={(e) => handleParticipantChange(idx, 'emergencyContactPhone', e.target.value)} placeholder="09xxxxxxxxx" />
                      </div>
                      <div className="input-group full-width">
                        <label>Medical Conditions (Optional)</label>
                        <textarea value={p.medicalConditions} onChange={(e) => handleParticipantChange(idx, 'medicalConditions', e.target.value)} placeholder="e.g. Asthma, Allergies (Leave blank if none)"></textarea>
                      </div>
                    </div>
                  </div>
                ))}

                <button className="btn-outline w-full mt-4 flex items-center justify-center gap-2" onClick={addParticipant}>
                  <Plus size={20} /> Add Another Runner
                </button>

                <div className="form-actions mt-8 flex justify-end">
                  <button className="btn-gradient flex items-center justify-center gap-2 px-8" onClick={handleNext}>
                    Next: Logistics <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Logistics */}
            {step === 2 && (
              <div className="step-content">
                <p className="text-secondary mb-6">How would you like to receive your race kits?</p>
                
                <div className="logistics-options mb-6">
                  {event.logisticsPickup && (
                    <div className={`logistics-card ${logisticsMethod === 'pickup' ? 'selected' : ''}`} onClick={() => setLogisticsMethod('pickup')}>
                      <div className="logistics-title">On-site Pickup</div>
                      <div className="logistics-desc">Pick up your race kit at designated partner stores 3 days before the event.</div>
                      <div className="logistics-price">FREE</div>
                    </div>
                  )}
                  
                  {event.logisticsDeliveryFee > 0 && (
                    <div className={`logistics-card ${logisticsMethod === 'delivery' ? 'selected' : ''}`} onClick={() => setLogisticsMethod('delivery')}>
                      <div className="logistics-title">Door-to-Door Delivery</div>
                      <div className="logistics-desc">Get your race kits delivered straight to your home address nationwide.</div>
                      <div className="logistics-price">+₱{event.logisticsDeliveryFee.toLocaleString()}</div>
                    </div>
                  )}
                </div>

                {logisticsMethod === 'delivery' && (
                  <div className="input-group full-width mt-6 animate-fade-in">
                    <label>Complete Delivery Address</label>
                    <textarea 
                      value={deliveryAddress} 
                      onChange={(e) => setDeliveryAddress(e.target.value)} 
                      placeholder="House/Unit No., Street, Barangay, City/Municipality, Province, Zip Code"
                      rows={4}
                    ></textarea>
                  </div>
                )}

                <div className="form-actions mt-8 flex justify-end">
                  <button className="btn-gradient flex items-center justify-center gap-2 px-8" onClick={handleNext}>
                    Proceed to Checkout <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Checkout */}
            {step === 3 && (
              <div className="step-content">
                <h3 className="mb-6 text-xl">Select Payment Method</h3>
                
                <div className="logistics-options payment-options mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div className={`logistics-card ${paymentMethod === 'gcash' ? 'selected' : ''}`} onClick={() => setPaymentMethod('gcash')}>
                    <div className="logistics-title">GCash</div>
                    <div className="logistics-desc">Pay instantly via GCash (2.5% fee).</div>
                  </div>
                  
                  <div className={`logistics-card ${paymentMethod === 'paymaya' ? 'selected' : ''}`} onClick={() => setPaymentMethod('paymaya')}>
                    <div className="logistics-title">Maya</div>
                    <div className="logistics-desc">Pay instantly via Maya (2.0% fee).</div>
                  </div>

                  <div className={`logistics-card ${paymentMethod === 'qrph' ? 'selected' : ''}`} onClick={() => setPaymentMethod('qrph')}>
                    <div className="logistics-title">QR Ph</div>
                    <div className="logistics-desc">Scan to pay with any bank app (1.5% fee).</div>
                  </div>

                  <div className={`logistics-card ${paymentMethod === 'card' ? 'selected' : ''}`} onClick={() => setPaymentMethod('card')}>
                    <div className="logistics-title">Credit/Debit Card</div>
                    <div className="logistics-desc">Visa or Mastercard (3.5% + ₱15 fee).</div>
                  </div>
                  
                  <div className={`logistics-card ${paymentMethod === 'bank_transfer' ? 'selected' : ''}`} onClick={() => setPaymentMethod('bank_transfer')}>
                    <div className="logistics-title">Manual Bank Transfer</div>
                    <div className="logistics-desc">Deposit and upload slip (0% fee).</div>
                  </div>
                </div>

                {paymentMethod !== 'bank_transfer' && (
                  <div className="checkout-notice mb-6 p-4 rounded bg-dark border-orange">
                    <strong className="text-accent-orange block mb-2">Secure Checkout via PayMongo</strong>
                    <p className="text-sm text-secondary">You will be redirected securely to pay via {paymentMethod.toUpperCase()}.</p>
                  </div>
                )}
                
                {paymentMethod === 'bank_transfer' && (
                  <div className="checkout-notice mb-6 p-4 rounded bg-dark" style={{ borderLeft: '4px solid var(--accent-blue)'}}>
                    <strong className="text-accent-blue block mb-2">Manual Verification Required</strong>
                    <p className="text-sm text-secondary">Upon checkout, you will receive our bank details. Upload your deposit slip to complete your registration.</p>
                  </div>
                )}

                <div className="checkout-total-box glass-panel mb-8 text-center py-8">
                  <div className="text-secondary mb-2">Total Amount to Pay</div>
                  <div className="text-4xl font-bold text-primary">₱{totalAmount.toLocaleString()}</div>
                </div>

                <div className="form-actions mt-8 flex justify-end">
                  <button 
                    className={`btn-gradient flex items-center justify-center gap-2 px-8 ${isProcessing ? 'processing' : ''}`} 
                    onClick={handleCheckout}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (paymentMethod !== 'bank_transfer' ? 'Connecting to PayMongo...' : 'Processing...') : (paymentMethod !== 'bank_transfer' ? `Pay ₱${totalAmount.toLocaleString()}` : 'Complete Registration')}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Bank Transfer Upload */}
            {step === 4 && (
              <div className="step-content animate-fade-in">
                <p className="text-secondary mb-6">
                  You have selected Manual Bank Transfer. Please choose a bank below to view our account details and transfer <strong>₱{totalAmount.toLocaleString()}</strong>. After payment, upload your deposit slip.
                </p>

                <h4 className="mb-4 text-accent-blue">Select a Bank for Transfer</h4>
                <div className="bank-options-grid mb-8">
                  {bankOptions.map(bank => (
                    <div 
                      key={bank.id} 
                      className="bank-option-card glass-panel"
                      onClick={() => setSelectedBankModal(bank)}
                    >
                      <div className="bank-option-name">{bank.name}</div>
                      <div className="text-sm text-secondary mt-1">Click to view details & QR</div>
                    </div>
                  ))}
                </div>

                <div 
                  className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      setProofFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/jpg, application/pdf" 
                    className="hidden-file-input"
                    onChange={handleFileChange}
                    id="proof-upload"
                  />
                  <div className="upload-zone-content">
                    <UploadCloud size={48} className="upload-icon" />
                    <div className="text-lg">Drag & Drop your receipt here</div>
                    <div className="upload-hint">or click to browse from your device</div>
                    <div className="text-xs text-secondary mt-2">Supports JPG, PNG, PDF (Max 5MB)</div>
                  </div>
                </div>

                {proofFile && (
                  <div className="file-preview animate-fade-in">
                    <div className="file-preview-info">
                      <div className="p-2 rounded bg-dark border-blue">
                        <FileImage size={24} className="text-accent-blue" />
                      </div>
                      <div>
                        <div className="file-name" title={proofFile.name}>{proofFile.name}</div>
                        <div className="file-size">{(proofFile.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                    </div>
                    <button 
                      className="remove-file-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setProofFile(null);
                        const fileInput = document.getElementById('proof-upload') as HTMLInputElement;
                        if(fileInput) fileInput.value = '';
                      }}
                      title="Remove file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}

                <div className="input-group full-width mt-6 animate-fade-in">
                  <label>Transaction Number / Reference Number <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={transactionNumber}
                    onChange={e => setTransactionNumber(e.target.value)}
                    placeholder="Enter the reference number from your bank receipt"
                    required
                    className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue outline-none transition-all"
                  />
                </div>

                <div className="form-actions mt-8 flex justify-end">
                  <button 
                    className={`btn-gradient flex items-center justify-center gap-2 px-8 ${isProcessing ? 'processing' : ''}`} 
                    onClick={handleManualSubmit}
                    disabled={isProcessing || !proofFile || !transactionNumber.trim()}
                  >
                    {isProcessing ? 'Submitting Registration...' : 'Submit & Finish Registration'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </section>
      </div>

      {selectedBankModal && (
        <div className="modal-overlay" onClick={() => setSelectedBankModal(null)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedBankModal(null)}>
              <X size={24} />
            </button>
            <h3 className="text-xl mb-4">{selectedBankModal.name} Details</h3>
            
            <div className="bank-details-card mb-6">
              <div className="bank-detail-item">
                <span className="bank-detail-label">Account Name</span>
                <span className="bank-detail-value">{selectedBankModal.accountName}</span>
              </div>
              <div className="bank-detail-item">
                <span className="bank-detail-label">Account Number</span>
                <span className="bank-detail-value">{selectedBankModal.accountNumber}</span>
              </div>
            </div>

            <div className="qr-code-container mb-4">
              <div className="text-center text-sm text-secondary mb-2">Scan to Pay</div>
              <img src={selectedBankModal.qrCode} alt={`${selectedBankModal.name} QR Code`} className="qr-image mx-auto rounded-lg" />
            </div>
            
            <div className="text-center mt-6">
              <button className="btn-gradient w-full" onClick={() => setSelectedBankModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showSizeGuideModal && (
        <div className="modal-overlay" onClick={() => setShowSizeGuideModal(false)}>
          <div className="modal-content glass-panel max-w-lg" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowSizeGuideModal(false)}>
              <X size={24} />
            </button>
            <h3 className="text-xl mb-6 text-accent-blue flex items-center gap-2">
              <Info size={24} /> Size Guide
            </h3>
            
            <p className="text-secondary text-sm mb-4">
              Measurements are in inches (Width x Length). Please allow a ±0.5 inch tolerance due to manual measurement. Standard Asian Fit.
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="py-3 px-4 text-white font-medium">Size</th>
                    <th className="py-3 px-4 text-white font-medium">Width (Chest)</th>
                    <th className="py-3 px-4 text-white font-medium">Length</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">XS</td>
                    <td className="py-3 px-4">18"</td>
                    <td className="py-3 px-4">25"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">S</td>
                    <td className="py-3 px-4">19"</td>
                    <td className="py-3 px-4">26"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">M</td>
                    <td className="py-3 px-4">20"</td>
                    <td className="py-3 px-4">27"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">L</td>
                    <td className="py-3 px-4">21"</td>
                    <td className="py-3 px-4">28"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">XL</td>
                    <td className="py-3 px-4">22"</td>
                    <td className="py-3 px-4">29"</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">XXL</td>
                    <td className="py-3 px-4">23"</td>
                    <td className="py-3 px-4">30"</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-dark/50 border border-blue p-4 rounded-lg text-sm text-secondary">
              <span className="text-accent-blue font-medium block mb-1">Note:</span>
              Both the Race Singlet and Finisher Shirt follow this standard sizing guide.
            </div>
            
            <div className="text-center mt-6">
              <button className="btn-gradient w-full" onClick={() => setShowSizeGuideModal(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
