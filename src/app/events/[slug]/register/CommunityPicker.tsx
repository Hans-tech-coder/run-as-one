"use client";

import React, { useMemo } from 'react';
import { Check, Plus, Users } from 'lucide-react';
import {
  communitySlug,
  normalizeCommunityName,
  MAX_COMMUNITY_NAME_LENGTH,
} from '@/lib/running-community';
import Combobox, { type ComboboxRow } from './Combobox';

/**
 * The running club a runner represents, typed with suggestions.
 *
 * A plain <select> was the obvious choice and the wrong one: the list is over
 * fifty clubs today and only grows, which is a long scroll on a phone, and it
 * has no room for the club that is not on the list yet.
 *
 * Free text is deliberately allowed. The field is optional, the answer is the
 * runner's own, and holding up their registration over a club name nobody has
 * approved yet would be the wrong trade. What a write-in does not get is a
 * place in everyone else's suggestions: that waits for the super admin.
 *
 * Shared by both wizards, so a fun run and a race ask the question the same way.
 */
export default function CommunityPicker({
  value,
  options,
  onChange,
  onAdd,
}: {
  value: string;
  /** Approved club names, already sorted. */
  options: readonly string[];
  onChange: (name: string) => void;
  /**
   * A write-in the runner committed to with the "Add" row. The wizard holds
   * these so a second runner on the same registration can pick the club their
   * team-mate just added, without waiting for it to be approved.
   */
  onAdd: (name: string) => void;
}) {
  const trimmed = normalizeCommunityName(value);
  const slug = communitySlug(trimmed);

  // Only offer to add something the list does not already hold. An exact match
  // in any casing is the existing club, not a new one.
  const canAdd =
    trimmed.length > 0 && !options.some(name => communitySlug(name) === slug);

  const rows = useMemo<ComboboxRow[]>(() => {
    const needle = trimmed.toUpperCase();
    // Prefix matches first: someone typing "SAN" wants the two SAN clubs above
    // any club that merely contains those letters in the middle.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of options) {
      if (!needle) {
        starts.push(name);
        continue;
      }
      const haystack = name.toUpperCase();
      if (haystack.startsWith(needle)) starts.push(name);
      else if (haystack.includes(needle)) contains.push(name);
    }

    const matches: ComboboxRow[] = [...starts, ...contains].map(name => {
      const isSelected = communitySlug(name) === slug;
      return {
        key: `option-${name}`,
        value: name,
        selected: isSelected,
        label: (
          <>
            {isSelected ? (
              <Check size={16} className="shrink-0 text-accent-orange" />
            ) : (
              <Users size={16} className="shrink-0 text-white/30" />
            )}
            <span className="truncate">{name}</span>
          </>
        ),
      };
    });

    if (!canAdd) return matches;

    return [
      {
        key: `add-${trimmed}`,
        value: trimmed,
        emphasis: true,
        onSelect: () => onAdd(trimmed),
        label: (
          <>
            <Plus size={16} className="shrink-0" />
            <span className="truncate">Add &ldquo;{trimmed}&rdquo;</span>
          </>
        ),
      },
      ...matches,
    ];
  }, [options, trimmed, slug, canAdd, onAdd]);

  return (
    <Combobox
      label="Running Community / Club (Optional)"
      listboxLabel="Running communities"
      value={value}
      rows={rows}
      maxLength={MAX_COMMUNITY_NAME_LENGTH}
      placeholder="Type to search, or add your own"
      onChange={onChange}
      // Snap to the list's own casing when the runner typed a club that exists.
      // "team army" and "TEAM ARMY" must not read as two clubs in the export.
      onNormalize={typed => {
        const cleaned = normalizeCommunityName(typed);
        const exact = options.find(
          name => communitySlug(name) === communitySlug(cleaned)
        );
        return exact ?? cleaned;
      }}
      hint={
        canAdd
          ? 'Not on the list? Choose Add to register with it. It goes to the organizers for review before it shows up as a suggestion for anyone else.'
          : 'Leave blank if you run on your own.'
      }
    />
  );
}
