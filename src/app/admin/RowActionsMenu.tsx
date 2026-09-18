"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { placeRowMenu, type RowMenuPlacement } from './row-menu-position';
import { cssDurationMs } from '@/lib/css-duration';

/** One item in a row's ⋮ menu. */
export interface RowAction {
  key: string;
  label: string;
  /** A 16px lucide icon. */
  icon: React.ReactNode;
  /** What pressing it does. Ignored when `href` is given. */
  onSelect?: () => void;
  /** A plain link instead of a button — a receipt file, opened in a new tab. */
  href?: string;
  /** Destructive: drawn red, below a divider, after every other item. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The events table's ⋮ row menu (`events/EventActionsMenu`) for a table whose
 * items are a plain list: clients, clubs, feedback and a race's remittances.
 * The portal, the fixed placement by `row-menu-position` and the closing
 * animation are the same machinery, because a dropdown inside a table cell is
 * clipped by the table's own overflow. The table decides what each row offers
 * and passes only those; a row with nothing to offer renders nothing.
 */
export default function RowActionsMenu({
  label,
  actions,
  className = '',
}: {
  /** Who or what this row is, for a screen reader. */
  label: string;
  actions: RowAction[];
  /** Added to the wrapper — `ml-auto` pushes it right in a card's footer. */
  className?: string;
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
      cssDurationMs('--dropdown-close-dur', 150);

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

  if (actions.length === 0) return null;

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

  const safe = actions.filter(action => !action.danger);
  const danger = actions.filter(action => action.danger);

  const renderItem = (action: RowAction) => {
    const className = `action-dropdown-item ${action.danger ? 'danger' : ''} w-full flex items-center gap-3 px-4 py-2 text-sm text-left no-underline ${
      action.disabled ? 'opacity-50 cursor-not-allowed' : ''
    }`;
    if (action.href) {
      return (
        <a
          key={action.key}
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          role="menuitem"
          onClick={closeMenu}
        >
          {action.icon}
          {action.label}
        </a>
      );
    }
    return (
      <button
        key={action.key}
        type="button"
        onClick={() => {
          closeMenu();
          action.onSelect?.();
        }}
        disabled={action.disabled}
        className={className}
        role="menuitem"
      >
        {action.icon}
        {action.label}
      </button>
    );
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
        zIndex: 9999,
      }}
    >
      <div className="py-1 flex flex-col" role="menu" aria-orientation="vertical">
        {safe.map(renderItem)}
        {safe.length > 0 && danger.length > 0 && <div className="action-dropdown-divider"></div>}
        {danger.map(renderItem)}
      </div>
    </div>
  );

  return (
    // The wrapper swallows the click and the keys, so pressing ⋮ never also
    // fires a row that opens on click (clients, feedback).
    <div
      className={`action-dropdown-container flex ${className}`}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className="action-dropdown-btn focus:outline-none"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Actions for ${label}`}
      >
        <MoreVertical size={20} />
      </button>

      {isOpen && createPortal(dropdownContent, document.body)}
    </div>
  );
}
