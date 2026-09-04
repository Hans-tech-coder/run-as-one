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

export type AlertOptions = {
  /** Falls back to the variant's own heading ("Success", "Action Failed"…). */
  title?: string;
  message: React.ReactNode;
  variant?: AlertVariant;
  confirmLabel?: string;
};

export type ConfirmOptions = AlertOptions & { cancelLabel?: string };

type Dialog = ConfirmOptions & {
  id: number;
  mode: "alert" | "confirm";
  resolve: (value: boolean) => void;
};

type AlertContextValue = {
  /** Awaitable stand-in for window.alert. Resolves once dismissed. */
  alert: (options: string | AlertOptions) => Promise<void>;
  /** Awaitable stand-in for window.confirm. Resolves true only on confirm. */
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
};

const AlertContext = createContext<AlertContextValue | null>(null);

/** Kept in step with --modal-close-dur in globals.css. */
const CLOSE_MS = 150;

let nextId = 0;

function normalize<T extends AlertOptions>(options: string | T): T {
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
 */
export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Dialog[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

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

  const value = useMemo<AlertContextValue>(
    () => ({
      alert: (options) =>
        enqueue("alert", normalize(options)).then(() => undefined),
      confirm: (options) => enqueue("confirm", normalize(options)),
    }),
    [enqueue],
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
