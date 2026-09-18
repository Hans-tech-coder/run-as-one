"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MoreVertical, Users, Trophy, Edit, Trash2, CalendarClock, PauseCircle, PlayCircle } from 'lucide-react';
import LinkPending from '@/components/ui/LinkPending';
import { placeRowMenu, type RowMenuPlacement } from '../row-menu-position';
import { cssDurationMs } from '@/lib/css-duration';

export default function EventActionsMenu({
  eventId,
  label,
  registrationState = 'OPEN',
  isPausing = false,
  canEdit = true,
  onTogglePause,
  onSchedule,
  onDelete
}: {
  eventId: string;
  /** The event's title, so a screen reader hears whose menu this is. */
  label?: string;
  /** Why sign-ups are closed, or OPEN — see src/lib/registration-gate.ts. */
  registrationState?: 'OPEN' | 'FINISHED' | 'PAUSED' | 'SCHEDULED' | 'FULL';
  /** True while this row's pause request is in flight. */
  isPausing?: boolean;
  /**
   * Whether this person's role on the event includes `event:edit`. Without it
   * Edit Event is not offered. Pause, Schedule and Delete are withheld the
   * other way — by not passing their handler — so the table decides each from
   * the same `can()` its route asks.
   */
  canEdit?: boolean;
  onTogglePause?: () => void;
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


  const isPaused = registrationState === 'PAUSED';
  // A race that has been run cannot be paused — it is already closed, and
  // offering a hold on it would suggest sign-ups could come back.
  const canPause = registrationState !== 'FINISHED' && Boolean(onTogglePause);

  // A race that has been run has no opening left to schedule either — the same
  // line the pause item is drawn on, for the same reason.
  const canSchedule = registrationState !== 'FINISHED' && Boolean(onSchedule);

  const handleTogglePause = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    onTogglePause?.();
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

  /* The three destinations, built from one shape so the pending treatment
     cannot end up on two of them and not the third. */
  const destinations = [
    { href: `/admin/events/${eventId}/registrants`, icon: <Users size={16} />, label: 'Registrants' },
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
