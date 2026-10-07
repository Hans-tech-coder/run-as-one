/**
 * One pacer as the Pacers screen holds it, and the name a row goes by. Shared
 * by the screen, its row actions (`use-pacer-actions.ts`) and the Add / Edit
 * forms, so none of them re-declares the shape.
 */
/** One pacer, as `pacers/page.tsx` hands it over. */
export type PacerRow = {
  id: string;
  code: string;
  assigneeName: string | null;
  /** The pacer's race bib, or null until staff enter it. */
  bibNumber: string | null;
  /** The group this pacer leads ("SUB1", "1:00"), or null until staff set it. */
  paceGroup: string | null;
  waiveAdminFee: boolean;
  /** ISO, or null while staff have not marked the code as sent. */
  codeSentAt: string | null;
  paused: boolean;
  usageCount: number;
  /**
   * The category this code is locked to. The name and distance are not repeated
   * here: the screen groups by this id against the `categories` it is given, so
   * a second copy could only ever disagree with the heading above the row.
   */
  categoryId: string | null;
  /** The order this pacer registered with, or null while the code is unclaimed. */
  order: { orderRef: string; status: string } | null;
};

export type PacerCategory = { id: string; name: string; distance: string | null };

/** How a row is named in a message: the pacer, or their code before they have a name. */
export function nameOf(pacer: PacerRow): string {
  return pacer.assigneeName || pacer.code;
}
