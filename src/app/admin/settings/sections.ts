/**
 * The settings pages, in the order the account menu lists them. Settings used
 * to be one long page of panels; the owner asked for the panels that belong
 * together to be grouped onto their own pages and reached from the account
 * menu instead of scrolling:
 *
 * - **Profile** (`/admin/settings`) — photo, name, email, a staff phone.
 * - **Security** — Password and Sign-in Activity.
 * - **Site Settings** — the admin email, the social links and (Super Admin
 *   only) the default platform fee. `platform:manage` only, so the menu hides
 *   it from anyone the page would refuse (`platformOnly`).
 * - **Your Access** — the read-only role panels.
 *
 * Client-safe: the account menu reads it to draw its rows.
 */
export type SettingsSectionKey = 'profile' | 'security' | 'site' | 'access';

export type SettingsSection = {
  key: SettingsSectionKey;
  href: string;
  label: string;
  /** Shown only to `platform:manage` (the sidebar's `nav.platform`). */
  platformOnly?: boolean;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'profile', href: '/admin/settings', label: 'Profile' },
  { key: 'security', href: '/admin/settings/security', label: 'Security' },
  { key: 'site', href: '/admin/settings/site', label: 'Site Settings', platformOnly: true },
  { key: 'access', href: '/admin/settings/access', label: 'Your Access' },
];
