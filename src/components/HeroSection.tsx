"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Search, SlidersHorizontal } from 'lucide-react';

export default function HeroSection() {
  return (
    <section className="flex justify-center mb-16 sm:mb-20 mt-4 sm:mt-8 w-full">
      <motion.div 
        className="flex items-center w-full max-w-[850px] px-4 sm:px-6 py-3 sm:py-4 rounded-full gap-3 sm:gap-6 shadow-[0_10px_40px_rgba(0,0,0,0.2)] bg-white/5 backdrop-blur-xl border border-white/10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Search className="text-secondary ml-2" size={24} />
        <input 
          type="text" 
          placeholder="Find your next race..." 
          className="flex-1 bg-transparent border-none text-white text-lg sm:text-xl font-body outline-none placeholder-gray-500 w-full min-w-0" 
        />
        <button className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-white/5 text-white cursor-pointer transition-colors hover:bg-white/15 border-none p-0">
          <SlidersHorizontal size={18} className="sm:w-5 sm:h-5" />
        </button>
      </motion.div>
    </section>
  );
}
