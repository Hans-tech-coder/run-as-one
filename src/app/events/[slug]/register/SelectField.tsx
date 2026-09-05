"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import FieldError from "@/components/ui/FieldError";

/**
 * A short, closed list of answers, drawn by us rather than by the browser.
 *
 * A native <select> takes the field's styling but not its menu: Chrome and
 * Windows paint that list themselves, in system blue and grey, which made it
 * the one place in the wizard that stopped looking like the wizard. The
 * running-community and country-code fields already open a dark panel of their
 * own, so a third look for the same gesture was the odd one out.
 *
 * The combobox in this folder answers a different question — a list too long to
 * scroll that the runner may need to write past. This is the opposite case: two
 * or three answers, none of them typed, where a text box would invite an answer
 * the results table cannot use.
 *
 * Focus never leaves the trigger; the highlighted row is announced through
 * aria-activedescendant, which is what lets the arrow keys, Enter and Escape
 * behave the way they do in a real select.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Sits at the row's left while the row is not the current answer. */
  icon?: React.ReactNode;
}

export default function SelectField({
  label,
  value,
  options,
  placeholder = "Select",
  hint,
  listboxLabel,
  onChange,
  id,
  error,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** Small print under the field. */
  hint?: React.ReactNode;
  listboxLabel: string;
  onChange: (next: string) => void;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  /** What the field still wants, or nothing when it is satisfied. */
  error?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The wizards render one of these per runner, so every id has to be unique or
  // runner two's listbox would be labelled by runner one's trigger.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const triggerId = id ?? `${baseId}-trigger`;
  const errorId = `${triggerId}-error`;
  const hintId = `${triggerId}-hint`;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  // Opening lands on the current answer, so the arrow keys move relative to
  // what is already chosen rather than from the top every time.
  const open = (fallback: number) => {
    setIsOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : fallback);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  };

  // Clicking elsewhere dismisses the list without changing the answer.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  // Keep the highlighted row inside the scroll box, for the day a list here
  // grows past the panel's height.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      if (!isOpen) {
        open(step === 1 ? 0 : options.length - 1);
        return;
      }
      if (options.length === 0) return;
      setActiveIndex((prev) => {
        // Nothing highlighted yet: down starts at the top, up at the bottom.
        // Wrapping arithmetic alone would land one short on the way up.
        if (prev < 0) return step === 1 ? 0 : options.length - 1;
        return (prev + step + options.length) % options.length;
      });
      return;
    }

    if (isOpen && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      setActiveIndex(e.key === "Home" ? 0 : options.length - 1);
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isOpen) {
        open(0);
        return;
      }
      if (activeIndex >= 0) commit(activeIndex);
      return;
    }

    if (e.key === "Escape") {
      if (isOpen) {
        // The wizard's dialogs listen for Escape as well; closing this list
        // must not also close whatever it is sitting inside.
        e.stopPropagation();
        close();
      }
      return;
    }

    if (e.key === "Tab") close();
  };

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="input-group">
      <label htmlFor={triggerId}>{label}</label>

      <div ref={wrapperRef} className="relative">
        <button
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-activedescendant={
            isOpen && activeIndex >= 0
              ? `${baseId}-row-${activeIndex}`
              : undefined
          }
          onClick={() => (isOpen ? close() : open(0))}
          onKeyDown={handleKeyDown}
          className="control-shell w-full flex items-center gap-2 rounded-[8px] border border-white/10 bg-black/30 px-4 min-h-[48px] text-left transition-all focus:outline-none focus:border-accent-blue focus:bg-black/40 focus:shadow-[0_0_0_3px_rgba(43,192,255,0.2)]"
        >
          <span
            className={`flex-1 min-w-0 truncate ${
              selected ? "text-white" : "text-gray-500"
            }`}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-white transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && options.length > 0 && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={listboxLabel}
            className="absolute z-30 left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-[12px] border border-white/15 bg-[#0d0d0f] shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1"
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={option.value}
                  id={`${baseId}-row-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  // pointerdown, not click: the trigger's blur would otherwise
                  // close the list before a click ever landed.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    commit(index);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex items-center gap-2 px-4 py-3 cursor-pointer text-sm text-white transition-colors ${
                    index === activeIndex ? "bg-white/10" : ""
                  }`}
                >
                  {isSelected ? (
                    <Check size={16} className="shrink-0 text-accent-orange" />
                  ) : (
                    <span
                      className="shrink-0 text-white/30 flex w-4 h-4 items-center justify-center"
                      aria-hidden="true"
                    >
                      {option.icon}
                    </span>
                  )}
                  <span className="truncate">{option.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <FieldError id={errorId} message={error} />

      {hint && (
        <p id={hintId} className="text-xs text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}
