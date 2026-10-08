'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

/**
 * The create and edit forms' two outcome dialogs: "Action Failed" for a save
 * or upload that went wrong, "Success" for a save that landed.
 *
 * The page owns the messages, since every handler on it sets them; this owns
 * only the open/closing animation. Each dialog waits out its 150ms close
 * before reporting back, so the text does not vanish while the panel is still
 * fading: `onErrorDismissed` clears the error, `onSuccessContinue` is where the
 * page leaves for the events list.
 */
export default function EventFormResultModals({
  error,
  onErrorDismissed,
  successMsg,
  onSuccessContinue,
}: {
  error: string;
  onErrorDismissed: () => void;
  successMsg: string;
  onSuccessContinue: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isSuccessClosing, setIsSuccessClosing] = useState(false);

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
      onErrorDismissed();
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
      onSuccessContinue();
    }, 150);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
          error && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 100 }}
      >
        <div
          className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
          role="dialog"
        >
          <div className="admin-modal-body flex items-start gap-4">
            <div className="p-3 bg-red-500/10 rounded-full text-[var(--status-danger)] shrink-0 mt-1">
              <AlertCircle size={24} strokeWidth={2} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className="text-xl font-semibold text-primary">Action Failed</h3>
              <p className="text-secondary text-sm leading-relaxed [overflow-wrap:anywhere]">{error}</p>
            </div>
          </div>
          <div className="admin-modal-footer flex justify-end pt-2 border-t border-[var(--dash-hairline)]">
            <button
              type="button"
              onClick={closeErrorModal}
              className="px-5 py-2 bg-[var(--ink-05)] hover:bg-[var(--ink-10)] border border-[var(--dash-border)] rounded-lg text-sm font-medium text-primary transition-colors"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
          successMsg && !isSuccessClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 100 }}
      >
        <div
          className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-green-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isSuccessOpen ? 'is-open' : ''} ${isSuccessClosing ? 'is-closing' : ''}`}
          role="dialog"
        >
          <div className="admin-modal-body flex items-start gap-4">
            <div className="p-3 bg-green-500/10 rounded-full text-[var(--status-success)] shrink-0 mt-1">
              <CheckCircle size={24} strokeWidth={2} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className="text-xl font-semibold text-primary">Success</h3>
              <p className="text-secondary text-sm leading-relaxed [overflow-wrap:anywhere]">{successMsg}</p>
            </div>
          </div>
          <div className="admin-modal-footer flex justify-end pt-2 border-t border-[var(--dash-hairline)]">
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
    </>
  );
}
