"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import BusyLabel from '@/components/ui/BusyLabel';
import AuthHomeLink from '../AuthHomeLink';
import PasswordField from '../PasswordField';
import GoogleSignInButton from './GoogleSignInButton';

/**
 * The sign-in form. `page.tsx` is the server half: it sends a person who is
 * already signed in on to the dashboard, and hands this form the page to
 * return to, already checked by `safeNextPath` (lib/next-path.ts), and
 * whether the person just reset their password (the banner). `initialError`
 * is a refused Google sign-in, already turned from its `?error=` code into
 * its sentence; `googleEnabled` is false until the OAuth client is set up.
 * "Keep me signed in" serves both doors: the password form sends it, and the
 * Google link carries it (LOGIN_UX_PLAN.md D8, 30 days instead of one).
 */
export default function LoginClient({
  next,
  passwordReset = false,
  initialError = null,
  googleEnabled = false,
}: {
  next: string;
  passwordReset?: boolean;
  initialError?: string | null;
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, keep }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to login');
        setIsLoading(false);
        return;
      }

      // The sign-in pages live under `/admin`, so they share its layout — and
      // that layout was rendered on the server with no session, giving the
      // fallback "Organizer" sidebar. Next keeps it in the client router cache
      // and reuses it across this navigation, refetching only the page beneath
      // it: the dashboard's numbers would arrive correct under a sidebar that
      // still says nobody is signed in, until a manual reload. `refresh()`
      // drops that cache so the layout is re-rendered with the new cookie.
      // Every session lands on the one dashboard (ADMIN_MERGE_PLAN.md, Batch 2),
      // or on the page in it that sent the person here.
      router.push(next);
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>
      
      <div className="auth-shell">
        <AuthHomeLink />

        <div className="auth-card">
          <div className="auth-header">
            <Link href="/" className="auth-logo-link mb-5" aria-label="Run As One home page">
              <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px]" decorative />
            </Link>
            <h1 className="auth-title">Sign in</h1>
            <p className="auth-subtitle">For Run As One staff and client organizations.</p>
          </div>

          {error ? (
            <div className="auth-message auth-error">
              {error}
            </div>
          ) : passwordReset ? (
            <div className="auth-message auth-success" role="status">
              Password updated. Sign in with your new password.
            </div>
          ) : null}

          {googleEnabled ? (
            <>
              <GoogleSignInButton next={next} keep={keep} />
              <div className="auth-divider" aria-hidden="true">or</div>
            </>
          ) : null}

          {/* No `name` on either box, on purpose: a press of Sign In before the
              page has hydrated submits the form natively, as a GET, and a
              named password would land in the address bar and the history. */}
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="email@example.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>

            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />

            <div className="auth-keep-row">
              {/* The registration waiver's checkbox (ConsentWaiver.tsx): a real
                  input, visually hidden, and the box beside it carries the look;
                  `peer` wires the focus ring back to the input. */}
              <label className="auth-keep group">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={keep}
                  onChange={(e) => setKeep(e.target.checked)}
                  aria-describedby="login-keep-hint"
                />
                <span
                  aria-hidden="true"
                  className={`shrink-0 w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
                    keep
                      ? 'border-accent-orange bg-accent-orange'
                      : 'border-white/30 group-hover:border-white/50'
                  }`}
                >
                  {keep && <Check size={14} strokeWidth={3} className="text-black" />}
                </span>
                <span>Keep me signed in</span>
              </label>
              <Link href="/admin/forgot-password" className="auth-link text-sm">
                Forgot password?
              </Link>
            </div>
            <p id="login-keep-hint" className="auth-keep-hint">
              For 30 days on this device. Leave it off on a shared computer.
            </p>

            <button 
              type="submit" 
              disabled={isLoading}
              className="btn-gradient auth-submit text-white font-medium"
            >
              {isLoading ? <BusyLabel>Signing In</BusyLabel> : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer">
            Running a race with us?{' '}
            <Link href="/admin/register" className="auth-link">
              Apply as an organizer
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
