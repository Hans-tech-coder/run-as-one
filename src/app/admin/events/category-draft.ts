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
  /** Stop selling this option; runners already in it stay. Saved as `closed`. */
  closed?: boolean;
  /**
   * The cheaper Bib + Medal version, edited inside its parent's row although it
   * is its own Category row. Absent until the organizer first switches it on.
   */
  bibMedal?: BibMedalDraft;
}

export interface BibMedalDraft {
  /** On means on sale. A saved option that was switched off loads as off. */
  enabled: boolean;
  /** Pesos, like the parent's. Blank until typed, so 0 is never suggested. */
  price: number | '';
  slotLimit: number | '';
  inclusions: string;
  /**
   * When it goes on sale: Manila wall time as the date picker holds it,
   * `YYYY-MM-DDTHH:mm`. Blank means as soon as the event is saved.
   */
  opensOn: string;
  /** Present only for a saved option: what switching it off will do. */
  saved?: boolean;
  slotsTaken?: number;
}

export function blankBibMedal(): BibMedalDraft {
  return { enabled: true, price: '', slotLimit: '', inclusions: 'Race Bib\nFinisher Medal', opensOn: '' };
}

export function blankCategory(): CategoryDraft {
  return { name: '', distance: '', price: 0, imageUrl: '', inclusions: '', slotLimit: '' };
}
