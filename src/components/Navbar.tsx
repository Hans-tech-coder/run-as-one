"use client";

import React from 'react';
import Link from 'next/link';
import './Navbar.css';

export default function Navbar() {
  return (
    <header className="navbar glass-panel">
      <div className="container navbar-container">
        <Link href="/" className="logo">
          <img src="/logo.png" alt="StrideSync Logo" width="32" height="32" style={{ borderRadius: '8px' }} />
          <span className="logo-text">StrideSync</span>
        </Link>

        <nav className="desktop-nav">
          <Link href="/events" className="nav-link active">Events</Link>
          <Link href="/strides" className="nav-link">My Strides</Link>
          <Link href="/community" className="nav-link">Community</Link>
          <Link href="/profile" className="nav-link">Profile</Link>
        </nav>
      </div>
    </header>
  );
}
