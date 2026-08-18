"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MoreVertical, Users, Trophy, Edit, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function EventActionsMenu({ 
  eventId, 
  onDelete 
}: { 
  eventId: string;
  onDelete?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  
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
  }, [isOpen, updatePosition]);

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

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    if (onDelete) {
      onDelete();
    }
  };

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className={`action-dropdown-menu t-dropdown`} 
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
        <Link 
          href={`/admin/events/${eventId}/registrants`} 
          className="action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm"
          role="menuitem"
          onClick={closeMenu}
        >
          <Users size={16} />
          Registrants
        </Link>
        <Link 
          href={`/admin/events/${eventId}/results`} 
          className="action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm"
          role="menuitem"
          onClick={closeMenu}
        >
          <Trophy size={16} />
          Manage Results
        </Link>
        <Link 
          href={`/admin/events/${eventId}/edit`} 
          className="action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm"
          role="menuitem"
          onClick={closeMenu}
        >
          <Edit size={16} />
          Edit Event
        </Link>
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
