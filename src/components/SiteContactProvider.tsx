"use client";

import React, { createContext, useContext } from 'react';
import { DEFAULT_CONTACT_EMAIL, NO_SOCIAL_LINKS, type SocialLinks } from '@/lib/site-contact';

/**
 * The saved contact address and social links, handed to client components.
 *
 * Both are settings now (lib/site-settings.ts), and the database can only be
 * read on the server. The root layout reads them once and mounts this
 * provider, so a client component — the footer, the organizer sign-up page —
 * asks `useContactEmail()` / `useSocialLinks()` instead of importing a
 * constant that would go stale the moment somebody changed the setting.
 */
type SiteContact = { contactEmail: string; socialLinks: SocialLinks };

const SiteContactContext = createContext<SiteContact>({
  contactEmail: DEFAULT_CONTACT_EMAIL,
  socialLinks: NO_SOCIAL_LINKS,
});

export function SiteContactProvider({
  contactEmail,
  socialLinks,
  children,
}: SiteContact & { children: React.ReactNode }) {
  return (
    <SiteContactContext.Provider value={{ contactEmail, socialLinks }}>
      {children}
    </SiteContactContext.Provider>
  );
}

export function useContactEmail(): string {
  return useContext(SiteContactContext).contactEmail;
}

/** Each channel's saved link; null for a channel that has none. */
export function useSocialLinks(): SocialLinks {
  return useContext(SiteContactContext).socialLinks;
}
