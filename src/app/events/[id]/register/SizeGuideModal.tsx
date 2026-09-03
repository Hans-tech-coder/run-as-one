"use client";

import React from "react";
import { X, Info } from "lucide-react";

const SIZES = [
  { size: "XS", width: '18"', length: '25"' },
  { size: "S", width: '19"', length: '26"' },
  { size: "M", width: '20"', length: '27"' },
  { size: "L", width: '21"', length: '28"' },
  { size: "XL", width: '22"', length: '29"' },
  { size: "XXL", width: '23"', length: '30"' },
];

/** Singlet measurements. Shared by both registration wizards. */
export default function SizeGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        <h3 className="text-xl mb-6 text-accent-blue flex items-center gap-2">
          <Info size={24} /> Size Guide
        </h3>

        <p className="text-secondary text-sm mb-4">
          Measurements are in inches (Width x Length). Please allow a ±0.5 inch
          tolerance due to manual measurement. Standard Asian Fit.
        </p>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-3 px-4 text-white font-medium">Size</th>
                <th className="py-3 px-4 text-white font-medium">
                  Width (Chest)
                </th>
                <th className="py-3 px-4 text-white font-medium">Length</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {SIZES.map((row, idx) => (
                <tr
                  key={row.size}
                  className={`hover:bg-white/5 transition-colors ${
                    idx < SIZES.length - 1 ? "border-b border-gray-800/50" : ""
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-white">
                    {row.size}
                  </td>
                  <td className="py-3 px-4">{row.width}</td>
                  <td className="py-3 px-4">{row.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-dark/50 border border-blue p-4 rounded-lg text-sm text-secondary">
          <span className="text-accent-blue font-medium block mb-1">Note:</span>
          Both the Race Singlet and Finisher Shirt follow this standard sizing
          guide.
        </div>

        <div className="text-center mt-6">
          <button className="btn-gradient w-full" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
