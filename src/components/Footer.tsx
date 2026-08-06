"use client";

import React from 'react';
import Link from 'next/link';
import { Mail, Globe } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer glass-panel">
      <div className="container footer-container">
        <div className="footer-brand">
          <Link href="/" className="footer-logo">
            <img src="/logo.png" alt="StrideSync Logo" width="40" height="40" style={{ borderRadius: '10px' }} />
            <span className="logo-text">StrideSync</span>
          </Link>
          <p className="footer-tagline">
            Your premium destination for the best running events. Join the community, track your strides, and reach new finish lines.
          </p>
          <div className="footer-socials">
            <a href="#" className="social-icon"><Globe size={20} /></a>
            <a href="#" className="social-icon"><Mail size={20} /></a>
          </div>
        </div>

        <div className="footer-links">
          <div className="link-group">
            <h3>Events</h3>
            <Link href="/events/marathons">Marathons</Link>
            <Link href="/events/half-marathons">Half Marathons</Link>
            <Link href="/events/5k-10k">5K & 10K</Link>
            <Link href="/events/virtual">Virtual Runs</Link>
          </div>
          <div className="link-group">
            <h3>Organizers</h3>
            <Link href="/organizers/host">Host an Event</Link>
            <Link href="/organizers/pricing">Pricing</Link>
            <Link href="/organizers/resources">Resources</Link>
            <Link href="/organizers/login">Organizer Login</Link>
          </div>
          <div className="link-group">
            <h3>Support</h3>
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact Us</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} StrideSync. All rights reserved.</p>
      </div>
    </footer>
  );
}
