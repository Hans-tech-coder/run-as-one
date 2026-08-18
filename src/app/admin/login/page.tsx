"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import '../Auth.css';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to login');
        setIsLoading(false);
        return;
      }

      if (data.role === 'SUPER_ADMIN') {
        router.push('/superadmin');
      } else {
        router.push('/admin');
      }
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
          <h1 className="auth-title">StrideSync</h1>
          <p className="auth-subtitle">Admin Portal</p>
        </div>

        {error && (
          <div className="auth-message auth-error">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="email@example.com"
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
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="btn-gradient auth-submit text-white font-medium"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          Want to organize events?{' '}
          <Link href="/admin/register" className="auth-link">
            Apply as an Organizer
          </Link>
        </div>
      </div>
    </div>
  );
}
