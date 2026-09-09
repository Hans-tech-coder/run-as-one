// Timing systems export finishing times down to tenths of a second
// ("1:18:56.9"). The fraction is precision no runner reads and it breaks the
// look of the big monospaced time on the results pages, so nothing displays it:
// every screen, table and certificate prints the whole-second time instead. The
// uploaded value is stored untouched — this is a display rule, not a data one.
export function toWholeSeconds(time: string): string;
export function toWholeSeconds(time: string | null | undefined): string | null;
export function toWholeSeconds(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.split('.')[0];
}
