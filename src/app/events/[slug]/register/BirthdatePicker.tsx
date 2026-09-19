"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { isCalendarDay, today } from "@/lib/event-schedule";
import { cssDurationMs } from "@/lib/css-duration";
import {
  MONTHS,
  WEEKDAYS,
  addDays,
  addMonths,
  clampDay as clamp,
  dayParts as parts,
  daysInMonth,
  formatCalendarDay,
  isoDay as iso,
  monthWeeks,
  weekday,
} from "@/lib/calendar-day";
import SelectField, { type SelectOption } from "./SelectField";

/**
 * The runner's birthdate, picked from a calendar we draw ourselves.
 *
 * The native `<input type="date">` it replaces had three faults. Its popup is
 * painted by the browser, in system colours, the same objection that retired
 * the native select (SelectField). It opens on *this* month, and a birthdate
 * is decades back: reaching 1988 meant pressing "previous month" several
 * hundred times, or knowing that the year can be typed. And its `max` is only
 * a hint. Future days stayed pickable on some phones until the server refused
 * them (GUARDIAN_CONSENT_PLAN.md, Batch 2).
 *
 * So the header is a Month and a Year select, and the year list runs from the
 * current Manila year back a century: a birthdate is two taps from anywhere.
 * Days after today are drawn disabled and cannot take focus. Months after this
 * one are left out of the Month list while the current year is showing, and the
 * Year list stops at this year. "Today" is Manila's (`today()`), never UTC's,
 * which would still be yesterday before 8 AM.
 *
 * The value in and out is the same `YYYY-MM-DD` string the native input gave,
 * so the wizards' state, validation.ts and the checkout routes did not change.
 * The trigger carries the id the wizard hands it, so `focusField` still lands
 * here after a failed Next, and the error is wired exactly like SelectField's.
 *
 * Every date here is a calendar day, not an instant; the arithmetic is
 * `lib/calendar-day.ts`, shared with the dashboard's AdminDatePicker.
 *
 * On a phone the calendar rises as a bottom sheet (portalled to <body>, because
 * the wizard's panels carry transforms that would trap a fixed element) with
 * day cells at least 44px wide. From `sm` up it hangs under the field and grows
 * from it with transitions.dev's dropdown (`.t-dropdown`).
 */

/** How far back the Year list reaches: a century covers every runner. */
const YEARS_BACK = 100;

/** Matches Tailwind's `sm` (640px): below it the calendar is a bottom sheet. */
const PHONE_QUERY = "(max-width: 639.98px)";

