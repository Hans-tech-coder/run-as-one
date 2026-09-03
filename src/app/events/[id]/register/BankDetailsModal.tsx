"use client";

import React from "react";
import { X } from "lucide-react";
import type { BankOption } from "./banks";

/** Account number and QR for one bank. Shared by both registration wizards. */
export default function BankDetailsModal({
  bank,
  onClose,
}: {
  bank: BankOption;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        <h3 className="text-xl mb-4">{bank.name} Details</h3>

        <div className="bank-details-card mb-6">
          <div className="bank-detail-item">
            <span className="bank-detail-label">Account Name</span>
            <span className="bank-detail-value">{bank.accountName}</span>
          </div>
          <div className="bank-detail-item">
            <span className="bank-detail-label">Account Number</span>
            <span className="bank-detail-value">{bank.accountNumber}</span>
          </div>
        </div>

        <div className="qr-code-container mb-4">
          <div className="text-center text-sm text-secondary mb-2">
            Scan to Pay
          </div>
          <img
            src={bank.qrCode}
            alt={`${bank.name} QR Code`}
            className="qr-image mx-auto rounded-lg"
          />
        </div>

        <div className="text-center mt-6">
          <button className="btn-gradient w-full" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
