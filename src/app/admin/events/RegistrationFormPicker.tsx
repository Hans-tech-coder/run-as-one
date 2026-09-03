"use client";

import React from 'react';
import { CreditCard, Landmark } from 'lucide-react';
import { REGISTRATION_FORMS, type RegistrationForm } from '@/lib/registration-form';

/**
 * Picks which checkout an event's runners see.
 *
 * Deliberately radio cards rather than a <select>: this setting changes what
 * every registrant is shown at payment time, and a dropdown would hide the
 * consequence behind a label. Shared by the create and edit forms so the two
 * cannot drift apart.
 */

const OPTIONS: {
  value: RegistrationForm;
  icon: typeof CreditCard;
  title: string;
  description: string;
}[] = [
  {
    value: REGISTRATION_FORMS.ONLINE,
    icon: CreditCard,
    title: 'Online Payment',
    description:
      'GCash, Maya, QRPh and card through PayMongo, plus bank transfer. PayMongo adds a transaction fee, which the runner pays.',
  },
  {
    value: REGISTRATION_FORMS.BANK_TRANSFER,
    icon: Landmark,
    title: 'Bank Transfer Only',
    description:
      'The runner transfers manually and uploads a receipt, which you approve. No transaction fee, but every registration needs your review.',
  },
];

export default function RegistrationFormPicker({
  value,
  onChange,
}: {
  value: RegistrationForm;
  onChange: (value: RegistrationForm) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;

        return (
          <label
            key={option.value}
            className={`relative flex cursor-pointer flex-col gap-3 rounded-xl border p-5 transition-colors ${
              isSelected
                ? 'border-accent-blue bg-accent-blue/10'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="registrationForm"
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <span
                className={`rounded-lg p-2 ${
                  isSelected ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-gray-400'
                }`}
              >
                <Icon size={20} />
              </span>
              <span className="font-medium text-primary">{option.title}</span>
            </div>
            <p className="text-sm leading-relaxed text-secondary">{option.description}</p>
          </label>
        );
      })}
    </div>
  );
}
