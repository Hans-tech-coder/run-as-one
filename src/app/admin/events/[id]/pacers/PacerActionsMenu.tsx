"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  BadgeDollarSign,
  Check,
  Copy,
  MailCheck,
  MailX,
  MoreVertical,
  PauseCircle,
  PencilLine,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import { placeRowMenu, type RowMenuPlacement } from '../../../row-menu-position';
import { cssDurationMs } from '@/lib/css-duration';

/**
 * The row menu on the Pacers table, and on the card each row becomes below
 * `lg`.
 *
 * A copy of `admin/marketing/PromoActionsMenu` — which is itself a copy of the
 * events table's — because the project's rule is that a new control copies an
 * existing one. The portal, the fixed positioning from `placeRowMenu` and the
 * closing animation are all unchanged: a dropdown rendered inside a table cell
 * is clipped by the table's own `overflow-x: auto`, which is why it lives on
 * `document.body`.
 *
 * **Every item says what it does** — an icon and a word, never a bare glyph —
 * and the destructive one is below a divider, as it is on every other row menu
 * in the dashboard.
 */
export default function PacerActionsMenu({
  label,
  isPaused,
  isCodeSent,
  isRegistered,
  isFeeWaived,
  isBusy = false,
  copied = false,
  onCopyCode,
  onToggleCodeSent,
  onRename,
  onTogglePause,
  onToggleFeeWaiver,
  onDelete,
}: {
  /** Who this row is, for a screen reader on the trigger. */
  label: string;
  /** Whether staff have switched this code off. */
  isPaused: boolean;
  /** Whether staff have marked the code as sent. */
  isCodeSent: boolean;
  /**
   * Whether the pacer has already registered with the code. Delete is not
   * offered then — the route refuses it too, since removing it would leave a
   * runner in the race whose free entry nothing can account for.
   */
  isRegistered: boolean;
  /** Whether Run As One's admin fee is currently waived for this pacer. */
  isFeeWaived: boolean;
  /** True while one of this row's requests is in flight. */
  isBusy?: boolean;
  /** True for a moment after the code went to the clipboard. */
  copied?: boolean;
  onCopyCode: () => void;
  onToggleCodeSent: () => void;
  onRename: () => void;
  onTogglePause: () => void;
  /**
   * Turning Run As One's admin fee waiver on or off. **Undefined for anyone but
   * the Super Admin**, which is how the item is withheld — the same way the
   * events table withholds Delete: by not passing its handler, so the screen and
   * the route decide it from one `can()`.
   */
  onToggleFeeWaiver?: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<RowMenuPlacement>({ top: 0, left: 0, origin: 'top-right' });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

    el.classList.remove('is-open');
    el.classList.add('is-closing');

    setTimeout(() => setIsOpen(false), closeMs);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

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

    // Escape hands focus back to the trigger, so a keyboard user is left where
    // they started rather than on the page's first element.
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
        buttonRef.current?.focus();
      }
    }

    function handleScrollOrResize() {
      updatePosition();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition, closeMenu]);

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

  const toggleMenu = () => (isOpen ? closeMenu() : openMenu());

  const busyClass = isBusy ? 'opacity-50 cursor-not-allowed' : '';

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className="action-dropdown-menu t-dropdown"
      data-origin={position.origin}
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
        {/* First, because it is what staff open this menu for: the code has to
            leave the screen and reach the pacer by hand. */}
        <button
          onClick={() => {
            closeMenu();
            onCopyCode();
          }}
          className="action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
        {/* Straight after it, and deliberately a separate act. Copying is not
            sending: a mark set by the copy button would hide exactly the pacer
            this reminder exists for — one whose code was copied and never
            passed on. */}
        <button
          onClick={() => {
            closeMenu();
            onToggleCodeSent();
          }}
          disabled={isBusy}
          className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${busyClass}`}
          role="menuitem"
        >
          {isCodeSent ? <MailX size={16} /> : <MailCheck size={16} />}
          {isCodeSent ? 'Mark as not sent' : 'Mark as sent'}
        </button>
        <button
          onClick={() => {
            closeMenu();
            onRename();
          }}
          className="action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          <PencilLine size={16} />
          Rename
        </button>
        {/* The reversible answer to "stop this", between the edits and the
            deletion — and the only answer once a pacer has registered. */}
        <button
          onClick={() => {
            closeMenu();
            onTogglePause();
          }}
          disabled={isBusy}
          className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${busyClass}`}
          role="menuitem"
        >
          {isPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        {/* Last of the reversible items, and only for the Super Admin: this is
            the one thing in this menu that is about Run As One's own money
            rather than the organizer's entry. */}
        {onToggleFeeWaiver && (
          <button
            onClick={() => {
              closeMenu();
              onToggleFeeWaiver();
            }}
            disabled={isBusy}
            className={`action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${busyClass}`}
            role="menuitem"
          >
            <BadgeDollarSign size={16} />
            {isFeeWaived ? 'Charge admin fee' : 'Waive admin fee'}
          </button>
        )}
        {!isRegistered && (
          <>
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
        aria-label={`Actions for ${label}`}
      >
        <MoreVertical size={20} />
      </button>

      {/* No "mounted" flag: the menu opens only on a click, which never happens
          during server rendering, so isOpen alone guarantees `document` is
          there for the portal (as in PromoActionsMenu). */}
      {isOpen && createPortal(dropdownContent, document.body)}
    </>
  );
}
