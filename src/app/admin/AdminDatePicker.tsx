"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { cssDurationMs } from "@/lib/css-duration";
import {
  MONTHS,
  WEEKDAYS,
  addDays,
  addMonths,
  clampDay,
  dayParts,
  daysInMonth,
  formatCalendarDay,
  isoDay,
  monthWeeks,
  weekday,
} from "@/lib/calendar-day";
import { isCalendarDay, today } from "@/lib/event-schedule";
import AdminSelect, { type AdminSelectOption } from "./AdminSelect";

/**
 * A calendar day picked on a dashboard screen, from a calendar we draw.
 *
 * The runner's wizard retired the native `<input type="date">` first
 * (`events/[slug]/register/BirthdatePicker`, GUARDIAN_CONSENT_PLAN.md Batch 2):
 * the browser paints its popup in system colours, which is the objection that
 * already retired the native select, and its `min`/`max` are hints some phones
 * ignore. The dashboard kept the native box for its event dates, promo
 * windows, activity range, remittance day and the runner edit's birthdate
 * until this. It is the same calendar in the admin's clothes — `.form-label` /
 * `.form-input` and the dashboard's tokens, so it follows the light and dark
 * themes — for the reason AdminSelect is a sibling of SelectField rather than
 * the same component: the two sides of the site are two design systems. The
 * arithmetic is shared (`lib/calendar-day.ts`); only the dress differs.
 *
 * What the dashboard needs that a birthdate did not:
 * - **A range in either direction.** An event date is ahead, a remittance day
 *   is behind, an activity range is bounded by its other end. `min` and `max`
 *   disable every day outside them; with neither, the Year list runs ten years
 *   either side of today (and of the value, so an old row still opens on its
 *   own year).
 * - **Clearing.** A promo window or an activity bound may be left blank, so a
 *   `clearable` picker has a Clear button, and every picker has a Today button
 *   when today is pickable.
 * - **Living inside modals.** The popover is portalled to `<body>` and placed
 *   with `position: fixed` under (or, without room, over) the field, because a
 *   modal's scrolling body would otherwise clip a 20rem calendar. `data-theme`
 *   sits on `<html>` while the dashboard is mounted, so the portalled copy keeps
 *   the theme. Escape closes the calendar and nothing else: dialogs here listen
 *   on `document`, where only stopImmediatePropagation reaches them.
 *
 * Below `sm` it is the wizard's bottom sheet (`.date-sheet`, globals.css) with
 * 44px day cells. Keyboard is the APG date-picker set, as in BirthdatePicker.
 * The value in and out is `YYYY-MM-DD`, or "" for none, exactly what the
 * native input gave, so no form's state or API changed.
 *
 * `withTime` puts a time of day in the same calendar, under the month, rather
 * than a second field beside it (the promo window's Starts and Ends). The value
 * is then `YYYY-MM-DDTHH:mm`, 24-hour, and picking a day no longer closes the
 * calendar — the time is still to be set, so a Done button closes it instead.
 * The day and the time are committed as they change, so dismissing the
 * calendar by clicking away loses nothing. A day picked with no time yet takes
 * `defaultTime`.
 */

