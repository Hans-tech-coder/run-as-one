"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import FieldError from "@/components/ui/FieldError";

/**
 * A short, closed list of answers on an admin screen, drawn by us rather than
 * by the browser.
 *
 * The runner's wizard already refused the native `<select>` for the reason set
 * out in events/[slug]/register/SelectField.tsx: Chrome and Windows paint the
 * open list themselves, in system blue and grey, so a field styled to match
 * everything around it opens a menu that matches nothing. The admin had no
 * equivalent, which is why its own forms still open that grey menu — this is
 * the control they should each be moved onto as they are next touched.
 *
 * It is a sibling of the wizard's `SelectField` rather than a shared component
 * because the two live in different design systems: this one wears the admin's
 * `.form-label` / `.form-input`, that one the wizard's `.input-group`. The
 * interaction is deliberately identical — focus stays on the trigger and the
 * highlighted row is announced through aria-activedescendant, which is what
 * makes the arrow keys, Enter and Escape behave the way a real select does.
 */

export interface AdminSelectOption {
  value: string;
  label: string;
  /** Small print under the label, for a choice that needs a sentence. */
  hint?: string;
}

export default function AdminSelect({
  label,
  value,
  options,
  placeholder = "Select",
  listboxLabel,
  onChange,
  id,
  error,
  hint,
}: {
  label: string;
  value: string;
  options: readonly AdminSelectOption[];
  placeholder?: string;
  listboxLabel: string;
  onChange: (next: string) => void;
  id?: string;
  error?: string;
  hint?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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

  // Keep the highlighted row inside the scroll box — an organizer's event list
  // is the case this exists for, and it grows every season.
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
        // This sits inside a modal that closes on Escape as well; dismissing
        // the list must not also throw away the form behind it.
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
    <div className="form-group">
      <label className="form-label" htmlFor={triggerId}>
        {label}
      </label>

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
            isOpen && activeIndex >= 0 ? `${baseId}-row-${activeIndex}` : undefined
          }
          onClick={() => (isOpen ? close() : open(0))}
          onKeyDown={handleKeyDown}
          className="form-input flex items-center gap-2 text-left"
        >
          <span
            className={`flex-1 min-w-0 truncate ${selected ? "" : "text-white/30"}`}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-white/50 transition-transform duration-200 ${
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
            className="absolute z-50 left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-[12px] border border-white/15 bg-[#0d0d0f] shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1"
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
                  className={`flex items-start gap-2 px-4 py-3 cursor-pointer text-sm text-white transition-colors ${
                    index === activeIndex ? "bg-white/10" : ""
                  }`}
                >
                  <span className="shrink-0 w-4 flex justify-center pt-0.5">
                    {isSelected && (
                      <Check size={16} className="text-accent-orange" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block text-xs text-secondary mt-0.5">
                        {option.hint}
                      </span>
                    )}
                  </span>
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