/** "March 4, 2014" — the words a runner would say, never an ambiguous 03/04/14. */
export function formatBirthdate(day: string): string {
  return isCalendarDay(day) ? formatCalendarDay(day) : "";
}

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The server has no screen; the calendar is closed on first paint anyway. */
function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export default function BirthdatePicker({
  label = "Birthdate",
  value,
  onChange,
  id,
  error,
  placeholder = "Select your birthdate",
}: {
  label?: string;
  /** `YYYY-MM-DD`, or "" while nothing is picked. */
  value: string;
  onChange: (next: string) => void;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  /** What the field still wants, or nothing when it is satisfied. */
  error?: string;
  /** An instruction, so sentence case (see §9 on placeholders). */
  placeholder?: string;
}) {
  const baseId = useId();
  const triggerId = id ?? `${baseId}-trigger`;
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const errorId = `${triggerId}-error`;
  const dialogId = `${baseId}-dialog`;
  const headingId = `${baseId}-heading`;

  const isPhone = usePhoneLayout();
  const [isOpen, setIsOpen] = useState(false);
  const [isShown, setIsShown] = useState(false);
  // Refreshed each time the calendar opens, so a form left on screen past
  // midnight does not keep yesterday as its last pickable day.
  const [max, setMax] = useState(() => today());
  const [focusDay, setFocusDay] = useState(() => today());

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  // Set by a key press inside the grid, so the new day takes focus. A month
  // changed from the header select must not pull focus out of that select.
  const moveFocus = useRef(false);

  const [maxYear] = parts(max);
  const minDay = iso(maxYear - YEARS_BACK, 1, 1);
  const selected = isCalendarDay(value) ? value : "";

  const close = useCallback((returnFocus = false) => {
    setIsShown(false);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(
      () => setIsOpen(false),
      cssDurationMs("--dropdown-close-dur", 150),
    );
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const open = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const now = today();
    const floor = iso(parts(now)[0] - YEARS_BACK, 1, 1);
    setMax(now);
    // Opens on the chosen day, or on today when there is none yet; the Year
    // select is the first thing in the tab order either way.
    setFocusDay(clamp(selected || now, floor, now));
    moveFocus.current = true;
    setIsShown(false);
    setIsOpen(true);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // A frame after mounting, so the calendar transitions in rather than appearing.
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => setIsShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  // A click anywhere outside the field and its calendar dismisses it unchanged.
  // Listened for in the capture phase: a Month or Year option commits on its own
  // pointerdown and unmounts, so by the time a bubbling listener asked whether
  // the target was inside the calendar, it was in no document at all and the
  // whole calendar closed on every pick from those lists.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (dialogRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isOpen, close]);

  // The sheet covers the page, so the page behind it must not scroll under a thumb.
  useEffect(() => {
    if (!isOpen || !isPhone) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, isPhone]);

  useEffect(() => {
    if (!isOpen || !moveFocus.current) return;
    moveFocus.current = false;
    dialogRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)
      ?.focus({ preventScroll: isPhone });
  }, [isOpen, focusDay, isPhone]);

  const pick = (day: string) => {
    if (day > max) return;
    onChange(day);
    close(true);
  };

  const moveTo = (day: string) => {
    moveFocus.current = true;
    setFocusDay(clamp(day, minDay, max));
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusDay, -1),
      ArrowRight: () => addDays(focusDay, 1),
      ArrowUp: () => addDays(focusDay, -7),
      ArrowDown: () => addDays(focusDay, 7),
      Home: () => addDays(focusDay, -weekday(focusDay)),
      End: () => addDays(focusDay, 6 - weekday(focusDay)),
      // Shift+PageUp/PageDown steps a year, as in the APG date picker.
      PageUp: () => addMonths(focusDay, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusDay, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      moveTo(move());
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focusDay);
    }
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // An open Month or Year list stops its own Escape (SelectField), so this
    // only runs when Escape is meant for the calendar itself.
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
    }
  };

  // Tabbing out of the calendar closes it; a click on its own padding moves
  // focus nowhere (relatedTarget is null) and must not.
  const handleDialogBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (dialogRef.current?.contains(next)) return;
    if (next === triggerRef.current) return;
    close();
  };

  // --- The month on screen -------------------------------------------------
  const [viewYear, viewMonth] = parts(focusDay);
  const [, maxMonth] = parts(max);
  // Always six weeks, so the calendar keeps one height from month to month
  // and the sheet does not jump under the runner's thumb while they browse.
  const weeks = monthWeeks(viewYear, viewMonth);

  const monthOptions: SelectOption[] = MONTHS.slice(
    0,
    viewYear === maxYear ? maxMonth : 12,
  ).map((name, i) => ({ value: String(i + 1), label: name }));
  const yearOptions: SelectOption[] = Array.from(
    { length: YEARS_BACK + 1 },
    (_, i) => {
      const y = String(maxYear - i);
      return { value: y, label: y };
    },
  );

  // Changing the month or year keeps the day of the month where it can, and
  // pulls a date that would land in the future back to today.
  const showMonth = (y: number, m: number) => {
    const [, , d] = parts(focusDay);
    setFocusDay(clamp(iso(y, m, Math.min(d, daysInMonth(y, m))), minDay, max));
  };

  const calendar = (
    <>
      <div className="grid grid-cols-[1.4fr_1fr] gap-2">
        <SelectField
          label="Month"
          hideLabel
          listboxLabel="Month"
          value={String(viewMonth)}
          options={monthOptions}
          onChange={(m) => showMonth(viewYear, Number(m))}
        />
        <SelectField
          label="Year"
          hideLabel
          listboxLabel="Year"
          value={String(viewYear)}
          options={yearOptions}
          onChange={(y) => showMonth(Number(y), viewMonth)}
        />
      </div>

      <div
        role="grid"
        aria-labelledby={headingId}
        onKeyDown={handleGridKeyDown}
        className="mt-3"
      >
        <span id={headingId} className="sr-only" aria-live="polite">
          {MONTHS[viewMonth - 1]} {viewYear}
        </span>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map(([short, full]) => (
            <span
              key={full}
              role="columnheader"
              aria-label={full}
              className="flex h-8 items-center justify-center text-xs font-medium text-gray-500"
            >
              {short}
            </span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} role="row" className="grid grid-cols-7">
            {week.map((day, i) => {
              if (!day) {
                return <span key={`blank-${i}`} role="gridcell" />;
              }
              const isFuture = day > max;
              const isSelected = day === selected;
              const isToday = day === max;
              const isFocus = day === focusDay;
              return (
                <span
                  key={day}
                  role="gridcell"
                  aria-selected={isSelected}
                  className="flex items-center justify-center p-0.5"
                >
                  <button
                    type="button"
                    data-day={day}
                    tabIndex={isFocus ? 0 : -1}
                    disabled={isFuture}
                    aria-label={formatBirthdate(day)}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => pick(day)}
                    onFocus={() => {
                      if (!isFocus) setFocusDay(day);
                    }}
                    className={`birthdate-day flex h-11 w-full max-w-11 sm:h-10 sm:max-w-10 items-center justify-center rounded-full text-sm tabular-nums transition-colors focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] ${
                      isSelected
                        ? "bg-accent-orange font-semibold text-white"
                        : isFuture
                          ? "cursor-not-allowed text-white/20"
                          : `text-white hover:bg-white/10 ${
                              isToday ? "ring-1 ring-inset ring-white/30" : ""
                            }`
                    }`}
                  >
                    {Number(day.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );

  const dialogProps = {
    ref: dialogRef,
    id: dialogId,
    role: "dialog",
    "aria-modal": isPhone ? true : undefined,
    "aria-label": `Choose ${label.toLowerCase()}`,
    onKeyDown: handleDialogKeyDown,
    onBlur: handleDialogBlur,
  } as const;

  return (
    <div className="input-group">
      <label id={labelId} htmlFor={triggerId}>
        {label}
      </label>

      <div ref={wrapperRef} className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? dialogId : undefined}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onClick={() => (isOpen ? close() : open())}
          className="control-shell w-full flex items-center gap-2 rounded-[8px] border border-white/10 bg-black/30 px-4 min-h-[48px] text-left transition-all focus:outline-none focus:border-accent-blue focus:bg-black/40 focus:shadow-[0_0_0_3px_rgba(43,192,255,0.2)]"
        >
          <span
            id={valueId}
            className={`flex-1 min-w-0 truncate ${
              selected ? "text-white" : "text-gray-500"
            }`}
          >
            {selected ? formatBirthdate(selected) : placeholder}
          </span>
          <CalendarDays
            size={16}
            aria-hidden="true"
            className="shrink-0 text-white"
          />
        </button>

        {isOpen && !isPhone && (
          <div
            {...dialogProps}
            data-origin="top-left"
            className={`t-dropdown ${isShown ? "is-open" : "is-closing"} absolute z-30 left-0 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] rounded-[12px] border border-white/15 bg-[#0d0d0f] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.6)]`}
          >
            {calendar}
          </div>
        )}
      </div>

      {isOpen &&
        isPhone &&
        createPortal(
          <div className="fixed inset-0 z-[100]">
            <div
              aria-hidden="true"
              onClick={() => close(true)}
              className={`date-sheet-backdrop ${isShown ? "is-open" : "is-closing"} absolute inset-0 bg-black/60`}
            />
            <div
              {...dialogProps}
              className={`date-sheet ${isShown ? "is-open" : "is-closing"} absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-white/15 bg-[#0d0d0f] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(0,0,0,0.6)]`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => close(true)}
                  aria-label="Close calendar"
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              {calendar}
            </div>
          </div>,
          document.body,
        )}

      <FieldError id={errorId} message={error} />
    </div>
  );
}
