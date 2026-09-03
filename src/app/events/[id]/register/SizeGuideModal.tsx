"use client";

import React from "react";
import { X, Info } from "lucide-react";
import { formatPesos } from "@/lib/money";
import { SHIRT_SIZE_CHART, isUpchargeShirtSize } from "@/lib/shirt-size";

/**
 * The printed size chart, on screen.
 *
 * Measurements come from SHIRT_SIZE_CHART so the guide and the size field can
 * never quote different numbers. Singlets and shirts share one chart — that is
 * why the field asks for a single "Shirt Size" rather than one measurement per
 * garment.
 */
export default function SizeGuideModal({
  upcharge = 0,
  onClose,
}: {
  /** Centavos this event adds for 4XL and above. 0 hides the note. */
  upcharge?: number;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        <h3 className="text-xl mb-1 text-accent-blue flex items-center gap-2">
          <Info size={24} /> Size Chart
        </h3>
        <p className="text-secondary text-sm mb-6 uppercase tracking-wider">
          Running Singlet &amp; Shirt
        </p>

        <div className="overflow-x-auto mb-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-3 px-4 text-white font-medium">Size</th>
                <th className="py-3 px-4 text-white font-medium">
                  Width (inches)
                </th>
                <th className="py-3 px-4 text-white font-medium">
                  Length (inches)
                </th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {SHIRT_SIZE_CHART.map((row, idx) => (
                <tr
                  key={row.size}
                  className={`hover:bg-white/5 transition-colors ${
                    idx < SHIRT_SIZE_CHART.length - 1
                      ? "border-b border-gray-800/50"
                      : ""
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-white">
                    {row.size}
                    {upcharge > 0 && isUpchargeShirtSize(row.size) && (
                      <span className="ml-2 text-xs text-accent-orange font-normal">
                        +&#8369;{formatPesos(upcharge)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">{row.width}</td>
                  <td className="py-3 px-4">{row.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-secondary text-xs mb-4 text-center">
          Measurements may vary by ±0.5 to 1 inch.
        </p>

        <div className="bg-dark/50 border border-blue p-4 rounded-lg text-sm text-secondary">
          <span className="text-accent-blue font-medium block mb-1">Note:</span>
          When in between sizes, we recommend sizing up. The singlet and the
          shirt follow this same chart, so one size covers both.
          {upcharge > 0 && (
            <>
              {" "}
              Sizes 4XL and above add ₱{formatPesos(upcharge)} per runner.
            </>
          )}
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
