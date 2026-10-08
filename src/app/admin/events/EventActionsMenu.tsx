"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MoreVertical, Users, ClipboardList, Trophy, Edit, Trash2, CalendarClock, PauseCircle, PlayCircle, Footprints, Lock, LockOpen } from 'lucide-react';
import LinkPending from '@/components/ui/LinkPending';
import { placeRowMenu, type RowMenuPlacement } from '../row-menu-position';
import { cssDurationMs } from '@/lib/css-duration';
import { pacerMenuLabel } from '@/lib/pacer';
import type { RegistrationState } from '@/lib/registration-gate';

export default function EventActionsMenu({
  eventId,
  label,
  registrationState = 'OPEN',
  isPausing = false,
  canEdit = true,
  canManagePacers = false,
  pacersNotSent = 0,
  onTogglePause,
  onToggleClose,
  onSchedule,
  onDelete
}: {
  eventId: string;
  /** The event's title, so a screen reader hears whose menu this is. */
  label?: string;
  /** Why sign-ups are closed, or OPEN — see src/lib/registration-gate.ts. */
  registrationState?: RegistrationState;
  /** True while this row's pause or close request is in flight. */
  isPausing?: boolean;
  /**
   * Whether this person's role on the event includes `event:edit`. Without it
   * Edit Event is not offered. Pause, Schedule and Delete are withheld the
   * other way — by not passing their handler — so the table decides each from
   * the same `can()` its route asks.
   */
  canEdit?: boolean;
  /**
   * Whether this person's role includes `promo:manage` — the verb the Pacers
   * screen and its routes ask. Without it the item is not offered, the same way
   * Edit Event is withheld.
   */
  canManagePacers?: boolean;
  /**
   * How many of this race's pacers have not been sent their code yet
   * (`needsCodeSent` in lib/pacer.ts). It is on the menu item because the app
   * emails no pacer: a forgotten one is otherwise invisible until somebody
   * thinks to open the screen.
   */
  pacersNotSent?: number;
  onTogglePause?: () => void;
  /** Closes sign-ups for good, or reopens a closed event. */
  onToggleClose?: () => void;
  /** Opens the modal that decides when sign-ups start. */
  onSchedule?: () => void;
  onDelete?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<RowMenuPlacement>({ top: 0, left: 0, origin: 'top-right' });
  // Which destination the organizer has asked for, once they have asked for
  // one. Every item in this menu except Pause and Delete leads to a page that
  // is a database read behind an auth cookie, and the old menu closed the
  // instant it was clicked — so a slow one left the events table sitting
  // there unchanged, which reads as a button that did nothing. The menu now
  // stays open on the answer it is waiting for.
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Kept inside the screen and flipped above the trigger when there is no
  // room below it — a card near the foot of a phone screen (row-menu-position).
  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      setPosition(
        placeRowMenu(buttonRef.current.getBoundingClientRect(), dropdownRef.current?.offsetHeight ?? 0),
      );
    }
  }, []);

  // The first placement runs before the menu exists and cannot know its
  // height; this one runs once it does, before the frame is painted.
  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen, updatePosition]);

  const closeMenu = useCallback(() => {
    if (!dropdownRef.current) {
      setIsOpen(false);
      return;
    }
    const el = dropdownRef.current;

    const closeMs = cssDurationMs('--dropdown-close-dur', 150);

    el.classList.remove("is-open");
    el.classList.add("is-closing");

    setTimeout(() => {
      setIsOpen(false);
    }, closeMs);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // A navigation already in flight owns the menu until the page arrives:
      // closing it here would take away the only thing on screen saying the
      // click was heard.
      if (navigatingTo) return;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    }

    function handleScrollOrResize() {
      if (isOpen) {
        updatePosition();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition, navigatingTo, closeMenu]);

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  const openMenu = () => {
    updatePosition();
    setIsOpen(true);
    requestAnimationFrame(() => {
      if (dropdownRef.current) {
        dropdownRef.current.classList.remove("is-closing");
        dropdownRef.current.classList.add("is-open");
      }
    });
  };


  // A results-only event takes no sign-ups here (RESULTS_ONLY_EVENT_PLAN.md
  // Batch 4): it has no registrants, race report or pacers to open, and no
  // sign-ups to schedule, pause or close. What is left is what it is for —
  // its results — plus Edit and Delete.
  const isExternal = registrationState === 'EXTERNAL';

  const isPaused = registrationState === 'PAUSED';
  // A race that has been run cannot be paused — it is already closed, and
  // offering a hold on it would suggest sign-ups could come back.
  // A closed race offers neither a hold nor a schedule: both would read as
  // ways back in, and the only way back from a closure is Reopen.
  const isClosed = registrationState === 'CLOSED';
  const canPause = registrationState !== 'FINISHED' && !isClosed && !isExternal && Boolean(onTogglePause);

  // A race that has been run has no opening left to schedule either — the same
  // line the pause item is drawn on, for the same reason.
  const canSchedule = registrationState !== 'FINISHED' && !isClosed && !isExternal && Boolean(onSchedule);

  // Closing is the same line again: a race that has been run is already over.
  const canClose = registrationState !== 'FINISHED' && !isExternal && Boolean(onToggleClose);

  const handleTogglePause = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    onTogglePause?.();
  };

  const handleToggleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    onToggleClose?.();
  };

  const handleSchedule = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    onSchedule?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    if (onDelete) {
      onDelete();
    }
  };

  /* The destinations, built from one shape so the pending treatment cannot end
     up on some of them and not the rest. */
  const destinations = [
    ...(isExternal
      ? []
      : [
          { href: `/admin/events/${eventId}/registrants`, icon: <Users size={16} />, label: 'Registrants' },
          // The client's race page, which staff read too: the counts, shirt pieces
          // to order and kit split, and the PDF that goes to the shirt supplier.
          { href: `/admin/your-events/${eventId}`, icon: <ClipboardList size={16} />, label: 'Race Report' },
        ]),
    // Under Registrants, because a pacer is a registrant the organizer invited,
    // and above Results, which only matter once the race has been run. The
    // count rides in the label rather than in a badge of its own, so the item
    // reads as one sentence: "Pacers · 3 not sent".
    ...(canManagePacers && !isExternal
      ? [
          {
            href: `/admin/events/${eventId}/pacers`,
            icon: <Footprints size={16} />,
            label: pacerMenuLabel(pacersNotSent),
          },
        ]
      : []),
    { href: `/admin/events/${eventId}/results`, icon: <Trophy size={16} />, label: 'Manage Results' },
    ...(canEdit
      ? [{ href: `/admin/events/${eventId}/edit`, icon: <Edit size={16} />, label: 'Edit Event' }]
      : []),
  ];

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={`action-dropdown-menu t-dropdown ${navigatingTo ? 'is-navigating' : ''}`}
      data-origin={position.origin}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        right: 'auto',
        marginTop: 0,
        zIndex: 9999
      }}
    >
      <div className="py-1 flex flex-col" role="menu" aria-orientation="vertical">
        {destinations.map((destination) => (
          <Link
            key={destination.href}
            href={destination.href}
            className={`action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm ${
              navigatingTo === destination.href ? 'is-navigating' : ''
            }`}
            role="menuitem"
            onClick={() => setNavigatingTo(destination.href)}
          >
            {destination.icon}
            {destination.label}
            {/* Reads the pending state of the Link above it, so only the item
                actually clicked shows the running figure. */}
            <LinkPending />
          </Link>
        ))}
        {canSchedule && (
          <button
            onClick={handleSchedule}
            className="action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
            role="menuitem"
          >
            <CalendarClock size={16} />
            {/* One label for both answers the modal offers. Naming only one of
                them — "Open Sign-Ups" — would hide the other behind an item
                nobody with an already-open race would think to press. */}
            Schedule Sign-Ups
          </button>
        )}
        {canPause && (
          <button
            onClick={handleTogglePause}
            disabled={isPausing}
            className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${isPausing ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="menuitem"
          >
            {isPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
            {/* "Sign-Ups" rather than "Registration": the shorter word is
                what the rest of the dashboard calls this, and it keeps the
                three states of this one item the same length. */}
            {isPausing
              ? 'Saving'
              : isPaused
                ? 'Resume Sign-Ups'
                : 'Pause Sign-Ups'}
          </button>
        )}
        {canClose && (
          <button
            onClick={handleToggleClose}
            disabled={isPausing}
            className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${isPausing ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="menuitem"
          >
            {isClosed ? <LockOpen size={16} /> : <Lock size={16} />}
            {isPausing ? 'Saving' : isClosed ? 'Reopen Sign-Ups' : 'Close Sign-Ups'}
          </button>
        )}
        {onDelete && (
          <>
            <div className="action-dropdown-divider"></div>
            <button
              onClick={handleDelete}
              className={`action-dropdown-item danger w-full flex items-center gap-3 px-4 py-2 text-sm text-left`}
              role="menuitem"
            >
              <Trash2 size={16} />
              Delete Event
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        className="action-dropdown-btn focus:outline-none"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={label ? `Actions for ${label}` : 'Event actions'}
      >
        <MoreVertical size={20} />
      </button>

      {/* No "mounted" flag: the menu opens only on a click, which never
          happens during server rendering, so isOpen alone guarantees
          `document` is there for the portal (as in TeamActionsMenu). */}
      {isOpen && createPortal(dropdownContent, document.body)}
    </>
  );
}
