"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import {
  allCountries,
  countryFor,
  flagUrl,
  maxNationalDigits,
  normalizeNational,
  parseE164,
  toE164,
  type Country,
} from "@/lib/phone";

/**
 * A country's flag as an image, falling back to the emoji if the CDN cannot be
 * reached. The emoji is itself only letters on Windows, which is exactly why
 * the image is the first choice rather than the only one.
 */
function Flag({ country }: { country: Country }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span aria-hidden="true" className="text-base leading-none">
        {country.flag}
      </span>
    );
  }

  return (
    <img
      src={flagUrl(country.iso2, 20)}
      srcSet={`${flagUrl(country.iso2, 20)} 1x, ${flagUrl(country.iso2, 40)} 2x`}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
      // contain, not cover: flags run anywhere from 2:1 to 1:2, and cropping
      // one to fill a fixed box cuts the stripes off the tall ones. The fixed
      // box keeps every row's text on the same line regardless.
      className="w-5 h-[15px] object-contain rounded-[2px] shrink-0"
    />
  );
}

/**
 * A phone number, split into the country that owns the code and the digits the
 * runner actually has to type.
 *
 * The country sits in the field rather than in the number, so a Filipino runner
 * types 9171234567 and not +639171234567, and nobody has to guess whether the
 * form wants a leading zero. What leaves the component is always E.164 — see
 * lib/phone for why that is what gets stored.
 *
 * The keyboard is numeric on phones and only digits survive the input, because
 * the one thing worse than a mistyped number here is a number that looks fine
 * and cannot be dialled on race morning.
 */
export default function PhoneField({
  label,
  value,
  defaultCountry,
  onChange,
  placeholder = "9171234567",
  id,
  error,
}: {
  label: string;
  /** E.164, or a legacy local number from before this field existed. */
  value: string;
  /** Where the runner appears to be, from the request. */
  defaultCountry: string;
  onChange: (e164: string) => void;
  placeholder?: string;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  /** What is wrong with this number, or nothing when it is fine. */
  error?: string;
}) {
  const parsed = useMemo(() => parseE164(value), [value]);
  // The country is local: an empty number carries no country of its own, and
  // the runner's pick has to survive them clearing the digits.
  const [iso2, setIso2] = useState(parsed.iso2 ?? defaultCountry);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const inputId = id ?? `${baseId}-national`;
  const listboxId = `${baseId}-countries`;
  const errorId = `${inputId}-error`;

  // A number pasted or restored with its own country wins over the local pick.
  useEffect(() => {
    if (parsed.iso2 && parsed.iso2 !== iso2) setIso2(parsed.iso2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.iso2]);

  const country = countryFor(iso2);
  const national = parsed.national;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const countries = allCountries();
    if (!needle) return countries;
    const digits = needle.replace(/\D/g, "");
    return countries.filter(
      c =>
        c.name.toLowerCase().includes(needle) ||
        c.iso2.toLowerCase().startsWith(needle) ||
        (digits && c.dial.startsWith(digits))
    );
  }, [query]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const pick = (next: Country) => {
    setIso2(next.iso2);
    // Re-key the same digits onto the new country so switching does not wipe
    // what has already been typed.
    onChange(toE164(next.iso2, national));
    close();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  // Opening puts the caret straight in the search box — 240 countries is a lot
  // to arrow through.
  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(prev => {
        if (prev < 0) return step === 1 ? 0 : matches.length - 1;
        return (prev + step + matches.length) % matches.length;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = activeIndex >= 0 ? matches[activeIndex] : matches[0];
      if (chosen) pick(chosen);
      return;
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const handleNationalChange = (raw: string) => {
    // Normalize before capping, not after. A Filipino runner pasting the number
    // as it is written locally — 09171234567 — hands over eleven digits, and
    // trimming to the ten a Philippine number has before the trunk zero comes
    // off spends the cap on that zero and loses a real digit off the end.
    const digits = normalizeNational(country.iso2, raw).slice(
      0,
      maxNationalDigits(country.iso2)
    );
    onChange(toE164(country.iso2, digits));
  };

  // Shown rather than stored: the trunk prefix comes off on the way to E.164,
  // so echo back what the value actually holds.
  const shown = normalizeNational(country.iso2, national);

  return (
    <div className="input-group">
      <label htmlFor={inputId}>{label}</label>

      <div ref={wrapperRef} className="relative">
        <div
          className="control-shell flex items-stretch rounded-[8px] border border-white/10 bg-black/30 focus-within:border-accent-blue focus-within:shadow-[0_0_0_3px_rgba(43,192,255,0.2)] transition-all"
          aria-invalid={error ? true : undefined}
        >
          <button
            type="button"
            onClick={() => (isOpen ? close() : setIsOpen(true))}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label={`Country code: ${country.name} +${country.dial}`}
            className="flex items-center gap-1.5 pl-3 pr-2 shrink-0 text-white hover:bg-white/5 rounded-l-[8px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            <Flag country={country} />
            <span className="text-sm font-medium">+{country.dial}</span>
            <ChevronDown size={14} className="text-secondary" aria-hidden="true" />
          </button>

          <input
            id={inputId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={shown}
            onChange={e => handleNationalChange(e.target.value)}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="flex-1 min-w-0 text-white placeholder-gray-500 focus:outline-none"
            // Inline rather than utility classes on purpose. RegistrationWizard
            // .css styles `.input-group input` at specificity (0,1,1), which
            // beats any single Tailwind class, so bg-transparent and border-0
            // lost and the input kept drawing its own rounded, bordered box
            // inside the field. The wrapper is the control; this is not.
            style={{
              background: "transparent",
              border: 0,
              borderRadius: 0,
              padding: "12px",
              minHeight: "48px",
            }}
          />
        </div>

        {isOpen && (
          <div className="absolute z-30 left-0 right-0 mt-2 rounded-[12px] border border-white/15 bg-[#0d0d0f] shadow-[0_16px_40px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
              <Search size={14} className="text-secondary shrink-0" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search country or code"
                aria-label="Search country"
                aria-controls={listboxId}
                className="flex-1 min-w-0 bg-transparent border-0 text-sm text-white placeholder-gray-500 focus:outline-none py-1"
              />
            </div>

            {matches.length === 0 ? (
              <p className="text-secondary text-sm px-4 py-4 m-0">
                No country matches that.
              </p>
            ) : (
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label="Countries"
                className="max-h-64 overflow-y-auto py-1"
              >
                {matches.map((c, index) => {
                  const isSelected = c.iso2 === country.iso2;
                  return (
                    <li
                      key={c.iso2}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      onPointerDown={e => {
                        e.preventDefault();
                        pick(c);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                        index === activeIndex ? "bg-white/10" : ""
                      }`}
                    >
                      <Flag country={c} />
                      <span className="text-white truncate flex-1">{c.name}</span>
                      <span className="text-secondary text-xs shrink-0">
                        {c.iso2} +{c.dial}
                      </span>
                      {isSelected && (
                        <Check size={14} className="text-accent-orange shrink-0" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <FieldError id={errorId} message={error} />
    </div>
  );
}
