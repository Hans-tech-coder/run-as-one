"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, CopyPlus, Edit, PauseCircle, PlayCircle, Receipt, Trash2 } from 'lucide-react';

/**
 * The row menu on the marketing table.
 *
 * A copy of `admin/events/EventActionsMenu` rather than a new idea: the
 * project's rule is that a new control copies an existing one, and an
 * organizer who has learned that the three dots open a row's actions on the
 * events table should find the same thing here. The portal, the fixed
 * positioning and the closing animation are all that machinery, unchanged —
 * a dropdown rendered inside a table cell is clipped by the table's own
 * `overflow-x: auto`, which is the reason it lives on `document.body`.
 */
export default function PromoActionsMenu({
  label,
  isPaused,
  isTogglingPause = false,
  onViewRedemptions,
  onEdit,
  onDuplicate,
  onTogglePause,
  onDelete,
}: {
  /** What this row is, for the buttons and for a screen reader. */
  label: string;
  /** Whether the organizer has this promotion switched off. */
  isPaused: boolean;
  /** True while this row's pause request is in flight. */
  isTogglingPause?: boolean;
  onViewRedemptions: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.right - 210, // 210px is the width of action-dropdown-menu
      });
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
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
      if (isOpen) updatePosition();
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
  }, [isOpen, updatePosition]);

  const openMenu = () => {
    updatePosition();
    setIsOpen(true);
    requestAnimationFrame(() => {
      if (dropdownRef.current) {
        dropdownRef.current.classList.remove('is-closing');
        dropdownRef.current.classList.add('is-open');
      }
    });
  };

  const closeMenu = () => {
    if (!dropdownRef.current) {
      setIsOpen(false);
      return;
    }
    const el = dropdownRef.current;

    const closeMs =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--dropdown-close-dur')
      ) || 150;

    el.classList.remove('is-open');
    el.classList.add('is-closing');

    setTimeout(() => setIsOpen(false), closeMs);
  };

  const toggleMenu = () => (isOpen ? closeMenu() : openMenu());

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className="action-dropdown-menu t-dropdown"
      data-origin="top-right"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        right: 'auto',
        marginTop: 0,
        zIndex: 9999,
      }}
    >
      <div className="py-1 flex flex-col" role="menu" aria-orientation="vertical">
        {/* Above Edit on purpose: reading who used a promotion is what an
            organizer opens this menu for far more often than changing it, and
            the item that only looks at something should sit before the ones
            that alter it. */}
        <button
          onClick={() => {
            closeMenu();
            onViewRedemptions();
          }}
          className="action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          <Receipt size={16} />
          {/* One word, not "View Redemptions": the other items here are all
              single verbs, and the noun on its own already says what the panel
              it opens holds. */}
          Redemptions
        </button>
        <button
          onClick={() => {
            closeMenu();
            onEdit();
          }}
          className="action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          <Edit size={16} />
          Edit
        </button>
        {/* Straight after Edit, because it is the same form: an organizer
            who opened this menu to change a promotion and realised they
            wanted a second one alongside it should not have to close the
            menu and start from an empty modal. */}
        <button
          onClick={() => {
            closeMenu();
            onDuplicate();
          }}
          className="action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          <CopyPlus size={16} />
          Duplicate
        </button>
        {/* Between editing and deleting on purpose: it is the reversible
            answer to "stop this", and an organizer who reaches past Edit
            should meet it before they reach Delete. */}
        <button
          onClick={() => {
            closeMenu();
            onTogglePause();
          }}
          disabled={isTogglingPause}
          className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${
            isTogglingPause ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          role="menuitem"
        >
          {isPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
          {isTogglingPause ? 'Saving' : isPaused ? 'Resume' : 'Pause'}
        </button>
        <div className="action-dropdown-divider"></div>
        <button
          onClick={() => {
            closeMenu();
            onDelete();
          }}
          className="action-dropdown-item danger w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          <Trash2 size={16} />
          Delete
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
        aria-label={`Actions for ${label}`}
      >
        <MoreVertical size={20} />
      </button>

      {mounted && isOpen && createPortal(dropdownContent, document.body)}
    </>
  );
}
