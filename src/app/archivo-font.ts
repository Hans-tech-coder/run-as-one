import { Archivo } from "next/font/google";

/**
 * The Paper look's one family (site.css, docs/conventions.md §9): Archivo with
 * its width axis, which carries the headings instead of a heavy weight.
 *
 * One definition, imported by the two frames that draw Paper — `SiteFrame`
 * (every public page) and `admin/AuthPaperFrame` (the sign-in pages) — so both
 * share one generated family and its files. Neither is in the root layout, so
 * the dashboard never downloads it.
 */
export const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });
