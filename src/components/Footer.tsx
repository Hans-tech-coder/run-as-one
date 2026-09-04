"use client";

import React from 'react';
import Link from 'next/link';
import { Mail, Globe } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-20 sm:mt-32 pt-10 sm:pt-16 rounded-t-[40px] border-t border-white/5 bg-[#0a0a0c]/60 glass-panel border-b-0 border-l-0 border-r-0">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-[1.5fr_2fr] gap-10 lg:gap-16 pb-14 sm:pb-24">
        <div className="flex flex-col gap-6">
          <Link href="/" className="flex items-center gap-4 no-underline">
            <img src="/run-as-one-logo.png" alt="RunAsOne" width={1536} height={1024} className="h-11 sm:h-14 w-auto" />
          </Link>
          <p className="text-secondary leading-relaxed text-base max-w-[400px]">
            Your premium destination for the best running events. Join the community, track your strides, and reach new finish lines.
          </p>
          <div className="flex gap-4 mt-2 sm:mt-6">
            <a href="#" className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 text-white transition-all duration-300 hover:bg-gradient-to-r hover:from-accent-orange hover:to-accent-blue hover:text-white hover:-translate-y-0.5"><Globe size={20} /></a>
            <a href="#" className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 text-white transition-all duration-300 hover:bg-gradient-to-r hover:from-accent-orange hover:to-accent-blue hover:text-white hover:-translate-y-0.5"><Mail size={20} /></a>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8">
          <div className="flex flex-col gap-2.5">
            <h3 className="font-sans text-[1.1rem] text-white mb-2">Events</h3>
            <Link href="/events/marathons" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Marathons</Link>
            <Link href="/events/half-marathons" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Half Marathons</Link>
            <Link href="/events/5k-10k" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">5K & 10K</Link>
            <Link href="/events/virtual" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Virtual Runs</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="font-sans text-[1.1rem] text-white mb-2">Organizers</h3>
            <Link href="/organizers/host" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Host an Event</Link>
            <Link href="/organizers/pricing" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Pricing</Link>
            <Link href="/organizers/resources" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Resources</Link>
            <Link href="/organizers/login" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Organizer Login</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="font-sans text-[1.1rem] text-white mb-2">Support</h3>
            <Link href="/faq" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">FAQ</Link>
            <Link href="/contact" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Contact Us</Link>
            <Link href="/terms" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Terms of Service</Link>
            <Link href="/privacy" className="text-secondary text-[0.95rem] py-1 transition-colors duration-200 hover:text-accent-orange no-underline">Privacy Policy</Link>
          </div>
        </div>
      </div>
      
      <div className="text-center py-8 border-t border-white/5 text-secondary text-sm">
        <p>&copy; {new Date().getFullYear()} RunAsOne. All rights reserved.</p>
      </div>
    </footer>
  );
}
