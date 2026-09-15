import React from 'react';
import { Check, X } from 'lucide-react';

/**
 * An inline edit, as a card holds it.
 *
 * A table edits a value where it stands: a narrow box and two text links
 * squeezed into the cell (the super admin's admin fee and club rename). That
 * does not survive a thumb. On a card the same edit opens as its own block —
 * a labelled full-width field at 16px, so iOS does not zoom, with Save and
 * Cancel under it at 44px — in `AdminCardList`'s `expanded` slot, under the
 * value it is changing, so the old value is still in sight while the new one
 * is typed.
 *
 * It holds no state. The draft and "which row is being edited" live in the
 * page, the same pair the table's cell reads, so an edit started on a phone is
 * still open when the screen is turned past `lg`. For the same reason nothing
 * here carries an `id`: the table is rendered beside the cards. The label
 * wraps the field instead of pointing at it.
 */

export type AdminCardEditProps = {
  /** The field's visible label, e.g. "New admin fee". */
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  /** A unit drawn inside the box, before the value (₱). */
  prefix?: string;
  type?: 'text' | 'number';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
};

export default function AdminCardEdit({
  label,
  value,
  onChange,
  onSave,
  onCancel,
  saving = false,
  prefix,
  type = 'text',
  inputMode,
  placeholder,
}: AdminCardEditProps) {
  return (
    <form
      className="admin-card-edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="admin-card-edit-label">
        <span>{label}</span>
        <span className="admin-card-edit-box">
          {prefix && (
            <span className="admin-card-edit-prefix" aria-hidden="true">
              {prefix}
            </span>
          )}
          <input
            type={type}
            inputMode={inputMode}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
            // The press that opened the edit is the intent to type. A hidden
            // copy (the table's, below `lg`) cannot take focus, so only the
            // one on screen does.
            autoFocus
            className={`form-input admin-card-edit-input ${prefix ? 'has-prefix' : ''}`}
          />
        </span>
      </label>

      <div className="admin-card-edit-actions">
        <button type="submit" className="btn-filter is-primary" disabled={saving}>
          <Check size={16} aria-hidden="true" />
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-filter" onClick={onCancel}>
          <X size={16} aria-hidden="true" />
          Cancel
        </button>
      </div>
    </form>
  );
}
