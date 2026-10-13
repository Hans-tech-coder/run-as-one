"use client";

import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import BusyLabel from '@/components/ui/BusyLabel';
import AuthHomeLink from '../AuthHomeLink';
import { STEPS } from './apply-steps';
import { useApplicationForm } from './useApplicationForm';
import OrganizationStep from './OrganizationStep';
import ContactStep from './ContactStep';
import EventStep from './EventStep';
import ThankYouPanel from './ThankYouPanel';

import './../Auth.css';

/**
 * The organizer application.
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
export default function AdminRegister() {
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
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>

      <div className="auth-shell auth-shell--wide">
        <AuthHomeLink />

        <div className="auth-card">
          <div className="auth-header">
            <Link href="/" className="auth-logo-link mb-5" aria-label="Run As One home page">
              <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px]" decorative />
            </Link>
            <h1 className="auth-title">
              {isSent ? 'Application received' : 'Apply as an Organizer'}
            </h1>
            <p className="auth-subtitle">
              {isSent
                ? 'Thank you. Here is what happens next.'
                : 'Run your races on Run As One — registration, payments, race kits, results and e-certificates in one place.'}
            </p>
          </div>

          {isSent ? (
            <ThankYouPanel form={form} headingRef={headingRef} />
          ) : (
            <>
              <ol className="apply-steps" aria-label="Application progress">
                {STEPS.map((entry, index) => {
                  const state =
                    index < step ? 'done' : index === step ? 'current' : 'todo';
                  return (
                    <li
                      key={entry.rail}
                      className="apply-step"
                      data-state={state}
                      aria-current={state === 'current' ? 'step' : undefined}
                    >
                      <span className="apply-step__dot" aria-hidden="true">
                        {state === 'done' ? <Check size={15} strokeWidth={3} /> : index + 1}
                      </span>
                      <span className="apply-step__label">{entry.rail}</span>
                    </li>
                  );
                })}
              </ol>

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
                    className="btn-gradient text-white font-medium"
                  >
                    {isSubmitting ? (
                      <BusyLabel>Submitting</BusyLabel>
                    ) : isLast ? (
                      <>
                        <Send size={16} aria-hidden="true" />
                        Submit Application
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

              <div className="auth-footer">
                Already have an account?{' '}
                <Link href="/admin/login" className="auth-link">
                  Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
