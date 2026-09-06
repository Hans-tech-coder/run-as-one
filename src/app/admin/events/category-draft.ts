/**
 * One row of the categories editor, in the shape the admin forms work in.
 *
 * Races and fun runs both edit this: a race fills `distance` and leaves
 * `imageUrl` empty, a fun run does the reverse. Keeping one draft type means
 * switching an event's type never has to reshape the state.
 *
 * `price` is PESOS here, not centavos — this is form state, and the API
 * converts on the way in. `inclusions` is likewise the raw text of the editor,
 * one item per line; asInclusions() turns it into the stored array. `id` is
 * absent for a row the organizer just added and present for one loaded from the
 * database, which is how the PUT route tells an update from a create.
 */
export interface CategoryDraft {
  id?: string;
  name: string;
  distance: string;
  price: number;
  imageUrl?: string;
  inclusions?: string;
  /**
   * How many runners this option may take. An empty string is the form's way
   * of saying "no cap" — a number input cannot hold null, and 0 would mean
   * something different — and asSlotLimit() turns it into the null the column
   * stores. `slotsTaken` is read-only, filled in by the edit form from the
   * server so an organizer capping an option can see what is already in it.
   */
  slotLimit?: number | '';
  slotsTaken?: number;
}

export function blankCategory(): CategoryDraft {
  return { name: '', distance: '', price: 0, imageUrl: '', inclusions: '', slotLimit: '' };
}
