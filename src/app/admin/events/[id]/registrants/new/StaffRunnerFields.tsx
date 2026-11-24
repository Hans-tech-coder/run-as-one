"use client";

import React from 'react';
import { Trash2 } from 'lucide-react';
import AdminSelect from '../../../../AdminSelect';
import AdminDatePicker from '../../../../AdminDatePicker';
import AdminSwitch from '../../../../AdminSwitch';
import FieldError from '@/components/ui/FieldError';
import RunnerAddressEditor from '../RunnerAddressEditor';
import { upperCaseAsTyped } from '@/lib/text-case';
import { today } from '@/lib/event-schedule';
import { formatPesos } from '@/lib/money';
import { SHIRT_SIZE_CHART, shouldAskShirtSize } from '@/lib/shirt-size';
import { sellsPackages } from '@/lib/event-type';
import { addOnChoices } from '@/lib/add-ons';
import {
  GUARDIAN_NAME_PLACEHOLDER,
  GUARDIAN_RELATIONSHIPS,
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIP_PLACEHOLDER,
  ageOn,
  needsGuardianConsent,
} from '@/lib/minor-consent';
import type { RunnerAddress, RunnerAddressField } from '@/lib/runner-address';
import { runnerFieldId, type RunnerErrors, type RunnerField } from '@/app/events/[slug]/register/validation';
import type { StaffEvent, StaffRunner } from './staff-registration';

/**
 * One runner on the staff registration form (STAFF_REGISTRATION_PLAN.md step
 * 4): the field set of `RunnerEditModal` — the same AdminSelect,
 * AdminDatePicker and RunnerAddressEditor — plus the category, the add-ons
 * and, for a runner 12 or under on race day, the guardian. Every field id is
 * `runnerFieldId(index, field)`, so the error summary can send the caret to it.
 */

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'MALE' },
  { value: 'FEMALE', label: 'FEMALE' },
] as const;

const SIZE_OPTIONS = SHIRT_SIZE_CHART.map(row => ({
  value: row.size,
  label: row.size,
  hint: `${row.width}″ W × ${row.length}″ L`,
}));

const RELATIONSHIP_OPTIONS = GUARDIAN_RELATIONSHIPS.map(value => ({
  value,
  label: GUARDIAN_RELATIONSHIP_LABELS[value],
}));

/** The id RunnerAddressEditor gives an address field, for focusing it. */
export function addressFieldId(index: number, field: RunnerAddressField): string {
  return `runner-${index}-address-${field.replace('address', '').toLowerCase()}`;
}

/** Where the caret goes for a field's error. */
export function staffFieldId(index: number, field: RunnerField): string {
  return field.startsWith('address') ? addressFieldId(index, field as RunnerAddressField) : runnerFieldId(index, field);
}

