"use client";

import { useEffect, useRef, useState } from 'react';

/** The close animation's length — the t-modal exit the other admin modals use. */
const CLOSE_MS = 150;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ApplicationPanel's behaviour as a dialog, kept apart from what it shows:
 * the scale-in one frame after mount, the exit before `onClose`, focus on the
 * close button and back to the opener, Escape to close, and Tab wrapping
 * inside the panel — yielding to a dialog raised above it.
 */
export function useApplicationDialog(onClose: () => void) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // One frame after mount, so the scale-in has a state to travel from. Focus
  // goes to the close button, and back to the opener when the panel goes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setOpen(true));
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const requestClose = () => {
    if (closing) return;
    setOpen(false);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  // Escape closes; Tab and Shift+Tab wrap inside the panel rather than walking
  // out into the list behind it, which a screen reader user cannot see.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A confirm raised from the footer (AlertProvider) sits above this panel
      // and owns the keyboard while it is up: its Escape cancels it, not both.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(el => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return { open, closing, panelRef, closeRef, requestClose };
}
