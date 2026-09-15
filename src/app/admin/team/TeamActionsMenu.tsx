"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Send, Trash2, UserCheck, UserCog, UserX } from 'lucide-react';
import { placeRowMenu, type RowMenuPlacement } from '../row-menu-position';

/**
 * The row menu on the team table.
 *
 * A copy of `marketing/PromoActionsMenu`, which is itself a copy of
 * `events/EventActionsMenu`: the portal, the fixed positioning and the closing
 * animation are that machinery unchanged, because a dropdown inside a table
 * cell is clipped by the table's own overflow. The menu is 210px wide like its
 * siblings, and is placed by `row-menu-position`, which keeps it on a phone's
 * screen and flips it above a trigger near the bottom.
 *
 * What it offers depends on where the person is: an invitation can be resent
 * or revoked but not suspended, a member can be suspended or removed but has
 * no invitation left to resend.
 */
export default function TeamActionsMenu({
  label,
  accepted,
  suspended,
  busy = null,
  onEdit,
  onResend,
  onToggleSuspend,
  onRemove,
}: {
  /** Who this row is, for a screen reader. */
  label: string;
  /** Whether the person has accepted their invitation. */
  accepted: boolean;
  suspended: boolean;
  /** The word to show on the item whose request is in flight, if any. */
  busy?: 'resend' | 'suspend' | null;
  onEdit: () => void;
  onResend: () => void;
  onToggleSuspend: () => void;
  onRemove: () => void;
}) {
  // No "mounted" flag, unlike the menus it was copied from: the menu opens only
  // on a click, which never happens during server rendering, so `isOpen` alone
  // guarantees `document` is there for the portal.
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

  // Again once the menu exists and has a height, before it is painted.
  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen, updatePosition]);

  const closeMenu = useCallback(() => {
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
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
        buttonRef.current?.focus();
      }
    }
    function handleScrollOrResize() {
      if (isOpen) updatePosition();
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }
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

  const run = (action: () => void) => () => {
    closeMenu();
    action();
  };

  const itemClass = (disabled = false) =>
    `action-dropdown-item w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    }`;

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
        <button onClick={run(onEdit)} className={itemClass()} role="menuitem">
          <UserCog size={16} />
          Edit Access
        </button>

        {/* An invitation's own next step, where Suspend would otherwise sit:
            there is nobody signed in to suspend until it is accepted. */}
        {accepted ? (
          <button
            onClick={run(onToggleSuspend)}
            disabled={busy === 'suspend'}
            className={itemClass(busy === 'suspend')}
            role="menuitem"
          >
            {suspended ? <UserCheck size={16} /> : <UserX size={16} />}
            {busy === 'suspend' ? 'Saving' : suspended ? 'Reinstate' : 'Suspend'}
          </button>
        ) : (
          <button
            onClick={run(onResend)}
            disabled={busy === 'resend'}
            className={itemClass(busy === 'resend')}
            role="menuitem"
          >
            <Send size={16} />
            {busy === 'resend' ? 'Sending' : 'Resend Invitation'}
          </button>
        )}

        <div className="action-dropdown-divider"></div>
        <button
          onClick={run(onRemove)}
          className="action-dropdown-item danger w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
        >
          <Trash2 size={16} />
          {accepted ? 'Remove from Team' : 'Revoke Invitation'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className="action-dropdown-btn focus:outline-none"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Actions for ${label}`}
      >
        <MoreVertical size={20} />
      </button>

      {isOpen && createPortal(dropdownContent, document.body)}
    </>
  );
}
