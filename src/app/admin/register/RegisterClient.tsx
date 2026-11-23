"use client";

import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Send } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { PAST_EVENTS_HREF } from '@/app/s/[site]/events/events-view';
import { FORM_SUBTITLE, FORM_TITLE, STEPS } from './apply-steps';
import { useApplicationForm } from './useApplicationForm';
import OrganizationStep from './OrganizationStep';
import ContactStep from './ContactStep';
import EventStep from './EventStep';
import ThankYouPanel from './ThankYouPanel';

import './../Auth.css';
import './inquiry-paper.css';
import StepRail from '@/components/ui/StepRail';

/**
 * The service inquiry, client half (`page.tsx` is the server half, for its
 * metadata). Titled "Inquire About Our Services" since
 * SERVICE_INQUIRY_PLAN.md O2: it takes an inquiry for any service Run As One
 * sells, online or race day, and is linked as "Our Services".
 *
 * It used to be a sign-up box — a name, an address, a password — and then an
 * application a super admin approved or rejected. Since ADMIN_MERGE_PLAN.md
 * Batch 3 it is neither: **Run As One runs the races**, so what arrives here is
 * a `Client` submission with no password and no account. It waits on
 * `/admin/clients` until staff press Send invite, and the invitation is where
 * the applicant chooses a password. The questions below stay because they are
 * what Run As One needs before taking on a race — who the human is, whether
 * the organization can be found anywhere outside this form, what they have run
 * before, and what they are about to run.
 *
 * **It is a public page, on Paper** (2026-11-21, docs/conventions.md §9). The
 * home page's "Organizing a race?" band links here, and a prospective client
 * used to go from a light page into a dark, admin-looking sign-in card.
 * `page.tsx` now draws the site frame round it (the navbar and footer), the
 * heading and lead sit beside the form on a wide screen, and the form is a
 * Paper card. The steps keep their own markup: `inquiry-paper.css` restyles
 * Auth.css's form and `apply-*` classes inside `.inquiry`, and the frame's
 * `.site-checkout` mark (lib/site-look.ts `wearsPaletteBridge`) turns the
 * shared controls — PhoneField, StepRail, AdminSelect, AdminDatePicker — light
 * the way the checkout does. The sign-in page and the dashboard are untouched.
 *
 * This file is the frame: the header, the rail, the step's heading and the
 * buttons. The steps and their fields are `apply-steps.ts`; each step's
 * controls are `OrganizationStep`, `ContactStep` and `EventStep` (whose
 * services question is `ServicesQuestion`); the checks and the post are
 * `useApplicationForm`; a sent application shows `ThankYouPanel`.
 *
 * Three decisions worth keeping:
 *
 * **It is three steps, not one long page.** The same eighteen fields in one
 * column read as a wall and get abandoned; grouped as "your organization",
 * "you and how to reach you" and "what you are planning" they read as three short
 * questions, and the rail at the top says how much is left. The steps are
 * groups of related answers rather than a funnel — nothing is saved until the
 * last one, which is why the rail's dots are not buttons and Back is.
 *
 * **A step is checked before it advances, against the same module the API
 * uses** — see `useApplicationForm`.
 *
 * **Required is the default and optional is marked.** Nine of the fields are
 * genuinely required; the rest say "Optional" beside the label. A form that
 * demands an event date from somebody who has not booked the venue yet gets a
 * made-up date, which is worse than a blank.
 */
export default function RegisterClient({ hasPastEvents }: { hasPastEvents: boolean }) {
  const {
    step,
    form,
    errors,
    failure,
    isSubmitting,
    isSent,
    isLast,
    problems,
    headingRef,
    problemRef,
    set,
    toggleService,
    handleBack,
    handleSubmit,
  } = useApplicationForm();

  return (
    <section className="site-section site-wrap">
      <div className="inquiry">
        <header className="inquiry__intro" data-enter>
          <p className="m-0 mb-4 text-[0.9375rem] font-semibold text-site-accent">Our Services</p>
          <h1 className="site-h1">{isSent ? 'Inquiry Received' : FORM_TITLE}</h1>
          <p className="site-lead">
            {isSent ? 'Thank you. Here is what happens next.' : FORM_SUBTITLE}
          </p>
          {/* The track record, for an organization deciding whether to hire
              us (PAST_EVENTS_PLAN.md §3): one quiet link under the lead,
              gone once the inquiry is sent. A new tab, because nothing typed
              here is kept until the last step, and a look at our races must
              not cost a half-written inquiry. Only when there is a race to
              show. */}
          {hasPastEvents && !isSent && (
            <p className="m-0 mt-4">
              <Link
                href={PAST_EVENTS_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="site-link site-link--arrow"
              >
                <span>See Races We Have Run</span>
                <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </Link>
            </p>
          )}
          {!isSent && (
            <p className="m-0 mt-6 text-[0.9375rem] leading-relaxed text-site-muted">
              Already working with us?{' '}
              <Link href="/admin/login" className="site-link">
                Sign In
              </Link>
            </p>
          )}
        </header>

        <div className="site-form-card">
          {isSent ? (
            <ThankYouPanel form={form} headingRef={headingRef} />
          ) : (
            <>
              <StepRail
                className="apply-steps"
                labels={STEPS.map((entry) => entry.rail)}
                current={step}
                ariaLabel="Application progress"
              />

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                <div className="apply-step-head">
                  <span className="apply-eyebrow">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  <h2 ref={headingRef} tabIndex={-1} className="outline-none">
                    {STEPS[step].title}
                  </h2>
                  <p>{STEPS[step].blurb}</p>
                </div>

                {(problems > 0 || failure) && (
                  <div
                    ref={problemRef}
                    className="apply-problem"
                    role="alert"
                    tabIndex={-1}
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      {failure ||
                        `${problems} ${problems === 1 ? 'answer needs' : 'answers need'} your attention before you can continue. ${
                          problems === 1 ? 'It is' : 'They are'
                        } marked in red below.`}
                    </span>
                  </div>
                )}

                {step === 0 && <OrganizationStep form={form} errors={errors} set={set} />}

                {step === 1 && <ContactStep form={form} errors={errors} set={set} />}

                {step === 2 && (
                  <EventStep
                    form={form}
                    errors={errors}
                    set={set}
                    toggleService={toggleService}
                  />
                )}

                <div className={`apply-nav${step === 0 ? ' apply-nav--end' : ''}`}>
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      disabled={isSubmitting}
                      className="btn-secondary"
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Back
                    </button>
                  )}

                  {/* One submit button whose label changes, rather than a
                      Continue that is `type="button"` and a Submit that is
                      not. The pair looked equivalent and was not: React
                      re-uses the same DOM node for both, so the press that
                      advanced to the last step re-typed that very node to
                      `submit` before the browser got round to the click's
                      default action, and the form posted itself the instant
                      step 3 appeared. Routing both presses through onSubmit
                      also makes Enter in any field do what Enter should. */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-gradient"
                  >
                    {isSubmitting ? (
                      <BusyLabel>Submitting</BusyLabel>
                    ) : isLast ? (
                      <>
                        <Send size={16} aria-hidden="true" />
                        Submit Inquiry
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
