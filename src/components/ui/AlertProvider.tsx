"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AlertModal, { type AlertVariant } from "./AlertModal";
import Toast from "./Toast";

export type AlertOptions = {
  /** Falls back to the variant's own heading ("Success", "Action Failed"…). */
  title?: string;
  message: React.ReactNode;
  variant?: AlertVariant;
  confirmLabel?: string;
};

export type ConfirmOptions = AlertOptions & { cancelLabel?: string };

export type ToastOptions = {
  /** Optional bold first line. A one-line toast reads fine without it. */
  title?: string;
  message: React.ReactNode;
  /** Defaults to success — the case a toast exists for. */
  variant?: AlertVariant;
  /** How long it stays before leaving on its own, in ms. */
  duration?: number;
};

type Dialog = ConfirmOptions & {
  id: number;
  mode: "alert" | "confirm";
  resolve: (value: boolean) => void;
};

type ToastItem = ToastOptions & { id: number; open: boolean };

type AlertContextValue = {
  /** Awaitable stand-in for window.alert. Resolves once dismissed. */
  alert: (options: string | AlertOptions) => Promise<void>;
  /** Awaitable stand-in for window.confirm. Resolves true only on confirm. */
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
  /** Says something worked and leaves. Nothing to await, nothing to click. */
  toast: (options: string | ToastOptions) => void;
};

const AlertContext = createContext<AlertContextValue | null>(null);

/** Kept in step with --modal-close-dur in globals.css. */
const CLOSE_MS = 150;
/** Kept in step with --toast-close-dur in globals.css. */
const TOAST_CLOSE_MS = 250;
/** How long a toast stays before leaving on its own. */
const TOAST_MS = 4000;

let nextId = 0;

function normalize<T extends { message: React.ReactNode }>(
  options: string | T,
): T {
  return (typeof options === "string" ? { message: options } : options) as T;
}

/**
 * The app's alert notifications, themed instead of native.
 *
 * window.alert paints an OS chrome box that ignores the dark palette entirely,
 * and it blocks the main thread. This replaces both it and window.confirm with
 * a promise, so callers keep reading top to bottom:
 *
 *     const { alert, confirm } = useAlert();
 *     await alert("Please upload your proof of payment.");
 *     if (!(await confirm({ variant: "danger", message: "Delete?" }))) return;
 *
 * Destructuring `alert` shadows the global on purpose: inside a component that
 * has called useAlert, a plain alert("…") can no longer reach the native box.
 *
 * Dialogs queue. Two failures raised back to back are read one after the other
 * rather than the second silently replacing the first.
 *
 * The third thing it hands out is `toast`, for the opposite case: something
 * worked and nobody needs to acknowledge it.
 *
 *     toast("Promotion paused.");
 *
 * Toasts stack rather than queue. A dialog blocks, so only one of those can be
 * read at a time; three confirmations can be read at once, and holding the
 * second back until the first had timed out would land it after the organizer
 * had already moved on.
 */
export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Dialog[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const current = queue[0] ?? null;

  // The panel has to mount at scale(0.96)/opacity 0 and only then get is-open,
  // or the browser has nothing to transition from. A timer rather than
  // requestAnimationFrame: rAF never fires while the tab is not painting, and
  // an alert stuck without is-open is invisible (opacity 0) but still blocking.
  useEffect(() => {
    if (!current || isClosing) return;
    const timer = window.setTimeout(() => setIsOpen(true), 16);
    return () => window.clearTimeout(timer);
  }, [current, isClosing]);

  const settle = useCallback(
    (value: boolean) => {
      if (!current || isClosing) return;
      setIsOpen(false);
      setIsClosing(true);
      // The caller waits out the close animation, so whatever it does next
      // (a redirect, a refetch) does not fight the dialog on its way off.
      window.setTimeout(() => {
        setIsClosing(false);
        setQueue((q) => q.slice(1));
        current.resolve(value);
      }, CLOSE_MS);
    },
    [current, isClosing],
  );

  useEffect(() => {
    if (!current || isClosing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, isClosing, settle]);

  const enqueue = useCallback(
    (mode: Dialog["mode"], options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setQueue((q) => [...q, { ...options, mode, id: nextId++, resolve }]);
      }),
    [],
  );

  // Drop is-open first so the toast animates out, then unmount it once the
  // close clock has run. Filtering an id that has already gone is a no-op, so
  // the auto-dismiss timer firing after a hand dismissal costs nothing.
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, open: false } : x)));
    window.setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      TOAST_CLOSE_MS,
    );
  }, []);

  const raise = useCallback(
    (options: ToastOptions) => {
      const id = nextId++;
      // Mounted closed and opened a frame later, for the same reason the
      // dialog is: there is nothing to transition from otherwise.
      setToasts((t) => [...t, { ...options, id, open: false }]);
      window.setTimeout(
        () =>
          setToasts((t) =>
            t.map((x) => (x.id === id ? { ...x, open: true } : x)),
          ),
        16,
      );
      window.setTimeout(
        () => dismissToast(id),
        (options.duration ?? TOAST_MS) + 16,
      );
    },
    [dismissToast],
  );

  const value = useMemo<AlertContextValue>(
    () => ({
      alert: (options) =>
        enqueue("alert", normalize(options)).then(() => undefined),
      confirm: (options) => enqueue("confirm", normalize(options)),
      toast: (options) => raise(normalize(options)),
    }),
    [enqueue, raise],
  );

  return (
    <AlertContext.Provider value={value}>
      {children}
      {current && (
        <AlertModal
          key={current.id}
          open={isOpen}
          closing={isClosing}
          variant={current.variant}
          title={current.title}
          message={current.message}
          confirmLabel={current.confirmLabel}
          cancelLabel={current.cancelLabel}
          showCancel={current.mode === "confirm"}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}

      {/* Above the dialog (10050): a toast raised from inside a modal — a
          batch generated, a code copied — is about the thing on top. The rail
          itself never takes clicks; only the toasts sitting on it do. */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 flex flex-col items-end gap-3 pointer-events-none"
          style={{ zIndex: 10100 }}
          aria-live="polite"
        >
          {toasts.map((t) => (
            <Toast
              key={t.id}
              open={t.open}
              variant={t.variant}
              title={t.title}
              message={t.message}
              onDismiss={() => dismissToast(t.id)}
            />
          ))}
        </div>
      )}
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error(
      "useAlert must be called inside <AlertProvider>, which is mounted in src/app/layout.tsx.",
    );
  }
  return ctx;
}
