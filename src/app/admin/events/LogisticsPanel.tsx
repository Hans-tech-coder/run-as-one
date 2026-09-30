'use client';

import EventProvinceField from './EventProvinceField';
import { inferProvince } from '@/lib/ph-address';

/**
 * The "Logistics & Race Kits" panel, shared by the create and edit forms.
 *
 * Pickup and delivery are each a switch. Delivery used to be "on" whenever a
 * zone fee was above 0, so turning it off meant zeroing both fees by hand; the
 * switch replaces that. The database still has no delivery flag — a zone with
 * a 0 fee is not offered at checkout — so `deliveryFees()` is what turns the
 * switch into the fees that are saved. Switching delivery off keeps the typed
 * fees on screen state, so switching it back on restores them.
 */

export type LogisticsDraft = {
  logisticsPickup: boolean;
  pickupLocation: string;
  pickupSchedule: string;
  province: string;
  location: string;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
};

type FeeDraft = Pick<LogisticsDraft, 'logisticsDeliveryFeeInside' | 'logisticsDeliveryFeeOutside'>;

/** Delivery is on for a saved event when either zone carries a fee. */
export function deliveryOffered(fees: FeeDraft): boolean {
  return fees.logisticsDeliveryFeeInside > 0 || fees.logisticsDeliveryFeeOutside > 0;
}

/** The fees to save: both zeroed while the delivery switch is off. */
export function deliveryFees(on: boolean, fees: FeeDraft): FeeDraft {
  return on
    ? { logisticsDeliveryFeeInside: fees.logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside: fees.logisticsDeliveryFeeOutside }
    : { logisticsDeliveryFeeInside: 0, logisticsDeliveryFeeOutside: 0 };
}

/** Delivery switched on with no zone priced would save as "no delivery". */
export function deliveryProblem(on: boolean, fees: FeeDraft): string | null {
  return on && !deliveryOffered(fees)
    ? 'Delivery is on but neither zone has a fee. Enter a fee for at least one zone, or turn delivery off.'
    : null;
}

function Switch({ on, label, hint, onToggle }: { on: boolean; label: string; hint: string; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="admin-switch-row">
      <span className="admin-switch-label">
        <span>{label}</span>
        <span className="admin-switch-hint">{hint}</span>
      </span>
      <span className="t-toggle admin-switch" data-on={on} aria-hidden="true">
        <span className="t-toggle-thumb" />
      </span>
    </button>
  );
}

export default function LogisticsPanel({
  draft,
  onChange,
  deliveryOn,
  onDeliveryChange,
  deliveryError,
}: {
  draft: LogisticsDraft;
  onChange: (patch: Partial<LogisticsDraft>) => void;
  deliveryOn: boolean;
  onDeliveryChange: (on: boolean) => void;
  deliveryError: string | null;
}) {
  const zoneFromAddress = Boolean(draft.province || inferProvince(draft.location));
  const invalid = Boolean(deliveryError);

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Logistics & Race Kits</h2>
      </div>
      <div className="admin-panel-content">
        <div className="form-grid">
          <div className="form-group form-group-full">
            <Switch
              on={draft.logisticsPickup}
              label="On-site pickup"
              hint="Runners collect their race kit for free."
              onToggle={() => onChange({ logisticsPickup: !draft.logisticsPickup })}
            />
          </div>
          {draft.logisticsPickup && (
            <>
              <div className="form-group form-group-full">
                <label className="form-label">
                  Pickup Location <span className="text-xs opacity-70">- where runners collect their kit</span>
                </label>
                <input
                  type="text"
                  value={draft.pickupLocation}
                  onChange={e => onChange({ pickupLocation: e.target.value })}
                  className="form-input"
                  placeholder="e.g. Toby's Sports, SM City Clark, 2nd Floor"
                />
              </div>
              <div className="form-group form-group-full">
                <label className="form-label">
                  Pickup Schedule <span className="text-xs opacity-70">- when that window is open</span>
                </label>
                <input
                  type="text"
                  value={draft.pickupSchedule}
                  onChange={e => onChange({ pickupSchedule: e.target.value })}
                  className="form-input"
                  placeholder="e.g. March 12-14, 10AM to 7PM"
                />
              </div>
              {/* Both are optional because a venue is usually settled
                  weeks before the hours are. Left blank, the wizard says
                  the organizer will confirm — never a blank line. */}
            </>
          )}

          <div className="form-group form-group-full">
            <Switch
              on={deliveryOn}
              label="Delivery"
              hint={deliveryOn ? 'Race kits are shipped to the runner for a fee.' : 'Off — runners can only pick up their kit.'}
              onToggle={() => onDeliveryChange(!deliveryOn)}
            />
          </div>
          {deliveryOn && (
            <>
              <EventProvinceField
                value={draft.province}
                location={draft.location}
                onChange={province => onChange({ province })}
              />
              <div className="form-group">
                <label className="form-label" htmlFor="delivery-fee-inside">
                  Inside Province (₱) <span className="text-xs opacity-70">- 0 hides this zone</span>
                </label>
                <input
                  id="delivery-fee-inside"
                  type="number" inputMode="decimal"
                  value={draft.logisticsDeliveryFeeInside}
                  onChange={e => onChange({ logisticsDeliveryFeeInside: Number(e.target.value) })}
                  className="form-input"
                  min={0}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? 'delivery-fee-error' : undefined}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="delivery-fee-outside">
                  Outside Province (₱) <span className="text-xs opacity-70">- 0 hides this zone</span>
                </label>
                <input
                  id="delivery-fee-outside"
                  type="number" inputMode="decimal"
                  value={draft.logisticsDeliveryFeeOutside}
                  onChange={e => onChange({ logisticsDeliveryFeeOutside: Number(e.target.value) })}
                  className="form-input"
                  min={0}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? 'delivery-fee-error' : undefined}
                />
              </div>
              {deliveryError ? (
                <p id="delivery-fee-error" role="alert" className="form-group-full text-sm font-medium text-[var(--status-danger)] m-0">
                  {deliveryError}
                </p>
              ) : (
                <p className="form-group-full text-xs text-secondary">
                  {zoneFromAddress ? "The runner's address decides the zone." : 'Runners pick their own zone at checkout.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
