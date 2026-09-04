"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Flag } from 'lucide-react';

/**
 * The front door.
 *
 * This used to be a search box and nothing else — no headline, no sentence
 * saying what RunAsOne is — so a first-time visitor landed on a control with
 * no idea what they were searching. The copy states the product; the events
 * below are still the thing the page is for, so this stays short enough that
 * the first race card is reachable without much scrolling.
 *
 * The eyebrow, gradient headline and check-row are the same three parts the
 * /events and /results headers already use, at a larger size.
 */
export default function HeroSection() {
  const assurances = [
    'Secure online & bank transfer checkout',
    'Race kit pickup or nationwide delivery',
    'Official results & e-certificates',
  ];

  return (
    <section className="w-full flex justify-center sm:pt-6">
      <motion.div
        className="w-full max-w-3xl text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4">
          <Flag size={20} className="text-accent-blue" />
          <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">
            Philippine Running Events
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-[1.05] mb-4 sm:mb-5">
          Find Your Next
          <br />
          Finish Line
        </h1>

        <p className="text-base sm:text-lg text-secondary leading-relaxed max-w-xl mx-auto mb-6 sm:mb-8">
          Browse marathons, fun runs and virtual races, register your whole
          group in one go, and pick up your official time when the results drop.
        </p>

        {/* Named rather than numbered: a young platform's counts read small,
            and what actually reassures a runner handing over money is what the
            product does, not how many people have used it. */}
        <ul className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-x-6 gap-y-2.5 list-none p-0 m-0">
          {assurances.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-sm text-secondary"
            >
              <CheckCircle2 size={16} className="text-accent-blue shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/events"
            className="btn-gradient w-full sm:w-auto justify-center rounded-[16px] px-8 py-4 text-base no-underline shadow-xl shadow-accent-orange/20"
          >
            Browse All Events
          </Link>
          <Link
            href="/results"
            className="w-full sm:w-auto text-center bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-4 px-8 rounded-[16px] font-bold uppercase tracking-wider text-base no-underline"
          >
            View Results
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
