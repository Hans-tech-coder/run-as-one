import React from 'react';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import {
  expectedParticipantsLabel,
  organizerExperienceLabel,
  organizerServiceLabel,
  organizerTypeLabel,
  SERVICE_GROUP_LABEL,
  servicesByGroup,
} from '@/lib/organizer-vocabulary';
import { formatEventDay } from '@/lib/event-schedule';
import { displayPhone, safeWebsite, type ClientApplicationRow } from './application-rows';
import { Detail, Section } from './ApplicationSection';

/**
 * What the application said, grouped the way the form asked — the
 * organization, the person, what they are planning — so staff read it in the
 * order the applicant wrote it. Every label comes from
 * `lib/organizer-vocabulary.ts`, never the stored code: a person reads
 * "Running Club or Community", not `RUNNING_CLUB`, and a value written before
 * an option was renamed still reads as itself.
 *
 * The contact details are links, because the reason to open a submission is
 * usually to get hold of the human behind it: the phone dials, the address
 * opens a mail, the website opens in a new tab.
 *
 * `hasDetails` false is an account made before the form existed: only its
 * email is shown, under *The contact*.
 */
export default function ApplicationAnswers({
  client,
  hasDetails,
}: {
  client: ClientApplicationRow;
  hasDetails: boolean;
}) {
  const contactName = [client.contactFirstName, client.contactLastName]
    .filter(Boolean)
    .join(' ');
  const basedIn = [client.city, client.province].filter(Boolean).join(', ');
  const website = client.website ? safeWebsite(client.website) : null;

  return (
    <>
      {hasDetails && (
        <Section title="The organization">
          <Detail label="Organizer type" value={organizerTypeLabel(client.orgType)} />
          <Detail label="Based in" value={basedIn} />
          <Detail
            label="Website or page"
            value={
              website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-accent-blue-ink hover:underline break-all"
                >
                  {website.replace(/^https?:\/\//i, '')}
                  <ExternalLink size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                client.website
              )
            }
          />
          <Detail
            label="Events organized before"
            value={organizerExperienceLabel(client.experience)}
          />
        </Section>
      )}

      <Section title={hasDetails ? 'The person' : 'The contact'}>
        {hasDetails && <Detail label="Name" value={contactName} />}
        {hasDetails && <Detail label="Role" value={client.contactRole} />}
        <Detail
          label="Email"
          // The whole width when it is the only answer, so a long address
          // is not folded into half a card.
          full={!hasDetails}
          value={
            <a
              href={`mailto:${client.email}`}
              className="inline-flex items-start gap-1.5 text-accent-blue-ink hover:underline [overflow-wrap:anywhere] min-w-0"
            >
              <Mail size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
              {client.email}
            </a>
          }
        />
        {hasDetails && (
          <Detail
            label="Mobile number"
            value={
              client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="inline-flex items-start gap-1.5 text-accent-blue-ink hover:underline"
                >
                  <Phone size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  {displayPhone(client.phone)}
                </a>
              )
            }
          />
        )}
      </Section>

      {hasDetails && (
        <Section title="What they are planning">
          <Detail
            label="Needs Run As One for"
            full
            value={client.services.length > 0 && <ServiceGroups services={client.services} />}
          />
          <Detail label="First event" value={client.firstEventName} />
          <Detail
            label="Date"
            value={client.firstEventDate && formatEventDay(client.firstEventDate)}
          />
          <Detail label="Location" value={client.firstEventLocation} />
          <Detail
            label="Expected runners"
            value={expectedParticipantsLabel(client.expectedRunners)}
          />
          <Detail
            label="Anything else they told us"
            full
            value={
              client.applicationNote && (
                <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {client.applicationNote}
                </span>
              )
            }
          />
        </Section>
      )}
    </>
  );
}

/**
 * The services asked for, one line per group — Online, then Race day — so a
 * registration client, a race-day job, or both reads at a glance
 * (SERVICE_INQUIRY_PLAN.md Batch 4). A service with no group (Not Sure Yet)
 * stands on its own line without a label. The label sits beside the chips
 * from `sm` up and above them on a phone.
 */
function ServiceGroups({ services }: { services: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      {servicesByGroup(services).map(({ group, services: inGroup }) => (
        <div
          key={group ?? 'other'}
          className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3"
        >
          {group && (
            <span className="text-xs font-semibold text-secondary sm:w-20 sm:shrink-0 sm:pt-1.5">
              {SERVICE_GROUP_LABEL[group]}
            </span>
          )}
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2 min-w-0">
            {inGroup.map(service => (
              <li
                key={service}
                className="rounded-full border border-[var(--dash-border)] bg-[var(--ink-05)] px-3 py-1 text-xs text-[var(--ink-85)]"
              >
                {organizerServiceLabel(service)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
