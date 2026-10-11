/**
 * What a result's status may be, and how it reads. Only FINISHED is ranked
 * (`results-ranking.ts`): a DNF, DNS or DQ row keeps its time and its row but
 * holds no place, and the runners behind it move up. An upload stores
 * FINISHED for every row (the sheet has no status column); staff set another
 * from *Edit details* on the Results workspace (RESULTS_ROW_ACTIONS_PLAN.md
 * Batch 3, owner's Q1), for a disqualification after the race.
 */

export const RESULT_STATUSES = ['FINISHED', 'DNF', 'DNS', 'DQ'] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  FINISHED: 'Finished',
  DNF: 'Did not finish (DNF)',
  DNS: 'Did not start (DNS)',
  DQ: 'Disqualified (DQ)',
};

/** The short word on a badge: "DQ", or "Finished". */
export function resultStatusBadge(status: string): string {
  return status === 'FINISHED' ? 'Finished' : status;
}

export function isResultStatus(value: unknown): value is ResultStatus {
  return typeof value === 'string' && (RESULT_STATUSES as readonly string[]).includes(value);
}
