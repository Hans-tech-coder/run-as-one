"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MoreVertical, Users, Trophy, Edit, Trash2, PauseCircle, PlayCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import LinkPending from '@/components/ui/LinkPending';

export default function EventActionsMenu({
  eventId,
  registrationState = 'OPEN',
  isPausing = false,
  onTogglePause,
  onDelete
}: {
  eventId: string;
  /** Why sign-ups are closed, or OPEN — see src/lib/registration-gate.ts. */
  registrationState?: 'OPEN' | 'FINISHED' | 'PAUSED' | 'FULL';
  /** True while this row's pause request is in flight. */
  isPausing?: boolean;
  onTogglePause?: () => void;
  onDelete?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  // Which destination the organizer has asked for, once they have asked for
  // one. Every item in this menu except Pause and Delete leads to a page that
  // is a database read behind an auth cookie, and the old menu closed the
  // instant it was clicked — so a slow one left the events table sitting
  // there unchanged, which reads as a button that did nothing. The menu now
  // stays open on the answer it is waiting for.
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8, // Fixed position relative to viewport
        left: rect.right - 180, // 180px is width of action-dropdown-menu
      });
    }
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
  }, [isOpen, updatePosition, navigatingTo]);

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

  const closeMenu = () => {
    if (!dropdownRef.current) {
      setIsOpen(false);
      return;
    }
    const el = dropdownRef.current;
    
    const closeMs = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur")
    ) || 150;
    
    el.classList.remove("is-open");
    el.classList.add("is-closing");
    
    setTimeout(() => {
      setIsOpen(false);
    }, closeMs);
  };

  const isPaused = registrationState === 'PAUSED';
  // A race that has been run cannot be paused — it is already closed, and
  // offering a hold on it would suggest sign-ups could come back.
  const canPause = registrationState !== 'FINISHED' && Boolean(onTogglePause);

  const handleTogglePause = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    onTogglePause?.();
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
    { href: `/admin/events/${eventId}/edit`, icon: <Edit size={16} />, label: 'Edit Event' },
  ];

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className={`action-dropdown-menu t-dropdown ${navigatingTo ? 'is-navigating' : ''}`}
      data-origin="top-right"
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
                actually clicked shows the dots. */}
            <LinkPending />
          </Link>
        ))}
        {canPause && (
          <button
            onClick={handleTogglePause}
            disabled={isPausing}
            className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${isPausing ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="menuitem"
          >
            {isPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
            {/* "Sign-Ups" rather than "Registration": the menu is 175px
                wide, and the longer word wrapped every one of these onto two
                lines while every other item sat on one. */}
            {isPausing
              ? 'Saving'
              : isPaused
                ? 'Resume Sign-Ups'
                : 'Pause Sign-Ups'}
          </button>
        )}
        <div className="action-dropdown-divider"></div>
        <button
          onClick={handleDelete}
          className={`action-dropdown-item danger w-full flex items-center gap-3 px-4 py-2 text-sm text-left`}
          role="menuitem"
        >
          <Trash2 size={16} />
          Delete Event
        </button>
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
      >
        <MoreVertical size={20} />
      </button>

      {mounted && isOpen && createPortal(dropdownContent, document.body)}
    </>
  );
}
