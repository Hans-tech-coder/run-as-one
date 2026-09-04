import React from 'react';
import { ImageOff } from 'lucide-react';

interface EventImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconSize?: number;
}

/**
 * An event may have no cover photo — the admin form stores an empty string for
 * one. Rendering <img src=""> makes the browser re-request the page, so fall
 * back to a placeholder that keeps the frame the layout expects.
 */
export default function EventImage({ src, alt, className = '', iconSize = 32 }: EventImageProps) {
  if (!src) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5`}
        role="img"
        aria-label={alt}
      >
        <ImageOff size={iconSize} className="text-white/25" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} />;
}
