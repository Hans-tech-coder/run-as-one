"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';

/**
 * Which organizer a staff member is working inside, and the way to move to
 * another — shown only to somebody who works for more than one
 * (lib/signed-in-user.ts).
 *
 * A session acts inside exactly one organizer, because `orgId` is what every
 * admin route scopes by; switching asks `api/auth/switch-organizer` for a new
 * session and then starts over on the dashboard, since the page on screen
 * belonged to the organizer being left.
 *
 * The menu is the row-menu machinery (`events/EventActionsMenu`): portalled to
 * `<body>` and fixed from the trigger's rectangle — here opening upward, since
 * the trigger sits at the foot of the sidebar, and the sidebar's
 * backdrop-filter would otherwise trap a fixed child inside it.
 */
export default function OrganizerSwitcher({
  organizers,
}: {
  organizers: { id: string; name: string; current: boolean }[];
}) {
  const router = useRouter();
  const { alert } = useAlert();
  // No separate "mounted" flag: the menu is only ever opened by a click, which
  // cannot happen during server rendering, so `isOpen` already guarantees
  // `document` exists when the portal is drawn.
  const [isOpen, setIsOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 0, bottom: 0, width: 0, maxHeight: 0 });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = organizers.find(organizer => organizer.current) ?? organizers[0];

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // On the collapsed rail the trigger is a 44–48px icon; the menu keeps a
    // width an organizer's name can be read in rather than inheriting that —
    // but never wider than the screen, and its right edge is kept on it too,
    // which is what a 56px phone rail with a 240px menu beside it needs.
    const edge = 8;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - edge * 2);
    const left = Math.min(Math.max(rect.left, edge), window.innerWidth - width - edge);
    // It opens upward from the foot of the sidebar, so the room it has is
    // everything above the trigger. A staff member with many organizers gets
    // a list that scrolls rather than one whose top is off the screen.
    const maxHeight = Math.max(rect.top - 8 - edge, 120);
    setPosition({ left, bottom: window.innerHeight - rect.top + 8, width, maxHeight });
  }, []);

  const close = useCallback(() => {
    const el = menuRef.current;
    if (!el) {
      setIsOpen(false);
      return;
    }
    const closeMs =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dropdown-close-dur')) || 150;
    el.classList.remove('is-open');
    el.classList.add('is-closing');
    setTimeout(() => setIsOpen(false), closeMs);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (switchingTo) return;
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !switchingTo) {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updatePosition);
    // The sidebar's menu scrolls on a short screen, carrying the trigger with it.
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, switchingTo, close, updatePosition]);

  const open = () => {
    updatePosition();
    setIsOpen(true);
    requestAnimationFrame(() => {
      menuRef.current?.classList.remove('is-closing');
      menuRef.current?.classList.add('is-open');
    });
  };

  const choose = async (organizerId: string) => {
    if (organizerId === current?.id) {
      close();
      return;
    }
    setSwitchingTo(organizerId);
    try {
      const res = await fetch('/api/auth/switch-organizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That organizer could not be opened.');
      // The menu stays open, with the choice marked, until the dashboard of the
      // organizer being entered replaces it — the same pending behaviour as a
      // row menu's destinations.
      router.push('/admin');
      router.refresh();
      setTimeout(() => {
        setSwitchingTo(null);
        close();
      }, 600);
    } catch (err) {
      setSwitchingTo(null);
      await alert(err instanceof Error ? err.message : 'That organizer could not be opened.');
    }
  };

  const menu = (
    <div
      ref={menuRef}
      className={`action-dropdown-menu t-dropdown ${switchingTo ? 'is-navigating' : ''}`}
      data-origin="bottom-left"
      role="menu"
      aria-label="Switch organizer"
      style={{
        position: 'fixed',
        left: `${position.left}px`,
        bottom: `${position.bottom}px`,
        top: 'auto',
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
        overflowY: 'auto',
        marginTop: 0,
        zIndex: 9999,
      }}
    >
      <div className="py-1 flex flex-col">
        {organizers.map(organizer => (
          <button
            key={organizer.id}
            type="button"
            role="menuitemradio"
            aria-checked={organizer.current}
            disabled={Boolean(switchingTo)}
            onClick={() => choose(organizer.id)}
            className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 max-lg:min-h-11 text-sm text-left ${
              switchingTo === organizer.id ? 'is-navigating' : ''
            }`}
          >
            <span className="w-4 shrink-0 flex justify-center">
              {organizer.current && <Check size={16} className="text-accent-orange" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{organizer.name}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="admin-org-switcher">
      <button
        ref={buttonRef}
        type="button"
        className="org-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
      >
        <Building2 size={18} className="shrink-0 text-secondary" aria-hidden="true" />
        <span className="org-switcher-text min-w-0 flex-1">
          <span className="org-switcher-label">Organizer</span>
          <span className="org-switcher-name">{current?.name}</span>
        </span>
        <ChevronsUpDown size={16} className="org-switcher-chevron shrink-0 text-secondary" aria-hidden="true" />
      </button>

      {isOpen && createPortal(menu, document.body)}
    </div>
  );
}
