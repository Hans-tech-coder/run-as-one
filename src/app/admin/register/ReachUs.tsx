"use client";

import { SOCIAL_CHANNELS, supportMailto } from '@/lib/site-contact';
import { useContactEmail, useSocialLinks } from '@/components/SiteContactProvider';

/**
 * The way to reach Run As One, drawn under the duplicate-application refusal
 * (SERVICE_INQUIRY_PLAN.md S3): the saved contact address, then each social
 * channel that has a saved link. A channel with none is left out, as the
 * footer leaves it out.
 */
export default function ReachUs() {
  const contactEmail = useContactEmail();
  const socialLinks = useSocialLinks();
  const channels = SOCIAL_CHANNELS.flatMap((channel) => {
    const href = socialLinks[channel.key];
    return href ? [{ name: channel.name, href }] : [];
  });

  return (
    <p className="mt-1.5 text-xs leading-relaxed text-secondary">
      Email{' '}
      <a href={supportMailto(contactEmail)} className="auth-link">
        {contactEmail}
      </a>
      {channels.length > 0 && (
        <>
          {' '}or message us on{' '}
          {channels.map((channel, index) => (
            <span key={channel.name}>
              {index > 0 && (index === channels.length - 1 ? ' or ' : ', ')}
              <a
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                className="auth-link"
              >
                {channel.name}
              </a>
            </span>
          ))}
        </>
      )}
      .
    </p>
  );
}
