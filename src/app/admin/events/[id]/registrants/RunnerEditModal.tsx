"use client";

import React, { useState } from 'react';
import { X, TriangleAlert } from 'lucide-react';
import AdminSelect from '../../../AdminSelect';
import AdminDatePicker from '../../../AdminDatePicker';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import { SHIRT_SIZES } from '@/lib/shirt-size';
import { upperCaseAsTyped } from '@/lib/text-case';
import { today } from '@/lib/event-schedule';
import {
  GUARDIAN_NAME_PLACEHOLDER,
  GUARDIAN_RELATIONSHIPS,
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIP_PLACEHOLDER,
  ageOn,
  asGuardianRelationship,
  guardianLine,
  needsGuardianConsent,
} from '@/lib/minor-consent';
import {
  RUNNER_ADDRESS_FIELDS,
  formatRunnerAddress,
  runnerAddressProblems,
  type RunnerAddress,
  type RunnerAddressField,
} from '@/lib/runner-address';
import RunnerAddressEditor from './RunnerAddressEditor';

/**
 * Editing one runner, split out of `RegistrantsTable.tsx` when the home
 * address joined it (RUNNER_ADDRESS_PLAN.md Batch 3). The table still owns
 * which row is open and the open/close animation; this file owns the form,
 * the save, and how a saved runner is folded back into its row.
 */

/** The relationship options for the edit modal, from the one vocabulary. */
const GUARDIAN_RELATIONSHIP_OPTIONS = GUARDIAN_RELATIONSHIPS.map(value => ({
  value,
  label: GUARDIAN_RELATIONSHIP_LABELS[value],
}));

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'MALE' },
  { value: 'FEMALE', label: 'FEMALE' },
] as const;

/**
 * Whether the draft's home address must be complete. A row from before the
 * address was collected has none, and fixing that runner's phone must not
 * demand one — but once staff start typing an address, a half of one would
 * be a worse record than none, so it has to be finished.
 */
function addressStarted(draft: Partial<RunnerAddress>): boolean {
  return RUNNER_ADDRESS_FIELDS.some(field => (draft[field] ?? '').trim() !== '');
}

/**
 * The row as the table shows it, after a save. Only what the runner owns is
 * taken from the response; the order's own fields (reference, money, status)
 * stay as they were.
 */
export function mergeSavedRunner(row: any, saved: any, raceDay: string): any {
  const homeAddress = formatRunnerAddress(saved);
  const known = asGuardianRelationship(saved.guardianRelationship);
  return {
    ...row,
    firstName: saved.firstName,
    lastName: saved.lastName,
    name: `${saved.firstName} ${saved.lastName}`,
    email: saved.email,
    phone: saved.phone,
    gender: saved.gender,
    size: saved.singletSize,
    runningCommunity: saved.runningCommunity,
    emergencyContactName: saved.emergencyContactName,
    emergencyContactPhone: saved.emergencyContactPhone,
    medicalConditions: saved.medicalConditions || '',
    // A corrected birthdate can make a runner a minor, or stop them
    // being one, so the chip and the consent block follow the save
    // rather than waiting for a reload. The consent time is never
    // edited: it is when the guardian agreed, not when staff typed.
    birthdate: saved.birthdate,
    isMinor: needsGuardianConsent(saved.birthdate ?? '', raceDay),
    ageOnRaceDay: ageOn(saved.birthdate ?? '', raceDay),
    guardianName: saved.guardianName,
    guardianRelationship: known,
    guardianRelationshipLabel: known ? GUARDIAN_RELATIONSHIP_LABELS[known] : null,
    guardianLine: guardianLine(saved.guardianName, saved.guardianRelationship),
    addressProvince: saved.addressProvince ?? '',
    addressCity: saved.addressCity ?? '',
    addressBarangay: saved.addressBarangay ?? '',
    addressStreet: saved.addressStreet ?? '',
    homeAddress,
    // A split order ships this runner's kit to their own home, so the
    // delivery address follows the edit. One-address orders keep theirs.
    ...(row.deliverySplit ? { deliveryAddress: homeAddress || 'N/A' } : {}),
  };
}

