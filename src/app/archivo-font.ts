import { Archivo } from "next/font/google";

/**
 * The Paper look's one family (site.css, docs/conventions.md §9): Archivo with
 * its width axis, which carries the headings instead of a heavy weight.
 *
 * One definition, imported by the three frames that draw Paper — `SiteFrame`
 * (every public page), `admin/AuthPaperFrame` (the sign-in pages) and
 * `admin/DashboardShell` (the dashboard, since its Paper pass 2026-11-24) —
 * so all share one generated family and its files.
 */
export const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });
