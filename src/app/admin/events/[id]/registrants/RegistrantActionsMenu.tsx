"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, CheckCircle, Trash2, Edit, Eye } from 'lucide-react';
import { placeRowMenu, type RowMenuPlacement } from '../../../row-menu-position';

interface RegistrantActionsMenuProps {
  runnerId: string;
  registrationId: string;
  /** Who this row is, for a screen reader: "Actions for JUAN DELA CRUZ". */
  label: string;
  status: string;
  isBankTransfer: boolean;
  updatingId: string | null;
  handleStatusChange: (registrationId: string, status: string) => void;
  onView: (runnerId: string) => void;
  onEdit: (runnerId: string) => void;
  onDelete: (runnerId: string) => void;
  /**
   * What this person's role allows on this event, decided on the server. An
   * item the route would refuse is not offered: a validator who can settle an
   * order but not rewrite it sees no Edit, and only an owner or admin sees
   * Delete.
   */
  canEdit: boolean;
  canDelete: boolean;
  canValidate: boolean;
}

/**
 * The row menu on the registrants table and its cards.
 *
 * Portalled to `<body>` and fixed to its trigger like its siblings, because a
 * menu inside a table cell is clipped by the table. It is placed by
 * `row-menu-position` rather than at `rect.right - 210`: a card's trigger near
 * the left of a phone screen threw the menu off that edge, and the last card's
 * menu opened below the fold. Measured again once it has rendered, since its
 * height depends on the row (only a pending bank transfer offers Validate).
 */
export default function RegistrantActionsMenu({
  runnerId,
  registrationId,
  label,
  status,
  isBankTransfer,
  updatingId,
  handleStatusChange,
  onView,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  canValidate,
}: RegistrantActionsMenuProps) {
  // No "mounted" flag: the menu opens only on a click, which never happens
  // during server rendering, so `isOpen` alone guarantees `document` is there.
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

  const onStatusChange = (newStatus: string) => {
    handleStatusChange(registrationId, newStatus);
    closeMenu();
  };

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
        zIndex: 9999
      }}
    >
      <div className="py-1 flex flex-col" role="menu" aria-orientation="vertical">
        {/* Reading comes before changing, so the whole order — the runner, the
            payment, the consent, the proof of payment — is one click away from
            the same menu that can edit or delete it. The eye on the Reference
            cell opens the very same modal; this is the second door to it, for
            an organizer already in the menu. */}
        <button
          className="action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
          onClick={() => {
            onView(runnerId);
            closeMenu();
          }}
        >
          <Eye size={16} />
          View Details
        </button>

        {canEdit && (
          <button
            className="action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm text-left"
            role="menuitem"
            onClick={() => {
              onEdit(runnerId);
              closeMenu();
            }}
          >
            <Edit size={16} />
            Edit Registrant
          </button>
        )}

        {canValidate && status === 'PENDING' && isBankTransfer && (
          <button
            onClick={() => onStatusChange('PAID')}
            disabled={updatingId === registrationId}
            className={`action-dropdown-item success w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${updatingId === registrationId ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="menuitem"
          >
            <CheckCircle size={16} />
            {updatingId === registrationId ? 'Updating...' : 'Validate Payment'}
          </button>
        )}

        {canDelete && (
          <>
            <div className="action-dropdown-divider"></div>
            <button
              className="action-dropdown-item danger flex items-center gap-3 px-4 py-2 text-sm text-left"
              role="menuitem"
              onClick={() => {
                onDelete(runnerId);
                closeMenu();
              }}
            >
              <Trash2 size={16} /> Delete
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