export default function RunnerEditModal({
  runner,
  setRunner,
  isOpen,
  isClosing,
  raceDay,
  onClose,
  onSaved,
}: {
  /** The draft being edited, a copy of the row; null once the modal has closed. */
  runner: any | null;
  setRunner: (next: any) => void;
  isOpen: boolean;
  isClosing: boolean;
  raceDay: string;
  onClose: () => void;
  /** The runner as the route saved it, for the table to fold into the row. */
  onSaved: (saved: any) => void;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [isSaving, setIsSaving] = useState(false);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<RunnerAddressField, string>>>({});

  const address: RunnerAddress = {
    addressProvince: runner?.addressProvince ?? '',
    addressCity: runner?.addressCity ?? '',
    addressBarangay: runner?.addressBarangay ?? '',
    addressStreet: runner?.addressStreet ?? '',
  };

  const changeAddress = (patch: Partial<RunnerAddress>) => {
    setRunner({ ...runner, ...patch });
    // A field's error goes once it is touched, and so do the ones its change
    // cleared: a new province empties the city and barangay.
    setAddressErrors(current => {
      const next = { ...current };
      for (const field of Object.keys(patch) as RunnerAddressField[]) delete next[field];
      return next;
    });
  };

  const close = () => {
    setAddressErrors({});
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runner) return;

    // Checked here so the missing part is marked where it sits; the route
    // checks again and names it in its refusal for any other client.
    if (addressStarted(address)) {
      const problems = runnerAddressProblems(address);
      if (Object.keys(problems).length > 0) {
        setAddressErrors(problems);
        const first = RUNNER_ADDRESS_FIELDS.find(field => problems[field]);
        document.getElementById(`edit-runner-address-${first?.replace('address', '').toLowerCase()}`)?.focus();
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/runners/${runner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runner),
      });

      if (res.ok) {
        onSaved(await res.json());
        close();
      } else {
        // The route's own words, not a generic refusal: an email address that
        // would never deliver or an unfinished home address each say which
        // field, and "Failed to update runner" would leave staff guessing.
        const { error } = await res.json().catch(() => ({ error: '' }));
        alert({
          variant: 'error',
          title: 'Runner Not Saved',
          message: error || 'The runner could not be updated. Please try again.',
        });
      }
    } catch (err) {
      console.error(err);
      alert({
        variant: 'error',
        title: 'Runner Not Saved',
        message: 'Something went wrong while updating this runner. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-registrant-title"
        className={`t-modal admin-modal-panel w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-center gap-4 shrink-0">
          <h3 id="edit-registrant-title" className="text-xl font-semibold text-primary">Edit Registrant</h3>
          <button
            onClick={close}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto">
          {runner && (
            <form id="edit-runner-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* One column below `sm`. The fields wear the admin's own
                  .form-label / .form-input, the pair AdminSelect wears, so
                  Gender sits among them as one of them — and .form-input is
                  16px, so a phone never zooms into a field. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-runner-first-name">First Name</label>
                  <input
                    id="edit-runner-first-name"
                    type="text"
                    required
                    value={runner.firstName || ''}
                    onChange={e => setRunner({...runner, firstName: upperCaseAsTyped(e.target.value)})}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-runner-last-name">Last Name</label>
                  <input
                    id="edit-runner-last-name"
                    type="text"
                    required
                    value={runner.lastName || ''}
                    onChange={e => setRunner({...runner, lastName: upperCaseAsTyped(e.target.value)})}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-runner-email">Email</label>
                  <input
                    id="edit-runner-email"
                    type="email"
                    required
                    value={runner.email || ''}
                    onChange={e => setRunner({...runner, email: e.target.value})}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-runner-phone">Phone</label>
                  <input
                    id="edit-runner-phone"
                    type="text"
                    inputMode="tel"
                    required
                    value={runner.phone || ''}
                    onChange={e => setRunner({...runner, phone: e.target.value})}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Uppercased on read as well as on write: rows created
                    before gender was stored uppercase still hold "Male",
                    and a value matching no option would silently show the
                    wrong one. */}
                <AdminSelect
                  label="Gender"
                  value={(runner.gender || '').toUpperCase()}
                  options={GENDER_OPTIONS}
                  listboxLabel="Gender"
                  onChange={gender => setRunner({...runner, gender})}
                />
                {/* Today back a century, the reach of the wizard's
                    BirthdatePicker: a birthdate is never in the future. */}
                <AdminDatePicker
                  id="edit-runner-birthdate"
                  label="Birthdate"
                  className="min-w-0"
                  max={today()}
                  min={`${Number(today().slice(0, 4)) - 100}-01-01`}
                  value={runner.birthdate || ''}
                  placeholder="Select the birthdate"
                  dialogLabel="Choose the birthdate"
                  onChange={birthdate => setRunner({...runner, birthdate})}
                />
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-runner-size">Shirt Size</label>
                  {/* Free text with suggestions rather than AdminSelect: a
                      package with no shirt leaves it blank. */}
                  <input
                    id="edit-runner-size"
                    type="text"
                    list="shirt-size-options"
                    value={runner.singletSize || ''}
                    onChange={e => setRunner({...runner, singletSize: e.target.value})}
                    placeholder="Blank if no shirt in this package"
                    className="form-input"
                  />
                  <datalist id="shirt-size-options">
                    {SHIRT_SIZES.map(size => <option key={size} value={size} />)}
                  </datalist>
                </div>
                <div className="form-group sm:col-span-2">
                  <label className="form-label" htmlFor="edit-runner-community">Running Community</label>
                  <input
                    id="edit-runner-community"
                    type="text"
                    value={runner.runningCommunity || ''}
                    onChange={e => setRunner({...runner, runningCommunity: upperCaseAsTyped(e.target.value)})}
                    placeholder="INDEPENDENT RUNNER"
                    className="form-input"
                  />
                </div>
              </div>

              {/* RUNNER_ADDRESS_PLAN.md Batch 3. Optional here, unlike in the
                  wizard: rows from before it was collected have none. */}
              <div className="pt-4 border-t border-[var(--dash-border)]">
                <h4 className="text-primary font-medium mb-1">Home Address</h4>
                <p className="text-xs text-[var(--text-muted)] mt-0 mb-4">
                  {runner.deliverySplit
                    ? "This order ships each kit to its runner's home, so this is also where this kit is delivered."
                    : 'Where the runner lives. Leave all four blank if it is not known.'}
                </p>
                <RunnerAddressEditor value={address} onChange={changeAddress} errors={addressErrors} />
              </div>

              <div className="pt-4 border-t border-[var(--dash-border)]">
                <h4 className="text-primary font-medium mb-4">Emergency Contact</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-runner-emergency-name">Contact Name</label>
                    <input
                      id="edit-runner-emergency-name"
                      type="text"
                      required
                      value={runner.emergencyContactName || ''}
                      onChange={e => setRunner({...runner, emergencyContactName: upperCaseAsTyped(e.target.value)})}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-runner-emergency-phone">Contact Phone</label>
                    <input
                      id="edit-runner-emergency-phone"
                      type="text"
                      inputMode="tel"
                      required
                      value={runner.emergencyContactPhone || ''}
                      onChange={e => setRunner({...runner, emergencyContactPhone: e.target.value})}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* The guardian, for a runner the birthdate above makes a
                  minor on race day, or one who already has a guardian on
                  file. Neither field is required: staff are correcting data
                  here, not registering, so a birthdate that makes someone a
                  minor warns and still saves (GUARDIAN_CONSENT_PLAN.md
                  Batch 4). The consent itself is signed on paper at kit
                  claiming when the form never collected it. */}
              {(() => {
                const editAge = ageOn(runner.birthdate || '', raceDay);
                const editIsMinor = needsGuardianConsent(runner.birthdate || '', raceDay);
                if (!editIsMinor && !runner.guardianName && !runner.guardianRelationship) {
                  return null;
                }
                return (
                  <div className="pt-4 border-t border-[var(--dash-border)]">
                    <h4 className="text-primary font-medium mb-4">Parent/Guardian</h4>
                    {editIsMinor && !runner.guardianConsentAt && (
                      <p role="status" className="flex items-start gap-2 text-sm text-[var(--status-warning)] mb-4 mt-0">
                        <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          This birthdate makes the runner {editAge} on race day, and no guardian consent was given
                          through the form. You can still save; have the parent or guardian sign the printed consent
                          at kit claiming.
                        </span>
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-runner-guardian-name">Guardian Name</label>
                        <input
                          id="edit-runner-guardian-name"
                          type="text"
                          value={runner.guardianName || ''}
                          onChange={e => setRunner({...runner, guardianName: upperCaseAsTyped(e.target.value)})}
                          placeholder={GUARDIAN_NAME_PLACEHOLDER}
                          className="form-input"
                        />
                      </div>
                      <AdminSelect
                        label="Relationship"
                        value={runner.guardianRelationship || ''}
                        options={GUARDIAN_RELATIONSHIP_OPTIONS}
                        placeholder={GUARDIAN_RELATIONSHIP_PLACEHOLDER}
                        listboxLabel="Relationship"
                        onChange={guardianRelationship => setRunner({...runner, guardianRelationship})}
                      />
                    </div>
                  </div>
                );
              })()}
            </form>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 shrink-0 bg-[var(--dash-sunken)]">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-runner-form"
            disabled={isSaving}
            className="px-6 py-2 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isSaving ? <BusyLabel>Saving</BusyLabel> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
