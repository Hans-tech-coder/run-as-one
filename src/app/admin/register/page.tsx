"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import './../Auth.css';

export default function AdminRegister() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to register');
        setIsLoading(false);
        return;
      }

      setSuccess(data.message);
      setIsLoading(false);
      
      // Clear form
      setName('');
      setEmail('');
      setPassword('');
      
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>
      
      <div className="auth-card">
        <div className="auth-header">
          <img src="/logo.png" alt="StrideSync Logo" width="64" height="64" style={{ borderRadius: '16px', marginBottom: '1.25rem', boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }} />
          <h1 className="auth-title">Apply as Organizer</h1>
          <p className="auth-subtitle">Register to manage your running events.</p>
        </div>

        {error && (
          <div className="auth-message auth-error">
            {error}
          </div>
        )}

        {success && (
          <div className="auth-message auth-success">
            {success}
          </div>
        )}

        <form onSubmit={handleRegister} className="auth-form">
          <div className="form-group">
            <label className="form-label">Organization / Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              placeholder="Run As One Events"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="organizer@example.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading || !!success}
            className="btn-gradient auth-submit"
          >
            {isLoading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link href="/admin/login" className="auth-link">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
