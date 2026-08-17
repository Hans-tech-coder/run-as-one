"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, CheckCircle, Trash2, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RegistrantActionsMenuProps {
  runnerId: string;
  registrationId: string;
  status: string;
  paymentMethod: string;
  updatingId: string | null;
  handleStatusChange: (registrationId: string, status: string) => void;
}

export default function RegistrantActionsMenu({ 
  runnerId,
  registrationId,
  status,
  paymentMethod,
  updatingId,
  handleStatusChange
}: RegistrantActionsMenuProps) {
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

  const onStatusChange = (newStatus: string) => {
    handleStatusChange(registrationId, newStatus);
    closeMenu();
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
        <button 
          className="action-dropdown-item flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
          onClick={() => {
            alert('Edit registrant functionality coming soon');
            closeMenu();
          }}
        >
          <Edit size={16} />
          Edit Registrant
        </button>

        {status === 'PENDING' && paymentMethod === 'bank_transfer' && (
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

        <div className="action-dropdown-divider"></div>
        <button 
          className="action-dropdown-item danger flex items-center gap-3 px-4 py-2 text-sm text-left"
          role="menuitem"
          onClick={() => {
            alert('Delete registrant functionality coming soon');
            closeMenu();
          }}
        >
          <Trash2 size={16} /> Delete
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
