"use client";

import React, { createContext, useContext } from 'react';
import { DEFAULT_CONTACT_EMAIL } from '@/lib/site-contact';

/**
 * The saved contact address, handed to client components.
 *
 * The address is a setting now (lib/site-settings.ts), and the database can
 * only be read on the server. The root layout reads it once and mounts this
 * provider, so a client component — the footer, the organizer sign-up page —
 * asks `useContactEmail()` instead of importing a constant that would go stale
 * the moment somebody changed the setting.
 */
const ContactEmailContext = createContext<string>(DEFAULT_CONTACT_EMAIL);

export function SiteContactProvider({
  contactEmail,
  children,
}: {
  contactEmail: string;
  children: React.ReactNode;
}) {
  return (
    <ContactEmailContext.Provider value={contactEmail}>
      {children}
    </ContactEmailContext.Provider>
  );
}

export function useContactEmail(): string {
  return useContext(ContactEmailContext);
}