/** 1–12 for the Hour list, 00–59 for the Minute list. */
const HOUR_OPTIONS: AdminSelectOption[] = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));
const MINUTE_OPTIONS: AdminSelectOption[] = Array.from({ length: 60 }, (_, i) => {
  const m = String(i).padStart(2, "0");
  return { value: m, label: m };
});
const MERIDIEM_OPTIONS: AdminSelectOption[] = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A 24-hour `HH:mm` as the clock an organizer reads ("5:00 PM"). */
export function formatTimeOfDay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Matches Tailwind's `sm` (640px): below it the calendar is a bottom sheet. */
const PHONE_QUERY = "(max-width: 639.98px)";
/** The popover's width and its keep-out from the screen's edges. */
const POPOVER_WIDTH = 320;
const VIEWPORT_EDGE = 12;
const GAP = 8;
/** Years either side of today (or of the value) when no bound is given. */
const DEFAULT_SPAN = 10;

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export default function AdminDatePicker({
  label,
  value,
  onChange,
  id,
  error,
  hint,
  placeholder,
  withTime = false,
  defaultTime = "00:00",
  min,
  max,
  clearable = false,
  disabled = false,
  dialogLabel = "Choose a date",
  className = "",
  invalid = false,
  describedBy: extraDescribedBy,
}: {
  /** A node rather than a string, so a label can carry its "Optional" mark. */
  label: React.ReactNode;
  /** `YYYY-MM-DD`, or "" while nothing is picked. */
  value: string;
  onChange: (next: string) => void;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  error?: string;
  hint?: React.ReactNode;
  /** An instruction, so sentence case (§9 on placeholders). */
  placeholder?: string;
  /** Adds a time of day inside the calendar; the value becomes `YYYY-MM-DDTHH:mm`. */
  withTime?: boolean;
  /** The time a newly picked day starts with, `HH:mm` 24-hour. */
  defaultTime?: string;
  /** The earliest pickable day, `YYYY-MM-DD`. */
  min?: string;
  /** The latest pickable day, `YYYY-MM-DD`. */
  max?: string;
  /** Offers Clear, for a field that may be left blank. */
  clearable?: boolean;
  disabled?: boolean;
  /** The calendar's accessible name ("Choose the race date"). */
  dialogLabel?: string;
  /** Added to the `.form-group`, for a grid cell's `min-w-0` or a `flex-1`. */
  className?: string;
  /**
   * Marks the field wrong when its message is drawn elsewhere (the opening
   * picker's one line under both its date and its time).
   */
  invalid?: boolean;
  /** The id of that message, to be read with the field. */
  describedBy?: string;
}) {
  const baseId = useId();
  const triggerId = id ?? `${baseId}-trigger`;
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const errorId = `${triggerId}-error`;
  const hintId = `${triggerId}-hint`;
  const dialogId = `${baseId}-dialog`;
  const headingId = `${baseId}-heading`;

  const isPhone = usePhoneLayout();
  const [isOpen, setIsOpen] = useState(false);
  const [isShown, setIsShown] = useState(false);
  // Read when the calendar opens, so a screen left up past midnight moves on.
  const [now, setNow] = useState(() => today());
  const [focusDay, setFocusDay] = useState(() => today());
  const [place, setPlace] = useState({ top: 0, left: 0, up: false });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  // Set by a key press inside the grid, so the new day takes focus. A month
  // changed from the header select must not pull focus out of that select.
  const moveFocus = useRef(false);

  const valueDay = withTime ? value.slice(0, 10) : value;
  const selected = isCalendarDay(valueDay) ? valueDay : "";
  const valueTime = value.slice(11, 16);
  const time = withTime && TIME_OF_DAY.test(valueTime) ? valueTime : defaultTime;
  const [hour24, minute] = time.split(":");
  const hour12 = String(Number(hour24) % 12 || 12);
  const meridiem = Number(hour24) < 12 ? "AM" : "PM";
  const minBound = min && isCalendarDay(min) ? min : "";
  const maxBound = max && isCalendarDay(max) ? max : "";

  // The Year list's reach: the bounds where there are some, otherwise a span
  // around today that also takes in the value itself.
  const anchorLow = selected && selected < now ? selected : now;
  const anchorHigh = selected && selected > now ? selected : now;
  const lowDay = minBound || isoDay(dayParts(anchorLow)[0] - DEFAULT_SPAN, 1, 1);
  const highDay = maxBound || isoDay(dayParts(anchorHigh)[0] + DEFAULT_SPAN, 12, 31);
  // An inverted range (a To bound before its From) still draws a calendar;
  // every day in it is simply disabled.
  const floor = lowDay <= highDay ? lowDay : highDay;
  const ceiling = highDay;
  const isPickable = (day: string) =>
    (!minBound || day >= minBound) && (!maxBound || day <= maxBound);

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
    if (disabled) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const day = today();
    setNow(day);
    setFocusDay(clampDay(selected || day, floor, ceiling));
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

  // Under the field when the calendar fits there, over it when it does not and
  // there is more room above, and never past either side of the screen.
  // Measured before paint and again on every scroll, since a modal body or the
  // dashboard's main column may scroll the field away from where it opened.
  useLayoutEffect(() => {
    if (!isOpen || isPhone) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = dialogRef.current?.offsetHeight ?? 420;
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_EDGE * 2);
      const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_EDGE;
      const above = rect.top - GAP - VIEWPORT_EDGE;
      const up = below < height && above > below;
      const left = Math.max(
        VIEWPORT_EDGE,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_EDGE),
      );
      setPlace({
        top: up ? rect.top - GAP - height : rect.bottom + GAP,
        left,
        up,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [isOpen, isPhone]);

  // A click anywhere outside the field and its calendar dismisses it unchanged.
  // Capture phase, as in BirthdatePicker: a Month or Year option commits on its
  // own pointerdown and unmounts, and a bubbling check would then find the
  // target in no document and close the calendar on every pick.
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

  useEffect(() => {
    if (!isOpen || !moveFocus.current) return;
    moveFocus.current = false;
    dialogRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)
      ?.focus({ preventScroll: true });
  }, [isOpen, focusDay]);

  const pick = (day: string) => {
    if (!isPickable(day)) return;
    if (withTime) {
      // The time is still to be set, so the calendar stays open.
      onChange(`${day}T${time}`);
      return;
    }
    onChange(day);
    close(true);
  };

  // A time changed before any day is picked lands on the day in view.
  const setTime = (h12: string, m: string, ampm: string) => {
    const h = (Number(h12) % 12) + (ampm === "PM" ? 12 : 0);
    const day = selected || (isPickable(focusDay) ? focusDay : "");
    if (!day) return;
    onChange(`${day}T${String(h).padStart(2, "0")}:${m}`);
  };

  const moveTo = (day: string) => {
    moveFocus.current = true;
    setFocusDay(clampDay(day, floor, ceiling));
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
    // An open Month or Year list stops its own Escape (AdminSelect), so this
    // only runs when Escape is meant for the calendar itself.
    if (e.key === "Escape") {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
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
  const [viewYear, viewMonth] = dayParts(focusDay);
  const [floorYear, floorMonth] = dayParts(floor);
  const [ceilingYear, ceilingMonth] = dayParts(ceiling);
  const weeks = monthWeeks(viewYear, viewMonth);

  const firstMonth = viewYear === floorYear ? floorMonth : 1;
  const lastMonth = viewYear === ceilingYear ? ceilingMonth : 12;
  const monthOptions: AdminSelectOption[] = MONTHS.slice(
    firstMonth - 1,
    lastMonth,
  ).map((name, i) => ({ value: String(firstMonth + i), label: name }));
  // Newest first: most of what the dashboard picks is this year or near it.
  const yearOptions: AdminSelectOption[] = Array.from(
    { length: ceilingYear - floorYear + 1 },
    (_, i) => {
      const y = String(ceilingYear - i);
      return { value: y, label: y };
    },
  );

  // Changing the month or year keeps the day of the month where it can, and
  // pulls a date that would fall outside the range back inside it.
  const showMonth = (y: number, m: number) => {
    const [, , d] = dayParts(focusDay);
    setFocusDay(
      clampDay(isoDay(y, m, Math.min(d, daysInMonth(y, m))), floor, ceiling),
    );
  };

  const canPickToday = isPickable(now);
  const showClear = clearable && Boolean(selected);

  const calendar = (
    <>
      <div className="grid grid-cols-[1.4fr_1fr] gap-2">
        <AdminSelect
          label="Month"
          hideLabel
          listboxLabel="Month"
          value={String(viewMonth)}
          options={monthOptions}
          onChange={(m) => showMonth(viewYear, Number(m))}
        />
        <AdminSelect
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
              className="flex h-8 items-center justify-center text-xs font-medium text-secondary"
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
              const isOff = !isPickable(day);
              const isSelected = day === selected;
              const isToday = day === now;
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
                    disabled={isOff}
                    aria-label={formatCalendarDay(day)}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => pick(day)}
                    onFocus={() => {
                      if (!isFocus) setFocusDay(day);
                    }}
                    className={`flex h-11 w-full max-w-11 sm:h-10 sm:max-w-10 items-center justify-center rounded-full text-sm tabular-nums transition-colors focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] ${
                      isSelected
                        ? "bg-accent-orange font-semibold text-white"
                        : isOff
                          ? "cursor-not-allowed text-[var(--ink-20)]"
                          : `text-primary hover:bg-[var(--ink-10)] ${
                              isToday ? "ring-1 ring-inset ring-[var(--ink-30)]" : ""
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

      {withTime && (
        <div className="mt-2 border-t border-[var(--dash-hairline)] pt-3">
          <span className="mb-2 block text-xs font-medium text-secondary">Time (Philippine time)</span>
          <div className="grid grid-cols-3 gap-2">
            <AdminSelect
              label="Hour"
              hideLabel
              listboxLabel="Hour"
              value={hour12}
              options={HOUR_OPTIONS}
              onChange={(h) => setTime(h, minute, meridiem)}
            />
            <AdminSelect
              label="Minute"
              hideLabel
              listboxLabel="Minute"
              value={minute}
              options={MINUTE_OPTIONS}
              onChange={(m) => setTime(hour12, m, meridiem)}
            />
            <AdminSelect
              label="AM or PM"
              hideLabel
              listboxLabel="AM or PM"
              value={meridiem}
              options={MERIDIEM_OPTIONS}
              onChange={(a) => setTime(hour12, minute, a)}
            />
          </div>
        </div>
      )}

      {(canPickToday || showClear || withTime) && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--dash-hairline)] pt-2">
          {showClear ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                close(true);
              }}
              className="rounded-lg px-3 h-11 sm:h-9 text-sm text-secondary hover:bg-[var(--ink-05)] hover:text-primary focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]"
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1">
            {canPickToday && (
              <button
                type="button"
                onClick={() => {
                  if (withTime) setFocusDay(now);
                  pick(now);
                }}
                className="rounded-lg px-3 h-11 sm:h-9 text-sm font-medium text-accent-blue-ink hover:bg-[var(--ink-05)] focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]"
              >
                Today
              </button>
            )}
            {withTime && (
              <button
                type="button"
                onClick={() => close(true)}
                className="rounded-lg px-3 h-11 sm:h-9 text-sm font-semibold text-primary hover:bg-[var(--ink-05)] focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]"
              >
                Done
              </button>
            )}
          </span>
        </div>
      )}
    </>
  );

  const dialogProps = {
    ref: dialogRef,
    id: dialogId,
    role: "dialog",
    "aria-modal": isPhone ? true : undefined,
    "aria-label": dialogLabel,
    onKeyDown: handleDialogKeyDown,
    onBlur: handleDialogBlur,
  } as const;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null, extraDescribedBy ?? null]
      .filter(Boolean)
      .join(" ") ||
    undefined;

  return (
    <div className={`form-group ${className}`}>
      <label id={labelId} className="form-label" htmlFor={triggerId}>
        {label}
      </label>

      <div ref={wrapperRef} className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? dialogId : undefined}
          // The label and the date together: a label alone would name the
          // button "From" and never say which day it holds.
          aria-labelledby={`${labelId} ${valueId}`}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={describedBy}
          onClick={() => (isOpen ? close() : open())}
          className="form-input flex items-center gap-2 text-left"
        >
          <span
            id={valueId}
            className={`flex-1 min-w-0 truncate ${selected ? "" : "text-[var(--ink-30)]"}`}
          >
            {selected
              ? withTime
                ? `${formatCalendarDay(selected)} · ${formatTimeOfDay(time)}`
                : formatCalendarDay(selected)
              : (placeholder ?? (withTime ? "Select a date and time" : "Select a date"))}
          </span>
          <CalendarDays
            size={16}
            aria-hidden="true"
            className="shrink-0 text-[var(--ink-50)]"
          />
        </button>
      </div>

      {isOpen &&
        !isPhone &&
        createPortal(
          <div
            {...dialogProps}
            data-origin={place.up ? "bottom-left" : "top-left"}
            style={{ top: place.top, left: place.left }}
            className={`t-dropdown ${isShown ? "is-open" : "is-closing"} fixed z-[1100] w-[20rem] max-w-[calc(100vw-24px)] rounded-[12px] border border-[var(--ink-15)] bg-[var(--dash-panel-solid)] p-3 text-primary shadow-[0_16px_40px_var(--dash-shadow)]`}
          >
            {calendar}
          </div>,
          document.body,
        )}

      {isOpen &&
        isPhone &&
        createPortal(
          <div className="fixed inset-0 z-[1100]">
            <div
              aria-hidden="true"
              onClick={() => close(true)}
              className={`date-sheet-backdrop ${isShown ? "is-open" : "is-closing"} absolute inset-0 bg-[var(--dash-scrim)]`}
            />
            <div
              {...dialogProps}
              className={`date-sheet ${isShown ? "is-open" : "is-closing"} absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-[var(--ink-15)] bg-[var(--dash-panel-solid)] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] text-primary shadow-[0_-16px_40px_var(--dash-shadow)]`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">{dialogLabel}</span>
                <button
                  type="button"
                  onClick={() => close(true)}
                  aria-label="Close calendar"
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-secondary hover:bg-[var(--ink-10)] hover:text-primary focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]"
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

      {hint && (
        <p id={hintId} className="text-xs text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}
