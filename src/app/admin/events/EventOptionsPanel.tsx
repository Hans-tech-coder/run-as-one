"use client";

import React from 'react';
import { HeartHandshake, Lock, Plus, Timer, Trash2 } from 'lucide-react';
import PosterField from './PosterField';
import InclusionsField from './InclusionsField';
import { blankCategory, type CategoryDraft } from './category-draft';
import { EVENT_TYPES, type EventType } from '@/lib/event-type';

/**
 * What an event sells, and the rows that make it up.
 *
 * Replaces the separate CategoriesPanel and PackagesPanel, and with them the
 * two nearly identical create pages they forced. Distances and packages were
 * never different enough to justify that: both are rows in the same Category
 * table, differing only by whether a distance is asked for and what the labels
 * call things. Keeping them apart meant every new event-wide field — the admin
 * fee, the shirt surcharge, the waiver, the bank accounts — had to be added in
 * three places and stay in step.
 *
 * The type can be switched freely while an event has no registrants. Once
 * someone has paid it locks, because a 10K entry that silently becomes a
 * package changes what an existing runner already bought.
 */

const TYPE_OPTIONS: {
  value: EventType;
  icon: typeof Timer;
  title: string;
  description: string;
}[] = [
  {
    value: EVENT_TYPES.RACE,
    icon: Timer,
    title: 'Distance Categories',
    description:
      'Runners pick a distance — 5K, 10K, 21K. Results and certificates are grouped by it.',
  },
  {
    value: EVENT_TYPES.FUN_RUN,
    icon: HeartHandshake,
    title: 'Registration Packages',
    description:
      'No distances. Runners pick a package instead — Basic, Full — each with its own price and inclusions.',
  },
];

/** The words that change with the type. Everything else about a row is shared. */
function wording(eventType: EventType) {
  const packages = eventType === EVENT_TYPES.FUN_RUN;
  return {
    panelTitle: packages ? 'Registration Packages' : 'Distance Categories',
    rowLabel: packages ? 'Package' : 'Category',
    nameLabel: packages ? 'Package Name' : 'Category Name',
    namePlaceholder: packages ? 'e.g. Basic Package' : 'e.g. Full Marathon',
    addLabel: packages ? 'Add Another Package' : 'Add Another Category',
    inclusionsPlaceholder: packages
      ? 'Registration Band\nRaffle Entry\nSnacks\nEvent Entitlement'
      : 'Race Singlet\nFinisher Medal\nRace Bib with Timing Chip\nSponsor Lootbag',
    showDistance: !packages,
  };
}

export default function EventOptionsPanel({
  eventType,
  onEventTypeChange,
  lockedReason,
  options,
  onChange,
  onError,
  onBusyChange,
}: {
  eventType: EventType;
  onEventTypeChange: (next: EventType) => void;
  /**
   * Why the type cannot be changed, or null when it can. Shown to the
   * organizer rather than just disabling the control silently.
   */
  lockedReason?: string | null;
  options: CategoryDraft[];
  onChange: (next: CategoryDraft[]) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const words = wording(eventType);
  const locked = Boolean(lockedReason);

  const update = (index: number, field: keyof CategoryDraft, value: string | number) => {
    const next = [...options];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const remove = (index: number) => {
    // An event with nothing to sell has no registration, so the last row stays.
    if (options.length <= 1) return;
    const next = [...options];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">{words.panelTitle}</h2>
      </div>
      <div className="admin-panel-content">
        <div className="form-group form-group-full mb-6">
          <label className="form-label">
            What do runners choose between?
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            {TYPE_OPTIONS.map(option => {
              const Icon = option.icon;
              const isSelected = eventType === option.value;
              return (
                <label
                  key={option.value}
                  className={`relative flex flex-col gap-3 rounded-xl border p-5 transition-colors ${
                    locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'border-accent-blue bg-accent-blue/10'
                      : `border-white/10 bg-white/[0.02] ${locked ? '' : 'hover:border-white/20'}`
                  }`}
                >
                  <input
                    type="radio"
                    name="eventOptionType"
                    value={option.value}
                    checked={isSelected}
                    disabled={locked}
                    onChange={() => onEventTypeChange(option.value)}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-lg p-2 ${
                        isSelected ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-gray-400'
                      }`}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="font-medium text-primary">{option.title}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-secondary">{option.description}</p>
                </label>
              );
            })}
          </div>
          {lockedReason && (
            <p className="flex items-start gap-2 text-xs opacity-70 mt-3 m-0">
              <Lock size={14} className="shrink-0 mt-0.5" />
              {lockedReason}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {options.map((row, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-secondary uppercase tracking-wider">
                  {words.rowLabel} {idx + 1}
                </span>
                {options.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="btn-remove"
                    title={`Remove ${words.rowLabel}`}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{words.nameLabel}</label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={e => update(idx, 'name', e.target.value)}
                    className="form-input"
                    placeholder={words.namePlaceholder}
                    required
                  />
                </div>

                {/* A package has no distance to run. The value stays in the
                    draft while hidden so switching back does not lose it; the
                    API stores '' for a package either way. */}
                {words.showDistance && (
                  <div className="form-group">
                    <label className="form-label">Distance</label>
                    <input
                      type="text"
                      value={row.distance}
                      onChange={e => update(idx, 'distance', e.target.value)}
                      className="form-input"
                      placeholder="e.g. 42K"
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Price (₱)</label>
                  <input
                    type="number"
                    value={row.price}
                    onChange={e => update(idx, 'price', Number(e.target.value))}
                    className="form-input"
                    required
                    min={0}
                  />
                </div>

                <InclusionsField
                  value={row.inclusions || ''}
                  onChange={text => update(idx, 'inclusions', text)}
                  placeholder={words.inclusionsPlaceholder}
                />

                <PosterField
                  value={row.imageUrl || ''}
                  onChange={url => update(idx, 'imageUrl', url)}
                  onError={onError}
                  onBusyChange={onBusyChange}
                  alt={`${row.name || words.rowLabel} Preview`}
                />
              </div>
            </div>
          ))}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onChange([...options, blankCategory()])}
              className="btn-add"
            >
              <Plus size={16} /> {words.addLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