function TextField({
  index,
  field,
  label,
  value,
  error,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  upper = false,
  optional = false,
}: {
  index: number;
  field: RunnerField | 'medicalConditions' | 'runningCommunity';
  label: string;
  value: string;
  error?: string;
  onChange: (next: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
  upper?: boolean;
  optional?: boolean;
}) {
  const id = runnerFieldId(index, field as RunnerField);
  const errorId = `${id}-error`;
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
        {optional && <span className="text-xs opacity-70"> - optional</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(upper ? upperCaseAsTyped(e.target.value) : e.target.value)}
        className="form-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export default function StaffRunnerFields({
  index,
  count,
  runner,
  event,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  count: number;
  runner: StaffRunner;
  event: StaffEvent;
  errors: RunnerErrors;
  onChange: (patch: Partial<StaffRunner>) => void;
  onRemove: () => void;
}) {
  const packages = sellsPackages(event);
  const askSize = shouldAskShirtSize(event.categories, runner.categoryId);
  const minor = needsGuardianConsent(runner.birthdate, event.date);
  const addOns = runner.categoryId
    ? event.addOns.filter(item => item.categoryIds.length === 0 || item.categoryIds.includes(runner.categoryId))
    : [];
  const address: RunnerAddress = {
    addressProvince: runner.addressProvince,
    addressCity: runner.addressCity,
    addressBarangay: runner.addressBarangay,
    addressStreet: runner.addressStreet,
  };
  const addressErrors: Partial<Record<RunnerAddressField, string>> = {
    addressProvince: errors.addressProvince,
    addressCity: errors.addressCity,
    addressBarangay: errors.addressBarangay,
    addressStreet: errors.addressStreet,
  };
  const sameAsOptions = [
    { value: 'own', label: 'Their own address' },
    ...Array.from({ length: index }, (_, other) => ({ value: String(other), label: `Same as Runner ${other + 1}` })),
  ];

  const pick = (addOnId: string) => runner.addOns.find(p => p.addOnId === addOnId);
  const setPick = (addOnId: string, patch: Partial<{ option: string; quantity: number }> | null) => {
    const others = runner.addOns.filter(p => p.addOnId !== addOnId);
    if (patch === null) return onChange({ addOns: others });
    const current = pick(addOnId) ?? { addOnId, option: '', quantity: 1 };
    onChange({ addOns: [...others, { ...current, ...patch }] });
  };

  return (
    <section className="admin-panel" aria-labelledby={`runner-${index}-title`}>
      <div className="admin-panel-header">
        <h2 id={`runner-${index}-title`} className="admin-panel-title">
          Runner {index + 1}
          {index === 0 && count > 1 && <span className="text-sm font-normal text-secondary"> · order contact</span>}
        </h2>
        {count > 1 && (
          <button type="button" onClick={onRemove} className="btn-cancel inline-flex items-center gap-1.5 min-h-11">
            <Trash2 size={16} aria-hidden="true" />
            Remove Runner {index + 1}
          </button>
        )}
      </div>

      <div className="admin-panel-content flex flex-col gap-6">
        <AdminSelect
          id={runnerFieldId(index, 'categoryId')}
          label={packages ? 'Package' : 'Race Category'}
          listboxLabel={packages ? 'Packages' : 'Race categories'}
          value={runner.categoryId}
          placeholder={packages ? 'Choose a package' : 'Choose a category'}
          options={event.categories.map(category => ({
            value: category.id,
            label: category.name,
            hint: formatPesos(category.price),
          }))}
          error={errors.categoryId}
          // Add-ons not open to the new category go; the price follows.
          onChange={categoryId =>
            onChange({
              categoryId,
              addOns: runner.addOns.filter(p => {
                const item = event.addOns.find(a => a.id === p.addOnId);
                return item && (item.categoryIds.length === 0 || item.categoryIds.includes(categoryId));
              }),
            })
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField index={index} field="firstName" label="First Name" value={runner.firstName} error={errors.firstName} upper onChange={firstName => onChange({ firstName })} />
          <TextField index={index} field="lastName" label="Last Name" value={runner.lastName} error={errors.lastName} upper onChange={lastName => onChange({ lastName })} />
          <TextField index={index} field="email" label="Email" type="email" value={runner.email} error={errors.email} onChange={email => onChange({ email })} />
          <TextField index={index} field="phone" label="Phone" inputMode="tel" placeholder="+639171234567" value={runner.phone} error={errors.phone} onChange={phone => onChange({ phone })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <AdminSelect
            id={runnerFieldId(index, 'gender')}
            label="Gender"
            listboxLabel="Gender"
            value={runner.gender}
            options={GENDER_OPTIONS}
            error={errors.gender}
            onChange={gender => onChange({ gender })}
          />
          <AdminDatePicker
            id={runnerFieldId(index, 'birthdate')}
            label="Birthdate"
            className="min-w-0"
            max={today()}
            min={`${Number(today().slice(0, 4)) - 100}-01-01`}
            value={runner.birthdate}
            placeholder="Select the birthdate"
            dialogLabel="Choose the Birthdate"
            error={errors.birthdate}
            onChange={birthdate => onChange({ birthdate })}
          />
          {askSize && (
            <AdminSelect
              id={runnerFieldId(index, 'singletSize')}
              label="Shirt Size"
              listboxLabel="Shirt sizes"
              value={runner.singletSize}
              options={SIZE_OPTIONS}
              placeholder="Select a size"
              error={errors.singletSize}
              onChange={singletSize => onChange({ singletSize })}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField index={index} field="runningCommunity" label="Running Community" optional upper placeholder="INDEPENDENT RUNNER" value={runner.runningCommunity} onChange={runningCommunity => onChange({ runningCommunity })} />
          <TextField index={index} field="medicalConditions" label="Medical Conditions" optional upper value={runner.medicalConditions} onChange={medicalConditions => onChange({ medicalConditions })} />
        </div>

        <div className="pt-4 border-t border-[var(--dash-border)]">
          <h3 className="text-primary font-medium mt-0 mb-4 text-base">Home Address</h3>
          {index > 0 && (
            <div className="mb-4 max-w-sm">
              <AdminSelect
                id={`runner-${index}-address-same`}
                label="Address"
                listboxLabel="Whose address"
                value={runner.addressSameAs === null ? 'own' : String(runner.addressSameAs)}
                options={sameAsOptions}
                onChange={next => onChange({ addressSameAs: next === 'own' ? null : Number(next) })}
              />
            </div>
          )}
          {runner.addressSameAs === null && (
            <RunnerAddressEditor
              idPrefix={`runner-${index}-address`}
              value={address}
              errors={addressErrors}
              onChange={patch => onChange(patch)}
            />
          )}
        </div>

        <div className="pt-4 border-t border-[var(--dash-border)]">
          <h3 className="text-primary font-medium mt-0 mb-4 text-base">Emergency Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField index={index} field="emergencyContactName" label="Contact Name" upper value={runner.emergencyContactName} error={errors.emergencyContactName} onChange={emergencyContactName => onChange({ emergencyContactName })} />
            <TextField index={index} field="emergencyContactPhone" label="Contact Phone" inputMode="tel" value={runner.emergencyContactPhone} error={errors.emergencyContactPhone} onChange={emergencyContactPhone => onChange({ emergencyContactPhone })} />
          </div>
        </div>

        {minor && (
          <div className="pt-4 border-t border-[var(--dash-border)]">
            <h3 className="text-primary font-medium mt-0 mb-1 text-base">Parent or Guardian</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0 mb-4">
              {runner.firstName || 'This runner'} is {ageOn(runner.birthdate, event.date)} on race day, so a parent or
              guardian has to agree, as on the website.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField index={index} field="guardianName" label="Guardian Name" upper placeholder={GUARDIAN_NAME_PLACEHOLDER} value={runner.guardianName} error={errors.guardianName} onChange={guardianName => onChange({ guardianName })} />
              <AdminSelect
                id={runnerFieldId(index, 'guardianRelationship')}
                label="Relationship"
                listboxLabel="Relationship"
                value={runner.guardianRelationship}
                options={RELATIONSHIP_OPTIONS}
                placeholder={GUARDIAN_RELATIONSHIP_PLACEHOLDER}
                error={errors.guardianRelationship}
                onChange={guardianRelationship => onChange({ guardianRelationship })}
              />
            </div>
            <label
              htmlFor={runnerFieldId(index, 'guardianConsent')}
              className="mt-4 flex items-start gap-3 rounded-control border border-[var(--dash-border)] bg-[var(--ink-02)] px-4 py-3 cursor-pointer min-h-11"
            >
              <input
                id={runnerFieldId(index, 'guardianConsent')}
                type="checkbox"
                checked={runner.guardianConsent}
                onChange={e => onChange({ guardianConsent: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-invalid={errors.guardianConsent ? true : undefined}
              />
              <span className="text-sm text-primary">The parent or guardian agreed for this runner (over Messenger or a call).</span>
            </label>
            <FieldError id={`${runnerFieldId(index, 'guardianConsent')}-error`} message={errors.guardianConsent} />
          </div>
        )}

        {addOns.length > 0 && (
          <div className="pt-4 border-t border-[var(--dash-border)]">
            <h3 className="text-primary font-medium mt-0 mb-4 text-base">
              Add-ons <span className="text-xs font-normal opacity-70">- optional</span>
            </h3>
            <div className="flex flex-col gap-3" id={runnerFieldId(index, 'addOns')} tabIndex={-1}>
              {addOns.map(item => {
                const picked = pick(item.id);
                const choices = addOnChoices(item);
                return (
                  <div key={item.id} className="flex flex-col gap-3">
                    <AdminSwitch
                      on={Boolean(picked)}
                      label={`${item.name} · ${formatPesos(item.price)}`}
                      hint={picked ? 'Added to this runner.' : 'Not added.'}
                      onToggle={() => setPick(item.id, picked ? null : {})}
                    />
                    {picked && (choices.length > 0 || item.maxPerRunner > 1) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-1">
                        {choices.length > 0 && (
                          <AdminSelect
                            label="Option"
                            listboxLabel={`${item.name} options`}
                            value={picked.option}
                            options={choices.map(choice => ({ value: choice, label: choice }))}
                            placeholder="Choose one"
                            onChange={option => setPick(item.id, { option })}
                          />
                        )}
                        {item.maxPerRunner > 1 && (
                          <AdminSelect
                            label="Quantity"
                            listboxLabel={`${item.name} quantity`}
                            value={String(picked.quantity)}
                            options={Array.from({ length: item.maxPerRunner }, (_, n) => ({ value: String(n + 1), label: String(n + 1) }))}
                            onChange={quantity => setPick(item.id, { quantity: Number(quantity) })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <FieldError id={`${runnerFieldId(index, 'addOns')}-error`} message={errors.addOns} />
          </div>
        )}
      </div>
    </section>
  );
}
