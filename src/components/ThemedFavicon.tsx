'use client';

import { useEffect } from 'react';
import {
  MARK_INKS_FOR_DARK_UI,
  MARK_INKS_FOR_LIGHT_UI,
  markSvgMarkup,
} from '@/lib/brand-mark';

/**
 * Makes the browser-tab icon follow the system light/dark setting.
 *
 * `app/icon.svg` already carries its own `prefers-color-scheme` rule, and that
 * is what a crawler and a JavaScript-less visitor get — but whether a browser
 * *evaluates* a media query inside a favicon is not something to rely on:
 * support differs between Firefox, Chrome and Safari and has changed more than
 * once. Swapping the `href` instead asks nothing of the favicon renderer beyond
 * drawing the SVG it is handed, which every browser that supports SVG favicons
 * already does. The static file stays as the pre-hydration default, so there is
 * no moment with no icon at all.
 *
 * A data URI rather than two files on disk: the mark would otherwise be a third
 * and fourth copy of the same path data, and `lib/brand-mark` exists precisely
 * so there is one.
 *
 * The Open Graph card deliberately gets no equivalent, because it cannot have
 * one — see `app/opengraph-image.png` and the project guide.
 */
export default function ThemedFavicon() {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');

    // An explicit `data-theme` is a decision the visitor made and outranks the
    // system setting — the same precedence `globals.css` gives it. Until the
    // in-app switch exists nothing sets the attribute and this falls straight
    // through to the media query, which is why the switch will not need to
    // remember to tell the favicon about itself.
    const isDark = () => {
      const chosen = root.dataset.theme;
      if (chosen === 'dark') return true;
      if (chosen === 'light') return false;
      return query.matches;
    };

    const apply = () => {
      const markup = markSvgMarkup(
        isDark() ? MARK_INKS_FOR_DARK_UI : MARK_INKS_FOR_LIGHT_UI,
      );
      const href = `data:image/svg+xml,${encodeURIComponent(markup)}`;

      let link = document.querySelector<HTMLLinkElement>(
        'link[rel="icon"][type="image/svg+xml"]',
      );
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        document.head.appendChild(link);
      }
      link.href = href;
    };

    apply();
    query.addEventListener('change', apply);
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      query.removeEventListener('change', apply);
      observer.disconnect();
    };
  }, []);

  return null;
}
