"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Search, SlidersHorizontal } from 'lucide-react';
import './HeroSection.css';

export default function HeroSection() {
  return (
    <section className="hero-section">
      <motion.div 
        className="search-bar glass-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Search className="search-icon" size={24} />
        <input type="text" placeholder="Find your next race..." className="search-input" />
        <button className="filter-btn">
          <SlidersHorizontal size={20} />
        </button>
      </motion.div>
    </section>
  );
}
