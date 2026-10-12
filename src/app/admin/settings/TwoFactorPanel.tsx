"use client";

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import PasswordField from '../PasswordField';
import { SaveConfirmation } from './SettingsPanels';

/**
 * **Two-step sign-in** on Settings › Security (TWO_FACTOR_PLAN.md Batch 2),
 * for everyone who signs in to the dashboard.
 *
 * - Off: what it does, and *Turn On Two-Step Sign-in*.
 * - Setting up: step 1 scan the QR (or type the key), step 2 the first code —
 *   only that code makes it count, so walking away halfway changes nothing.
 * - Codes: the ten recovery codes, shown once, with Copy and Download, and
 *   *Done* only after "I saved these codes" is ticked — the one moment they
 *   can be saved, so the panel does not let it slip past.
 * - On: since when, how many recovery codes are left, *New Recovery Codes*
 *   (asks a code) and *Turn Off* (asks the password and a code, D6).
 *
 * Called "two-step sign-in" on screen, never 2FA or MFA (D11).
 */

export type TwoFactorSummary = { since: string; codesLeft: number } | null;

type View = 'idle' | 'setup' | 'codes' | 'renew' | 'disable';
type FieldErrors = Record<string, string>;

/** Under this many recovery codes the panel suggests a new set. */
const FEW_CODES_LEFT = 3;

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function TwoFactorPanel({ twoFactor }: { twoFactor: TwoFactorSummary }) {
  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [view, setView] = useState<View>('idle');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ qrSvg: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState('');

  const reset = (next: View = 'idle') => {
    setView(next);
    setCode('');
    setPassword('');
    setErrors({});
  };

  /** Runs one request; field errors go under their boxes, anything else to an alert. */
  const run = async (url: string, body: unknown, onSuccess: (data: Record<string, unknown>) => void) => {
    setBusy(true);
    setDone('');
    try {
      const { ok, data } = await post(url, body);
      if (!ok) {
        if (data.errors) {
          setErrors(data.errors);
          return;
        }
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      onSuccess(data);
    } catch (err: unknown) {
      await alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run('/api/admin/profile/two-factor/start', {}, data => {
      setSetup({ qrSvg: String(data.qrSvg), secret: String(data.secret) });
      reset('setup');
    });

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) {
      setErrors({ code: 'Enter the 6-digit code from your authenticator app' });
      return;
    }
    run('/api/admin/profile/two-factor/confirm', { code }, data => {
      setCodes(data.codes as string[]);
      setSetup(null);
      reset('codes');
    });
  };

  const renew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrors({ code: 'Enter a code from your authenticator app, or a recovery code' });
      return;
    }
    run('/api/admin/profile/two-factor/recovery-codes', { code }, data => {
      setCodes(data.codes as string[]);
      reset('codes');
    });
  };

  const disable = (e: React.FormEvent) => {
    e.preventDefault();
    const found: FieldErrors = {};
    if (!password) found.password = 'Enter your current password';
    if (!code.trim()) found.code = 'Enter a code from your authenticator app, or a recovery code';
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    run('/api/admin/profile/two-factor/disable', { password, code }, () => {
      reset();
      setDone('Two-step sign-in turned off');
      router.refresh();
    });
  };

  const finishCodes = () => {
    setCodes([]);
    reset();
    setDone(twoFactor ? 'New recovery codes saved' : 'Two-step sign-in is on');
    router.refresh();
  };

  const editCode = (value: string) => {
    setCode(value);
    setErrors(prev => (prev.code ? { ...prev, code: '' } : prev));
  };

  const cancelButton = (
    <button type="button" className="btn-cancel two-step-cancel" onClick={() => reset()} disabled={busy}>
      Cancel
    </button>
  );

  return (
    <section className="admin-panel" aria-labelledby="two-step-title">
      <div className="admin-panel-header">
        <h2 id="two-step-title" className="admin-panel-title flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-orange-ink" aria-hidden="true" />
          Two-step Sign-in
        </h2>
      </div>

      <div className="admin-panel-content">
        {view === 'codes' ? (
          <RecoveryCodes codes={codes} onDone={finishCodes} />
        ) : view === 'setup' && setup ? (
          <form onSubmit={confirm} noValidate>
            <ol className="two-step-steps">
              <li>
                <p className="two-step-step-title">Step 1 of 2 — Scan this with your authenticator app</p>
                <p className="text-xs text-secondary">
                  Google Authenticator, Microsoft Authenticator, 1Password or any app
                  that shows 6-digit codes. Choose to add an account, then scan.
                </p>
                <div className="two-step-setup">
                  {/* Our own SVG, drawn on the server from our own URI. */}
                  <div
                    className="two-step-qr"
                    role="img"
                    aria-label="QR code for your authenticator app"
                    dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-secondary">Cannot scan it? Type this key instead:</p>
                    <p className="two-step-key">{setup.secret}</p>
                  </div>
                </div>
              </li>
              <li>
                <p className="two-step-step-title">Step 2 of 2 — Enter the code it shows</p>
                <div className="form-grid mt-3">
                  <CodeField
                    label="6-Digit Code"
                    value={code}
                    onChange={editCode}
                    error={errors.code}
                    disabled={busy}
                    digitsOnly
                  />
                </div>
              </li>
            </ol>
            <div className="form-actions settings-actions">
              {cancelButton}
              <button type="submit" className="btn-light" disabled={busy}>
                {busy ? <BusyLabel>Checking</BusyLabel> : 'Turn On'}
              </button>
            </div>
          </form>
        ) : twoFactor ? (
          <>
            <dl className="settings-facts">
              <div>
                <dt>Two-step sign-in</dt>
                <dd>On since {twoFactor.since}</dd>
              </div>
              <div>
                <dt>Recovery codes left</dt>
                <dd>{twoFactor.codesLeft} of 10</dd>
              </div>
            </dl>
            {twoFactor.codesLeft <= FEW_CODES_LEFT ? (
              <p className="two-step-warning">
                Only {twoFactor.codesLeft} recovery {twoFactor.codesLeft === 1 ? 'code is' : 'codes are'} left.
                Make a new set so you are not locked out if you lose your phone.
              </p>
            ) : null}

            {view === 'renew' ? (
              <form onSubmit={renew} noValidate>
                <p className="text-xs text-secondary mt-3">
                  Your ten old recovery codes stop working, and ten new ones are shown once.
                </p>
                <div className="form-grid mt-4">
                  <CodeField
                    label="Code from your app or a recovery code"
                    value={code}
                    onChange={editCode}
                    error={errors.code}
                    disabled={busy}
                  />
                </div>
                <div className="form-actions settings-actions">
                  {cancelButton}
                  <button type="submit" className="btn-light" disabled={busy}>
                    {busy ? <BusyLabel>Making Codes</BusyLabel> : 'Make New Codes'}
                  </button>
                </div>
              </form>
            ) : view === 'disable' ? (
              <form onSubmit={disable} noValidate>
                <p className="text-xs text-secondary mt-3">
                  Your password alone will sign you in again. Every other device is
                  signed out, and we email you that it was turned off.
                </p>
                <div className="form-grid mt-4">
                  <div className="form-group-full">
                    <PasswordField
                      label="Current Password"
                      value={password}
                      onChange={value => {
                        setPassword(value);
                        setErrors(prev => (prev.password ? { ...prev, password: '' } : prev));
                      }}
                      autoComplete="current-password"
                      error={errors.password}
                      disabled={busy}
                    />
                  </div>
                  <CodeField
                    label="Code from your app or a recovery code"
                    value={code}
                    onChange={editCode}
                    error={errors.code}
                    disabled={busy}
                  />
                </div>
                <div className="form-actions settings-actions">
                  {cancelButton}
                  <button type="submit" className="btn-light" disabled={busy}>
                    {busy ? (
                      <BusyLabel>Turning Off</BusyLabel>
                    ) : (
                      <>
                        <ShieldOff size={16} aria-hidden="true" />
                        Turn Off
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-xs text-secondary mt-3">
                  Signing in asks for your password and then a 6-digit code from your
                  authenticator app. Lost your phone? A recovery code works once in its place.
                </p>
                <div className="form-actions settings-actions">
                  <SaveConfirmation visible={done !== ''} message={done} />
                  <div className="two-step-buttons">
                    <button type="button" className="btn-light" onClick={() => reset('renew')}>
                      <KeyRound size={16} aria-hidden="true" />
                      New Recovery Codes
                    </button>
                    <button type="button" className="btn-light" onClick={() => reset('disable')}>
                      <ShieldOff size={16} aria-hidden="true" />
                      Turn Off
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <dl className="settings-facts">
              <div>
                <dt>Two-step sign-in</dt>
                <dd>Off</dd>
              </div>
            </dl>
            <p className="text-xs text-secondary mt-3">
              Add a second step after your password: a 6-digit code from an
              authenticator app on your phone. Somebody who learns your password
              still cannot sign in without it.
            </p>
            <div className="form-actions settings-actions">
              <SaveConfirmation visible={done !== ''} message={done} />
              <button type="button" className="btn-light" onClick={start} disabled={busy}>
                {busy ? (
                  <BusyLabel>Starting</BusyLabel>
                ) : (
                  <>
                    <ShieldCheck size={16} aria-hidden="true" />
                    Turn On Two-Step Sign-in
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The code box. `digitsOnly` is the setup step, where only the app's code
 * makes sense; elsewhere a recovery code (`xxxx-xxxx`) is typed in it too, so
 * the keyboard stays a full one.
 */
function CodeField({
  label,
  value,
  onChange,
  error,
  disabled,
  digitsOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  digitsOnly?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="form-input two-step-code-input"
        value={value}
        onChange={e => onChange(digitsOnly ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
        inputMode={digitsOnly ? 'numeric' : 'text'}
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={digitsOnly ? 6 : 12}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/**
 * The ten codes, the one time they exist in readable form. Copy and Download
 * are both offered because a phone has no good place to "download" to and a
 * laptop has no good place to paste to.
 */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { alert } = useAlert();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Run As One recovery codes\nEach works once, in place of a code from your authenticator app.\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      await alert('Could not copy. Select the codes and copy them, or use Download.');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'run-as-one-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <p className="text-sm text-primary">
        <strong>Save these recovery codes now.</strong> Each one signs you in once
        if you lose your phone. This is the only time they are shown.
      </p>
      <ul className="two-step-codes" aria-label="Recovery codes">
        {codes.map(c => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="two-step-buttons mt-4">
        <button type="button" className="btn-light" onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn-light" onClick={download}>
          <Download size={16} aria-hidden="true" />
          Download .txt
        </button>
      </div>

      <label className="two-step-saved group">
        {/* The registration waiver's checkbox (ConsentWaiver.tsx), in the
            dashboard's colours: a real input, visually hidden, and the box
            beside it carries the look. */}
        <input
          type="checkbox"
          className="sr-only peer"
          checked={saved}
          onChange={e => setSaved(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className={`shrink-0 w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-all peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-orange ${
            saved ? 'border-accent-orange bg-accent-orange' : 'border-[var(--dash-border)] group-hover:border-[var(--text-secondary)]'
          }`}
        >
          {saved && <Check size={14} strokeWidth={3} className="text-black" />}
        </span>
        <span>I saved these codes</span>
      </label>

      <div className="form-actions settings-actions">
        <span />
        <button type="button" className="btn-light" onClick={onDone} disabled={!saved}>
          Done
        </button>
      </div>
    </>
  );
}
