<!-- Part of the Run As One project guide. This file is §6, the routes; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 6. Routes

### Public
| Path | What it is |
| --- | --- |
| `/` | Home. Hero + up to 6 **upcoming** events, soonest first. Events are the point of this page. The hero stands under an animated brand-coloured dot arch — see `HeroArcBackground` in §9 |
| `/events` | Full upcoming listing |
| `/events/[slug]` | Event detail and registration entry point. **Redirects to `/results/[slug]` once the race is over and its times are uploaded** — see the section rule below. A finished race with no times yet stays here and says so. Carries `PromoHighlights`: the automatic promotions running on this race, named before the runner starts. Codes are never listed there — those are the organizer's to hand out. **Each row of the Categories / Packages sidebar is a link into the wizard with that option already chosen** (`registerPath(event, cat)`), wearing Register Now's chevron and its `LinkPendingIcon`. Only while Register Now itself shows: a full option, or every option while the race is paused, not yet open, full or over, stays plain text. **A race whose sign-ups have not opened yet** puts *Registration Opens Soon* and the date where Register Now stands, and its listing card wears an `Opens Oct 5` chip with a *View Event* button instead of the gradient one — the race is listed early on purpose, so the card and the page both stay readable |
| `/events/[slug]/register` | The wizard — `RegistrationWizardClient` (ONLINE: 3 steps, plus step 4 for proof when the runner picks bank transfer) or `BankTransferWizardClient` (3 steps). Steps: **1** runners & categories, **2** logistics, **3** checkout/payment, **4** proof upload. **`?category=`** preselects the first runner's option (`initialCategoryId` on both wizards); the page resolves it against this event and its slot counts, so an unknown or since-filled option is not preselected. **With no usable `?category=`, an event with only one option still open (`soleOpenCategory`) opens with that one already chosen** — a single-distance race, or one whose other options are full — and `CategoryPicker` then heads it "Your Category" / "Your Package" with a line saying it is the only one open, instead of "Select …" over a choice of one. Two or more open options wait for the runner. Runners added later inherit runner 1's choice as before. The **proof upload on step 4 takes a PDF as well as a photo** — a bank confirmation arrives as one — and both its `accept` attribute and the hint under the drop zone are built from `uploads.ts` rather than typed out, so what the picker offers is what the server will take. **When the order comes to ₱0 both wizards drop their payment half** (`isFreeOrder`, `PACER_DISCOUNT_PLAN.md` Batch 2): the last step is headed *Review & Confirm*, the online wizard hides every payment method (and can therefore never reach step 4, so the counter stays at three), the bank-transfer wizard hides the bank panel, the drop zone and the reference-number box, the total box reads *Nothing to Pay* with a line saying so rather than leaving a runner to infer it from a zero, and the button reads **Complete registration**. A waived admin fee is shown **struck through beside ₱0.00**, not removed: the pacer was told the fee was covered, so the line that says so has to stay visible — and no transaction fee is computed or shown, because there is nothing for it to be a share of. Hidden rather than disabled throughout: a bank panel on an order worth nothing would have a pacer hunting for a payment to make. The bank wizard's success screen reads the **saved** registration (`status === 'PAID' && totalAmount === 0`) rather than its own state, which is back at defaults after the round trip, and then says *Registration Confirmed* / *Total Paid* instead of promising a verification that will never come. Both success screens read the stored total with `??`, never `||`, or a free order's ₱0 would be thrown away for a freshly-defaulted local figure. |
| `/results` | Finished-event landing, most recent first — the same `EventGrid` card as `/events`, with `action="results"` |
| `/results/[slug]` | Winners board. Each division is one `DivisionPanel` (the male and female podiums differ only by accent). **On a phone a podium row is two lines** — the name gets the full width beside the medal, the bib and time share the line under it — because on one line the medal, gaps and time left the name ~70px and every winner read "DANIEL…"; from `sm` the time returns to the right edge. The category heading always reads `{name} ({distance}) Winners` — "10K (10KM)" included, so every category reads alike — and carries no icons; a package, having no distance, drops the brackets |
| `/results/[slug]/full` | Full searchable table; category filter via query param. **The table shows from `lg` only**; below that it is cards — one column on a phone, two on a tablet — because eight columns need ~850px and between `md` and `lg` the table overflowed behind a hidden scrollbar, cutting off Actions. A row's **No.** is its place in the list being looked at (`positionOf`: page start + index), never `row.index`, which is its place in the whole sheet and numbered page 3 from 41. A count line says how many finishers match. The pager has first/last as well as prev/next, 40px targets, and **turning the page scrolls the top of the list back under the navbar** when it has scrolled away. The two filter menus split the row on a phone, the second opening from its right edge; both, and the rows-per-page menu, close on an outside press or Escape (`useDismissableMenu`). The search field is 16px on a phone — see §9. **A row's Actions menu opens the e-certificate in place** (`useECertificate`, §5): *View E-Cert* used to link to the runner's page with `?cert=1`, costing the reader their place in the list; now the item reads "Generating…" until the certificate is drawn, then the menu closes and the dialog opens over the leaderboard. *View Details* still goes to the runner's page |
| `/results/[slug]/[bib]` | One runner's result, addressed by **the number they wore** — `/results/bizrun-v2-0/1042`, not a 25-character cuid — because this is the link a runner shares and should be able to read, recognise and even type. `@@unique([eventId, bibNumber])` is what makes a bib a valid address. The segment is read as a bib first and as a row cuid only if that finds nothing, so every cuid link already sent to a runner still resolves and is then redirected to its bib address. Build these with `runnerResultPath(event, result)`. Plus `ECertificateGenerator` — the button, over the shared `e-certificate.ts` / `ECertificate.tsx` (§5); `?cert=1` still opens the certificate on arrival. Container is `max-w-5xl`, wide enough that the four analytics tiles get a real column each — they go four across from **860px**, the width at which a tile can hold "Overall Rank" on one line, and sit two across below that. The hero splits into name + time panel at `md`, where the name column is at its narrowest (~300px); the name sizes are tuned against that width so no word ever has to break in half. The card is built to hold **any** name: the time panel never shrinks and the name's display size steps down as the name gets longer (see §9), so a 30-character name and a 9-character one produce the same card. The certificate shrinks the drawn name to fit the page for the same reason. The *View E-Certificate* button is full-width on phones and a centred `w-fit` on desktop. The card's padding and the tiles' step down on a phone (and again under 360px) so every tile label holds one line down to 320px; the gender tile reads "in Male division", not "in M". **Back to Leaderboard** opens `/full`, where the search is — it used to say "Back to Search" and open the winners board. **The certificate opens as a bottom sheet on a phone** and a centred dialog from `sm`, closes on Escape and locks the page's scroll. The PDF is previewed inline (`#view=Fit`) only where `navigator.pdfViewerEnabled` and a fine pointer both hold — Chrome on Android paints an empty grey box and iOS Safari a cropped corner — and a phone instead gets a summary of what the certificate says, with the download as the way to see it. *Share Result* uses the share sheet where there is one and otherwise copies the link and raises a toast |
| `/feedback` | **The one place a runner or an organizer tells us about the app itself** — a broken page, something that could be easier, something they wish it could do. A page rather than a floating widget on purpose: a persistent bubble covers the bottom-right corner, which on a phone is where the wizard's Next button and the leaderboard's pager live, and the home page is meant to showcase events rather than argue with a badge. So the entry points are **placed**: the footer's Legal & Support column, on every public page, and the button beside *Return to Homepage* on both registration success screens — the one moment we know somebody has just used the app end to end. The form asks the kind first and **the prompt in the message box changes with it** (`FEEDBACK_KIND_COPY`, §5); name and email are optional and say so, because a required contact field is how a feedback form ends up collecting nothing. `?from=` carries the page the sender came from, validated by `asSitePath` and **shown to them** rather than collected quietly, along with the browser version. The reveal is the stagger (`.t-stagger`), and the thank-you replaces the form through the same motion rather than as a jump cut. The support address stays on the page under the form: some things need a screenshot, and a form is the wrong shape for those |
| `/coming-soon`, `/privacy`, `/terms`, `not-found` | Real designed pages — see the no-dead-links rule in §8. Nothing links to `/coming-soon` any more (the footer hides a channel with no link); it stays for addresses already shared, and `?channel=Facebook` **redirects to the saved link** once there is one |

**A race lives in one section at a time, and the URL says which.** While a race
can still be entered it is under `/events`. The moment its organizer uploads
times it moves wholesale to `/results` — it drops off the `/events` listing, and
`/events/[slug]` itself redirects to `/results/[slug]`. The reason is that the
address should tell a runner which part of the site they are in, judged by what
the page actually shows them: nobody opening a finished race is looking at an
event any more, they are reading a result. A finished race whose times are *not*
up yet is the one in-between case — it is in neither listing, and `/events/[slug]`
keeps it, saying registration is closed and the times are still coming.

Old `/events/[slug]/results...` URLs are permanent (308) redirects in
`next.config.ts` rather than deleted routes, because they are already out in the
world. They pass the event segment straight through, so a stale **cuid** link
still resolves: the destination reads either form via `eventByParam` and sends
the visitor on to the canonical slug via `canonicalResultsPath`
(`src/lib/event-slug.ts`). Build results links with `resultsPath(event)` from
that module rather than writing the path out by hand.

**A runner is addressed by their bib, not by a row id.** `runnerResultPath`
(same module) spells `/results/[slug]/[bib]`. The one exception it carries is a
results sheet imported with a blank bib column — the importer does not reject
those — and such a row falls back to its cuid, because the bare event path is
the winners board and would otherwise swallow it.

### The dashboard (`/admin`, gated by `src/proxy.ts`)
**Every dashboard page carries the notification bell** at the right end of its
header (`admin/NotificationsCenter.tsx`, drawn once by `AdminShell` through
`DashboardShell`'s `headerAccessory` — never by a page). It is the owner's
reference component, `components/ui/NotificationBell.tsx` (a bell that swings
and a badge whose digits roll when the unread count rises), ported onto
`framer-motion` without its Radix slot. It sits in a zero-height slot at the
top of `<main>`, sticky from `md` up like the header, scrolling with it below;
every `.admin-header` beside it keeps its right edge clear for it. **Beside
the bell is the account menu** (`admin/AccountMenu.tsx`, the owner's
reference: a round avatar, the name over the role line, a chevron): it
replaced the sidebar's user block and its Settings and Log Out rows. Pressing
it drops the row menus' dropdown (`.action-dropdown-menu` + `.t-dropdown`)
under it — the person again, **the settings pages** (`settings/sections.ts`:
*Profile*, *Security*, *Site Settings* — only with `nav.platform` — and *Your
Access*, each with its `LinkPending` marker and `aria-current` on the page
already open; the
route change folds the menu), then **the *Dark Mode* switch** in a group of
its own, then *Log Out* in red, which shows `BusyLabel` while it signs out.
Dark Mode sits after the pages and before Log Out because the rows above it
go somewhere and it changes the screen in place. The whole 44px row is the
control (`role="switch"`, `aria-checked`), pressing it leaves the menu open,
and the track is transitions.dev's toggle (27, `.t-toggle`, `--toggle-*` in
`globals.css`) — accent blue when on. **The row shows the theme that is on**:
a moon and *Dark Mode*, or a sun and *Light Mode*, the icons crossing over
with the icon swap (09, `.t-icon-swap`) and the words with the text swap
(04, `.t-text-swap` in `globals.css`, its three phases driven by
`swapLabel`). Its accessible name stays *Dark Mode* whatever it shows, since a
switch's name is what it turns on and `aria-checked` says whether. The choice is the `dash_theme` cookie
(`admin/dashboard-theme.ts`, dark unless it says `light`), which the admin
layout reads so `DashboardShell` draws `data-theme` on `.admin-layout` on the
server's first paint; once mounted it mirrors the value onto `<html>` so
portals and the themed favicon follow, and deletes it on unmount so the
public site never inherits it. The bare sign-in pages are not themed.
**The light palette is tokens** (`LIGHT_THEME_PLAN.md` Batches 1–2): the frame,
sidebar, header, this menu, dropdowns, modals, badges, buttons, form
controls, the shared table primitives and toolbar popovers, the bell and the
notification centre, `AlertModal`, `Toast` and every modal panel follow the
switch; what is still dark on the light setting is the pages' own TSX
(Tailwind `white/…` and `gray-…` classes), which Batch 3 converts (§10). From `lg` down the trigger is the avatar and chevron
alone. Both sit in `.dash-header-tools`, whose measured width
`DashboardShell` writes to `--dash-accessory-w` on `<main>`; the headers'
right padding reads it, falling back to the widest the tools can be before
it runs, so a long name never runs under a page's own actions. Pressing the bell
opens **a dialog** — under the bell from `md` up, a bottom sheet on a phone,
portalled to `<body>` — with *All / Unread* sliding tabs (`.t-tabs`), *Mark all
as read*, and the feed under Manila day headings: a tone-coloured icon per
kind, the title (with a *Needs action* chip on the kinds that ask for one), the
sentence, the age and a blue unread dot. **Each row is a link** to where it is
about — a payment to validate opens that race's registrants searched to the
order — which marks it read and keeps the modal up with the row's
`LinkPending` marker until the route changes, which folds it (as the phone
menu does); a notification for the page already on screen folds at once. The wait draws skeleton rows; a failed load offers
*Try Again*. What it lists is §5 `notification-store.ts`, fed by `GET
/api/admin/notifications`, asked on mount, every minute while the tab is in
view, on return to the tab and on each open. A bare path (sign-in, register,
invite) has no bell.

**A client viewer's `/admin` is its own page** (`ADMIN_MERGE_PLAN.md` Batch 4,
`admin/ViewerDashboard.tsx`, reading `client-summary.ts`): *Your Events* — three
tiles (Registered Runners, Paid, Pending Payment) over one card per race: the
poster at 16:9, the events table's own registration badge
(`events/registration-state-badge.ts`, shared so the two never word a state
differently; *Opens …* under Scheduled), title, date and place, the total, a
paid / pending bar that is `aria-hidden` with the numbers written beside it in
words, and each category's total with `N paid · N pending`. **No money, names,
references or links** — the cards are not pressable, because nothing behind a
race is the viewer's to open. The grid is one column on a phone and ~340px
columns after; a category's counts drop under its name when they cannot share
the line. With no linked race the tiles read 0 over *No events linked yet*,
naming the client. The wait draws three tiles over three event cards
(`VIEWER_OVERVIEW_SHAPE`). A viewer's sidebar is **Dashboard and Settings
only**, and **every other `/admin` screen answers it with *Not Part of Your
View*** (`admin/forbidden.tsx`, §7) — Settings stays, name, email and password
as for anyone. Everyone else's `/admin` is the
dashboard (an Overview of three tiles — **Total Revenue (Net)**,
**Total Registrants**, **Active Events** — plus a fourth, **Platform Fees
Collected** (the `platformFee` of PAID orders), for `platform:manage` only: it
was the super admin dashboard's *Platform Revenue* tile, and Run As One now
keeps that money itself. The super admin dashboard's *Total Organizers* and
*Transaction Volume* tiles were not carried over — clients replace organizers in
Batch 3, and volume is the net revenue beside it plus fees. `loading.tsx` draws
four tiles for the same people through `dashboard-nav.tsx`. Then the five most recent
registrations. There is no *Page Views* tile: it was a placeholder that only
ever read `N/A`, and a metric card that never carries a number teaches an
organizer to stop reading the row. Do not re-add a tile until something real
counts behind it) · `/admin/login` · **`/admin/register` — the organizer
application, which since `ADMIN_MERGE_PLAN.md` Batch 3 creates a `Client`
submission and no account** (both drawn without the sidebar, and both carrying
`AuthHomeLink` back to the public site — §8). It is a **three-step form**, not
a sign-up box: *Your organization* (name, kind, city + province, website or
Facebook page, how many events they have run), *You and how to reach you* (the
contact person and their role, email and a `+63` mobile number — **no password**:
its two boxes were removed in Batch 3, and the step's blurb says the sign-in is
set up later, by email)
and *What you are planning* (what they came for, the first event's name, date
and place, the size they expect, a free-text note, and a consent line). The
mobile number is the **runner wizard's own `PhoneField`** — flag, dial code and
country menu — rather than a second phone control built for this page; there is
one right way to type a number on this site and it already existed. It brings
its own `.input-group`, so only its radius and ground are reconciled to this
card, and it gained an optional **`hint`** prop in the same change so small
print lands *above* the error rather than under it (a hint below a red line
reads as part of the complaint). The wizards pass none and are unchanged. "What
do you need Run As One for?" offers **two service lines and an escape**, not a
feature matrix: *Registration System* (which carries the payments, the race kit
pickup and delivery and the promo codes inside it, listed in its hint rather
than offered as separate ticks), *Results and E-Certificates*, and *Not Sure
Yet* — which takes the full row and cannot share the answer with either, a rule
`servicesOf` enforces on the route too. It was six technical options and that
made an organizer stop to work out which boxes were really one box; an
application form is not where somebody learns our architecture. There is
deliberately no timing option — this platform imports finishing times, it does
not time a race. It asks all of it because Run As One decides from it whether and how to run
a race for somebody, and a name and an address are everything a stranger needs
to *look* like an organizer. Required is the
default and the rest is marked *Optional*, because a form that demands an event
date from somebody who has not booked a venue gets a made-up one. The rail's
dots are not buttons (nothing is saved until the last step, and Back is what
goes back); the step's labels are hidden below `sm`, where its own heading says
the same thing. Every rule comes from `lib/organizer-application.ts`, run per
step here and again in the route, with a count at the top of a failed step and
the caret sent to the first control that caused it. Both presses go through
**one submit button** whose label changes: a `type="button"` Continue beside a
`type="submit"` Submit shares its DOM node with React, so the press that
reached step 3 re-typed that node and the form posted itself on arrival. A
sent application replaces the form with what happens next, rather than a green
ribbon — three numbered steps (we read it; we may call or email; **you get
your sign-in** by email when we are ready to run your race) and the address the
reply will go to, which is what stops somebody applying twice an hour later.
Its button goes back to the public site, not to sign-in, since the applicant
has no account yet ·
`/admin/events` (**the list is in the order staff work it**: races still to
come first, soonest at the top, then the races already run, most recent first —
sorted in `events/page.tsx`, which also fixes each row's **No.** (`listNo`) so a
search, filter or column sort never renumbers it. A **Registrants** column
counts the runners holding a place — PAID plus PENDING, in people not orders,
removed runners excluded, one query for the page — and hovering it, focusing it
or tapping it on a phone opens a tooltip (`.reg-count-tip`, the rail tooltip's
`--tt-*` tokens) splitting it into *Paid / Validated* and *Pending*. **One
*Filters* chip at every width** (`FiltersMenu`, §9 — the pattern every table
filter copies) opens a popover (a bottom sheet on a phone) holding **Client** (only
for `platform:manage`, built from the listed races' clients plus *No client
yet*) and **Registration Status** (the `REGISTRATION_STATES` labels); the
filters narrow the data before the table, so search, sort and the pager work
inside the result. The row menu carries
**Schedule Sign-Ups**, which opens a modal holding the same
`RegistrationOpeningPicker` the create and edit forms use: open registration
now, or name the date and time it opens itself. Saving either answer also lifts
a manual hold, since both are the organizer saying when sign-ups happen. A
scheduled row shows a *Scheduled* badge with the opening date quietly under it.
Plus `/new` and `/[id]/edit` — both open on an optional **Client** picker
(`events/EventClientField.tsx`, `AdminSelect`: *No client yet* plus every live
client, and an archived one only when the race is already linked to it), drawn
**only for `platform:manage`** — it asks `admin/clients/options` and renders
nothing on a 403, and the form sends `clientId` only when it drew the picker;
below `sm` both keep Cancel and Save in a bar
stuck to the foot of the screen, below `lg` an uploaded image's Remove is a bar
under it rather than a hover overlay, and the certificate preview comes above
its sliders; the edit screen ends with a **read-only
Promotions panel**: what a runner registering for this race can be given, its status and
its conditions, with a link through to the marketing screen. Read-only on
purpose — one screen owns promotions, and a second place to edit them is a
second place for them to drift) · `/admin/events/[id]/registrants` (**the list is
in registration order, oldest first, and nothing an organizer does to a row ever
moves it.** Both levels of the fetch say so — `orderBy: { createdAt: 'asc' }` on
the registrations and `orderBy: { runnerNo: 'asc' }` on the runners inside each
one. Neither had an ordering before, and without one Postgres returns rows in
whatever order it finds them on disk: every `UPDATE` rewrites its row at the end
of the heap, so validating a payment or saving a remark silently reshuffled the
table, and a group's `-2` could print above its `-1`. The **No.** column is the
registrant's own number, assigned on the server off that order (`regNo`) rather
than being the row's position on screen — filter down to the unpaid orders and
the numbers still read 3, 7, 12, which says who those people are, where a row
index renumbered everyone 1, 2, 3 and said nothing; how many rows are in view is
what the footer's "1-25 of 143" is for. It is a reading of the list as it stands
and **not a bib number** — cancel an early order and everyone behind it shifts up
— so anything that must survive that needs a column of its own.
A validator's queue is therefore a **filter, never a sort**: the *Needs
Validation* toolbar chip collects the rows that are `PENDING` **and** bank
transfer (`needsValidation`, the same pair that decides whether the detail modal
and the lightbox offer a Validate button — an online PENDING is an abandoned
checkout `pending-expiry.ts` sweeps on its own, with nothing for a person to do),
and it wears the amber of the PENDING badge it collects. Sorting those to the top
instead would pull a row out from under the cursor the moment it was validated,
costing the admin their place in the list and the sight of the badge turning
green where they clicked — the same reason the feedback screen
*finds* unread messages rather than sorting them up. The Status column stays
sortable for anyone who wants to group by it deliberately.
Rows whose email
never went out carry an **Email Unsent** badge, an *Unsent Email* toolbar toggle
lists exactly those, and a mail icon opens the manual-send modal; the two chips
narrow the same list together. **`?search=`
prefills the search box**, which is how the marketing screen's redemptions panel
links straight to one order. **Minors** (`GUARDIAN_CONSENT_PLAN.md` Batch 4):
page.tsx marks each row `isMinor` / `ageOnRaceDay` against `event.date` and
carries the guardian columns (the consent time worded in Manila by
`formatEventInstant`). A minor wears a blue *Minor* chip (`.status-badge.info`,
the informational tone) beside the name in the table, the card and the detail
modal; the modal's Birthdate adds "· N on race day", and a **Parent/Guardian
Consent** block shows the guardian, relationship and when consent was given — or
an amber *No guardian consent on file* line for a minor without one — with a
*Print guardian consent* link (new tab). The block also shows for a non-minor
who has a guardian on file, so a birthdate corrected upward does not hide what
was agreed. The *Filters* sheet gains an **Age → Minors (12 and under)** option,
offered only when the race has one, applied to the data like the two queues.
The CSV adds *Guardian Name*, *Guardian Relationship* and *Guardian Consent At*
after Birthdate. The edit modal shows *Guardian Name* (uppercase, uppercase
sample placeholder) and a *Relationship* `AdminSelect` whenever the edited
birthdate makes the runner a minor or a guardian is on file, and **warns but
never blocks** when a minor has no consent from the form — staff are correcting
data, not registering. **Pacers** (`PACER_DISCOUNT_PLAN.md` Batch 3): page.tsx
marks each row `isPacer` from the order's own `discountType` snapshot — never
from the promo code, which staff may since have paused or deleted — and
`isComplimentary` from its payment method. A pacer's order wears a blue *Pacer*
chip **under the status rather than beside the name**, because it explains the
status: the row reads PAID with nothing collected, which without the chip looks
like a payment somebody forgot to record. It is drawn in `renderStatusBadges`,
so the table cell and the card's badge row carry it alike. The *Filters* sheet
gains a **Type → Pacers** option, offered only when the race has one and applied
to the data like Age and the two queues; the CSV gains a **Pacer** column
(`YES` or blank) between *Payment Method* and *Promo Code*, so the race-day
sheet can be sorted on it. The detail modal repeats the chip beside the name and
prints *Complimentary: pacer entry* under the payment method, and its status
line now reads "Free entry — nothing was charged, so there was nothing to
settle." instead of claiming PayMongo settled it (`statusProvenance`, §5). A
complimentary order **cannot** reach the *Needs Validation* queue or the bell:
both ask for PENDING **and** bank transfer, and it is neither.
**The screen was split in the same change** — it was the repository's largest
file at 2,571 lines. `RegistrantDetailModal.tsx` is the panel (it holds no state
of its own; every way onward calls back to a modal the table owns),
`registrant-display.tsx` the tones and chips the table, the cards and the modal
must agree on, and `registrant-csv.ts` the export's columns and its
Excel-proofing. `RegistrantsTable.tsx` keeps the toolbar, the table, the cards
and the four write modals. ·
`/admin/events/[id]/registrants/[runnerId]/consent`
(**the printable guardian consent**, Batch 4): the dashboard frame with a back
link and a *Print* button (`window.print()`, **no PDF library**) over a
white paper sheet — headed by the Run As One lockup (`RunAsOneLogo`, its `--logo-*` pinned to the light palette so the wordmark is dark on paper whatever the dashboard theme; **the owner wants the client's or event's own logo there once a dashboard setting for one exists**, with Run As One kept as the fallback) — the event, the runner (reference, category, birthdate and
age on race day), the guardian and when they consented online, the consent
sentence naming the child, the event's resolved waiver, and blank signature and
date lines for the guardian and for the staff member at kit claiming. With no
consent on file the guardian's name and relationship print as blanks to fill in
by hand. Scoped like the registrants screen (the organizer's event,
`registration:view`); a runner not on this event is *Runner not found*. A
runner who is not a minor still gets the sheet, under an amber screen-only note
saying so. Printing works by portalling a second copy of the sheet onto
`<body>` (`PrintableSheet`), because the dashboard shell is a fixed-height
scroller that would clip it; `consent-sheet.css` is scoped to its own classes
and its print rules fire only on a page carrying that copy
(`body:has(> .consent-print-copy)`), so printing any other dashboard page is
untouched. The paper's black-on-white is a deliberate literal, not theme
tokens. The **detail modal has two doors** — the eye beside
the Reference and *View Details* at the top of the row's actions menu — because
an organizer who has already opened the menu to edit or validate should not have
to close it to read the order first; both open the same modal, and the menu's
entry looks the runner up in the live list rather than carrying a captured row,
so it never shows a stale copy. **Below `lg` the list is cards** (Mobile
Batch 3): the Category, Logistics and Payment lists sit in the one *Filters* chip at every
width (`FiltersMenu`; the two queue chips stay chips beside it), below `sm` selecting
rows raises a bulk bar at the foot of the screen in place of the toolbar's red
chip, and the detail modal is a full-height sheet whose footer carries Proof,
Remarks and Email beside Validate. A card has no eye beside its reference (the
owner's call); its ⋯ menu's *View Details* is the door there. The **proof of payment opens full screen**
(`ProofLightbox.tsx`) — from the thumbnail itself or the *View fullscreen* link
beside the heading — with zoom (buttons, wheel, pinch, double-click, anchored on
the point being read), pan (drag or arrow keys, so the drag is never the only
way), rotate (phone photos of deposit slips arrive sideways) and *Open in a new
tab*; the 300px thumbnail says a slip was uploaded, it does not let anyone read a
reference number off one. **A receipt is not always a photo** — a transfer done
in a banking app is confirmed by an emailed PDF, and a runner may upload that
rather than screenshot it — so a proof whose stored pathname ends in `.pdf`
(`isPdfProof`, carried onto the row as `proofIsPdf` by the server page) gets a
labelled card where the thumbnail would be, and a frame holding the document
where the image would be. The browser's own PDF viewer owns zoom, rotation and
paging there, so those tools leave the toolbar rather than sitting dead in it,
and *Open in a new tab* is repeated in words under the frame for a browser that
will not display a PDF inline. The order's own **Order Total, Transaction No. and
status are printed under the image**, and a PENDING bank transfer carries
*Validate Payment* there too, because matching the receipt against the order was
otherwise done across two screens from memory. Portalled to `<body>`, since the
detail modal's frame is `overflow-hidden` and would clip it) ·
`/admin/events/[id]/results` (the uploader detects the sheet's real header row —
timing exports open with banner rows — and maps columns by sheet index, not by
label; Chip and Gun Time print to whole seconds like everywhere else —
§5, `race-time.ts`. **Below `lg` the finishers are cards** (Mobile Batch 4):
the name truncating, a Bib chip, then category, gender, both ranks and both
times. Every picker in the uploader is `AdminSelect`, one to a row with its
label above it on a phone. The Header Row picker lists each row's first labels
as small print and spells out the chosen row's columns under the field, and
*Process & Upload Results* sits in a footer that stays on screen) · `/admin/events/[id]/pacers` (**this race's pacers**, `PACER_DISCOUNT_PLAN.md` Batch 1, reached from the events table's row menu as *Pacers*, which also carries the count — "Pacers · 3 not sent" — so a forgotten pacer is visible without opening the screen. `promo:manage`, the same verb its routes ask, and a no-permission reads as "Event not found." exactly as Registrants and Results do. Rows are **grouped by category** in the event's own order, each group naming its distance beside its name, and each row carries the pacer, the code in monospace with a copy button, the state (*Registered* with a link to that order on the registrants list, *Paused*, or *Not yet used*), the amber *Code not sent* chip and the blue *Admin fee waived* chip. The amber reminder line sits above everything as a `role="status"`, so a *Mark as sent* is heard as well as seen; every chip carries an icon as well as a colour, because a colour on its own is not a message. *Add Pacer* opens `.admin-modal-panel` with Category (`AdminSelect`, preselected when the race has one), Pacer name (an **uppercase** sample placeholder, because the name is stored and shown uppercase) and the *Include admin fee in discount* switch — the new shared `.admin-switch-row` (`role="switch"`, the whole row is the target, `.t-toggle`'s motion), **disabled with its reason in the hint** for anyone but the Super Admin, since the person who may not use a control is exactly the person who needs to be told why. The row menu says what each item does with an icon and a label — Copy code, Mark as sent, Rename, Pause, *Waive / Charge admin fee* (Super Admin only, withheld by not passing its handler) and Delete — and the Actions cells sit under their column header. **Copying is not sending**: the copy button never marks a code as sent, or the reminder would hide the one pacer it exists for. Delete is offered only while the code is unclaimed; once a pacer has registered, Pause is the answer and the route refuses the other. Under the intro sits **"N of M pacers registered"** (Batch 3), counted in the client from the rows on screen with the same `isPacerRegistered` each row's chip reads, so adding or deleting a pacer moves it at once and the line can never disagree with the list; the amber reminder above says what is still owed to the pacers, this says what they have done with it. Cards below `lg`, and the route fallback draws this shape) · `/admin/marketing` (promotions: the kind, the event it is scoped to, what it
requires — the form runs *Discount type → value (a `%` or `₱` box, for the per-runner kinds) → Event → Applies to* (per-runner kinds with an event: *All categories* and one toggle per category with its distance, in the claim picker's frame, cleared when the event changes) *→ How runners get it* (Automatic disabled with a reason for the per-runner kinds) *→ Runner limit* (shared per-runner code only; vouchers show "Each voucher covers one runner" instead); the Discount column prints "20% off" with "10K, 21K only" in small print and Used reads "12 of 50 runners" for a shared per-runner code; the page has **no Filters sheet** yet, so there is no type filter, whether it is claimed by a code, a voucher batch or automatically,
**how much it has given away**, and a row menu to view its redemptions, edit,
duplicate, pause or delete — *Duplicate* is the create form with the row's own
values in it and no route of its own, blanking only what has to be unique (the
code or name, the batch label and its size) and dropping the dates when the
promotion being copied has already ended, so a copy is never born expired;
a promotion in its last three days carries an amber *Ends in 3 days* line under
its Active badge — a batch collapses into one row that opens to be copied, on
the same searchable, sortable, paginated table the events and registrants
screens use. Three metric cards: Running Now, Times Redeemed and **Given
Away**, the last being the Given column added up. **Below `lg` the promotions
are cards** (Mobile Batch 4), with *Redemptions* as the footer's shortcut beside
⋯. A voucher batch opens inside its card through a **"Show N codes"
disclosure** (transitions.dev's accordion, `.t-acc` in `globals.css`), which
reads the same `expanded` state as the table's second row, with a 44px
*Copy all codes*. The create / edit / duplicate form and the Redemptions panel
are on `.admin-modal-panel`, with Save in a footer that stays in reach. Below
`sm` the claim picker and every pair of boxes stack, and each category's price
row becomes one block, with a visible caption on each box) ·
`/admin/settings` (**grouped into four pages, reached from the account menu** — the owner's call, 2026-09-18, after the single page grew too long; there is **no section tab strip on the pages themselves**, the menu is the navigation. The groups live in `settings/sections.ts`; `settings/account.ts` `loadOwnAccount(actor)` is the one read of the person's own row, redirecting to sign-in when it is gone. **`/admin/settings` = Profile** — an optional **profile photo** (picked, centre-cropped and shrunk to a 256px JPEG in the browser, saved at once through `admin/profile/avatar`, shown in the account menu in place of the initial), then name, sign-in email and, for a StaffAccount only, an optional mobile number (`PhoneField`; the Organizer row has no phone column). **Changing the email opens a Current Password box** and the route requires it. **A client viewer's email is read-only** and names the admin email to write to — only Run As One's staff change it. **`/admin/settings/security`**: **Password** (a change signs out every other device, owner and staff alike); **Sign-in Activity** for everyone — the last sign-in (`lastLoginAt`, recorded on both account tables) and **Sign out other devices**, which asks first, posts to `admin/profile/sessions` and keeps this browser signed in. **`/admin/settings/site`** (Site Settings; `forbidden()` for anyone holding neither `platform:manage` nor `org:settings`, and hidden from their menu): for `platform:manage` (Super Admin *and* Admin, by the owner's call) the **Admin Email** panel — the one address the footer, the 404, feedback, coming-soon, Terms, Privacy and organizer sign-up pages and every email use; its hint warns when the address is off the Resend-verified domain, so mail keeps its default sender — and beside it the **Social Links** panel, one box per channel (brand glyph on the label, sample address as placeholder), each checked on blur and on Save with `socialLinkError`; an empty box hides that icon in the footer. The two save separately. Then, for `org:settings` only (the **Super Admin** — an Admin does not see it), the **Default Platform Fee** panel: one peso box (`readPlatformFee`), saving through `admin/platform-fee`, whose hint says plainly it **only affects new events** — existing events keep their own fee. **`/admin/events/new` is a server shell** (`page.tsx`, `requireTeamActor`) that reads `Organizer.adminFee` and hands the client form (`NewEventForm.tsx`) its starting Admin Fee, so there is no flash of a hardcoded ₱60. **`/admin/settings/access`** (Your Access), read-only (`settings/AccessPanels.tsx`): **Your Role** with its `ROLE_HINTS` sentence, for Super Admin / Admin the matrix's list of what the role may do, for Staff each assigned race with its event role and a link to its registrants, for a client viewer its organization) · `/admin/team` (**who can sign in to
this organizer, and to what** — `team:manage` only, anyone else gets the
admin's 404. Three metric cards (Active Members, Invitations Waiting — expired
ones included, since each needs a resend — and Suspended) over the admin's one
table: the **owner is always the first row and has no menu**, because the
owner is the Organizer row and not a membership, then everyone else in
invitation order, which never changes under an action. Columns: Member (with a
*You* chip), Role, Events (a STAFF member's races with their role on each),
Status (with *Link expires Sep 20* under a waiting invitation), Last Sign-In.
The row menu (`TeamActionsMenu`) offers Edit Access, then **Resend
Invitation** for someone who has not accepted or **Suspend / Reinstate** for
someone who has, then Remove from Team / Revoke Invitation. A row the viewer
may not manage — the owner, themselves, or an admin when they are only an
admin — shows a dash with a tooltip saying why. **Invite and Edit Access are
one form** on the t-modal frame: name and email (invite only), a Role picker
offering only what `grantableRoles` allows, and for Staff a list of event +
role rows whose pickers never offer an event already chosen in another row.
Every refusal lands under its field. A failed invitation email is an `alert`,
not a toast, because it needs acting on. Under the table, `RolesPanel` draws
the permission matrix straight from `permissions.ts`) · `/admin/activity` (**the
trail read back — "sino ang gumawa nito"**. `activity:view` only (owner and
admin); anyone else gets the admin's 404. **Paged on the server**, unlike every
other admin table: the filters are the URL (`activity.ts`, §5) and one page of
rows crosses the wire. Search (order reference, name, event) and the one
*Filters* chip (`FiltersMenu`, like every table): **Dates** (Today, Last 7 days,
Last 30 days, Choose dates — one at a time, nothing checked is any time; Choose
dates opens From / To boxes on the page under the toolbar), **Person** (everyone
who appears in the trail, removed members included, with *Staff · email* as
small print), **Event**, and **Activity** (the shelves such as *All personal
data*, then each verb). Person, Event and Activity **take several values**:
checked values within one filter widen it, the filters narrow one another, and
the URL carries them comma-separated (`person=a,b`). **Newest first and never re-sorted**: no sortable headers, no
select or `No.` column, and once a reader pages past the first screen the
reading is pinned (`asOf`), so new entries wait in a blue *N newer entries ·
Show* chip rather than shifting the rows being read. Entries sit under Manila
day headings (*Today · Sep 15*). Columns: Time, Person (name, then *Staff ·
email*), What happened (the verb's label, a failed sign-in as a red badge, and
the entry's sentence), Event (*Deleted event* when the race is gone), and a
Details chevron opening a second row (plain content, no boxed panel) with what changed field by field, the
exact instant, IP address and device. **Below `lg`** the same page is
`AdminCardList` cards per day, the details behind a *Show details* accordion
(`.t-acc`). The pager is `AdminTablePager` at 25 / 50 / 100 a page) ·
`/admin/invite/[token]` (**public**, `noindex`, `referrer: no-referrer` — where
the invitation email lands, a team member's or a client viewer's (Batch 3: a
`VIEWER` invitation is titled *Your sign-in for {client}* and says what the
view shows instead of listing races and roles; an archived client's link reads
as expired). It says which organizer and exactly which races and
roles before asking for anything; a new person confirms their name and chooses
a password, **someone who already has an account enters the one they have**.
An unknown, used, expired or malformed link all get the same designed "This
link has expired" page with the way back to sign-in) · `/admin/[...missing]` →
the admin's own 404.

**The sidebar and the events table follow the permission matrix.** Marketing
Tools shows only with `promo:view` somewhere, **Clients, Communities and
Feedback only with `platform:manage`** (between Marketing Tools and Team),
Team only with `team:manage`, Activity only with `activity:view`, and
the account menu's role line reads **Super Admin** (the OWNER role's label), or `Admin · ORGANIZER` /
`Staff · ORGANIZER`. There is no organizer switcher: it was removed with
`api/auth/switch-organizer` in `ADMIN_MERGE_PLAN.md` Batch 2, because Run As
One is the one tenant and nobody has a second organizer to move to. On `/admin/events`, Create Event needs `event:create`, and each
row's Edit Event, Schedule / Pause Sign-Ups and Delete Event follow
`event:edit` / `event:delete`, decided on the server per row. **The registrants
screen follows it too**: `registrants/page.tsx` builds a `RegistrantPermissions`
object with `can()` and the table offers only what the role holds — Edit
(`registration:edit`), Delete, Delete Selected and the bulk bar's Delete
(`registration:delete`), Validate Payment in the menu, the modal and the
lightbox (`registration:validate`), the Remarks and Email buttons and links
(`registration:remark` / `registration:email`), and the proof block
(`proof:view`). Remarks stay readable to everyone; a phone's modal footer is
hidden when it would hold nothing. The routes still refuse on their own.
**The detail modal says who settled the order**, under its status: "Validated
by Ana Cruz · Sep 13, 2026, 4:02 PM" (`statusProvenance`, §5), updated in place
when somebody validates, and for an owner or admin a *See this order's
activity* link into `/admin/activity` filtered to that event and order
reference.

### Run As One's own screens (`/admin`, `platform:manage`)
**Communities and Feedback were the super admin's portal at `/superadmin` until
`ADMIN_MERGE_PLAN.md` Batch 2**, Clients replaced its organizer accounts
screen in Batch 3, and the super admin account itself was retired in Batch 5. They sit in the one dashboard's sidebar for owners and
admins, each behind a server `page.tsx` that asks `can(actor,
'platform:manage')` and answers anyone else with the admin's own 404, wrapping
a client screen (`ClientsClient`, `CommunitiesClient`, `FeedbackClient`).
**`/superadmin` and `/superadmin/:path*` are permanent redirects** in
`next.config.ts` to `/admin` and `/admin/:path*` — same names, so query strings
survive, and an address that never existed lands on `/admin`'s own 404 in the
sidebar — **except `/superadmin/organizers` and `/admin/organizers`, which go
straight to `/admin/clients`**. The super admin's dashboard became the
Overview's fee tile, and its Activity screen merged into `/admin/activity`
(below).

`/admin/clients` (**the client submissions, and Send invite** — Batch 3. Every
application from `/admin/register` lands here as `NEW`; **nothing is approved
or rejected**. Search (name, contact, email) and the **Filters** chip's **Status**
group — New (with its count) / Invited / Active / Archived, several at once —
which finds rather than sorts; with nothing checked the list is every *live* submission, archived ones being out of the
queue by definition, and the empty state says how many sit under Archived.
Columns: Client (name, email), Contact, Applied, Events, Status, Actions. **A
row opens the application** in `clients/ApplicationPanel.tsx` — the old
organizer panel, same frame, keyboard and full-height sheet below `sm`, the
organization / the person / what they are planning grouped as the form asked,
labels from `organizer-application.ts`, a blank answer reading *Not given*, a
pre-form row saying so in one sentence — whose *The decision* section is gone
and whose **Sign-ins** section (shown once anybody was invited) lists each
viewer with the team screen's own state badge (Active / Invited / Invite
Expired / Suspended, `memberState`). The row's ⋮ menu offers **Read
Application** and the moves; the panel's footer spells the moves out as
labelled chips. The moves come from `canMoveClient`, the
routes' rule: **Send invite** (worded *Resend invite* while an invitation is
waiting) from New, Invited or Active, **Archive** from anything live (a
`confirm` — it signs the client's viewers out; nothing is deleted), **Restore**
from Archived (back to New). Send invite opens `clients/InviteDialog.tsx` —
`AlertModal` with Name and Email boxes, **opening on the person the
application named** (or on the waiting invitation's person for a resend, or
empty when the contact's address already signs in, since then the press is
for a second person), checked by `readInvitee` as it is pressed, with the
route's refusals landing under the field. A sent invitation is a toast; one
whose email did not go out is an alert. Cards below `lg` open the panel from
*Read application*, as feedback cards do. The approve / reject / suspend
controls and `RejectDialog` were deleted with the organizers screen, and the
`admin/organizers` routes in Batch 5) · `/admin/communities` (approve, rename, reject clubs; the
Add a club box and its button share one row from `sm` up) · `/admin/feedback` (**the reading end of the public form** —
three metric cards over the messages, newest first. It is Run As
One's screen and not a per-event one for the same reason the club list is: feedback is
about the platform rather than about any one race, and it carries strangers'
email addresses. A message is a paragraph rather than a field, so the table shows
one line of it and **the row opens** into the whole thing — the second-`TableRow`
pattern the marketing screen's voucher batches use — carrying the page and the
browser it came from and a *Reply by email* that opens a `mailto:`. The Filters
chip's Status (Unread with its count, Reviewed) and Kind groups filter; the order changes only when somebody clicks
a header, which is why the unread ones are **found** rather than sorted to the
top). All three are TanStack tables on `AdminDataTable` (§9) — sortable
headers, View, the pager and a Sort chip below `lg`; the club rename opens in
the Club cell with Save / Cancel chips. A club's Approve / Rename / Remove from
List and a message's Mark Reviewed (or Move to New) / Delete Message sit in the
row's ⋮ menu (`RowActionsMenu`), the red item below its divider; a club card's
footer shortcut is Approve while it waits and Rename once approved, a feedback
card's is its status move. **The platform trail is `/admin/activity`.** Organizer
decisions are made inside Run As One's tenant now, so they are rows of the one
trail under an *Organizer decisions* shelf; the older decisions and sign-ins of
the retired "System Owner" test account stay under that account's own `orgId`,
where no session reads them (the trail is append-only; the account row is gone).
**Below `lg` the three lists
are cards** (`AdminCardList`): the club rename becomes a
full-width edit block on the card (`AdminCardEdit`, §9), and a feedback card
opens its message from a *Read message* button rather than a tap anywhere.

**`/admin/remittances`** (`remittance:manage`, `ADMIN_MERGE_PLAN.md` Batch 6 —
*Remittances* in the sidebar, first among Run As One's own screens; anyone else
on the team gets the admin 404, a viewer the forbidden page). A **server page**:
four tiles — *Collected (Paid Orders)*, *Run As One's Share*, *Balance Due to
Organizers* (the sum of **positive** balances only, so one race's overpayment
never hides another organizer still waiting) and *Remitted* — over every race,
latest first, with Collected, Run As One, Owed, Remitted, Balance and a state
badge (`SettlementBadge`). Search by event or client; the **Filters** chip's
**Settlement** group — Balance Due (count) / Overpaid / Settled / No Orders —
**finds, never sorts**. A row (or its
labelled **View Details** under Actions — the eye the registrants screen uses,
a real link; a bare chevron there confused staff) opens **`/admin/remittances/[eventId]`**:
the state, date and client under the title, tiles for *Owed to Organizer*,
*Remitted*, *Balance* (read *Balance (Overpaid)* when negative, with the state's
sentence) and *Run As One's Share*; a **How the Balance Is Worked Out** ledger
(`.settlement-lines`: collected, less the two fees, owed — with list-price
entries, discounts and delivery inset under it as explanation — less remitted,
balance); and the **Remittances** list (sent day, kind, amount — a return shown
negative — method, reference and note, recorded by and when, Recorded / Voided
with who voided it, when and why, and a ⋮ menu under Actions — Open Receipt,
then Void in red — which a voided row without a receipt leaves empty; a card's
footer shortcut is Receipt, never Void). Both lists are TanStack tables on `AdminDataTable` (§9) with sortable
headers, View and the pager; the race's list stands under a *Remittances*
heading row holding Record Remittance. **Record Remittance** opens `RecordRemittanceDialog` (the team modal's
frame): Kind and Method (`AdminSelect`), Amount in pesos, Sent On (today by
default, no future day), optional reference, note and receipt (JPG/PNG/WEBP/GIF/
PDF, 4 MB, checked before upload); under the amount it says the balance the
entry will leave, in amber when a payout goes past what is owed. **Void** opens
`VoidRemittanceDialog` (`AlertModal` danger with a required reason). Both
refuse per field and `router.refresh()` afterwards, so the figures are summed
again by the server rather than patched in the browser. The receipt opens in a
new tab through its API route. A missing race and one this person may not
settle both read *Event not found.* with a way back to Remittances.

### API (`src/app/api/**/route.ts`)
| Route | Methods | Notes |
| --- | --- | --- |
| `auth/login`, `auth/logout`, `auth/register` | POST | Sets / clears `admin_token`. **The account email is lowercased at the door** on both `login` and `register` (`normalizeAccountEmail`, §5) — and on `admin/profile` PATCH, which is the third place one can be written. Postgres compares text exactly, so until this landed a single capital from a browser autofill found no row and the login answered "Invalid credentials" for a password that was perfectly correct; `register` had the matching gap, where two accounts could exist for one address differing only in case and the unique index would not have stopped them. All three normalise through one helper, because this is precisely a rule two screens must never disagree about. **`login` looks the address up in both account tables** through `findAccountByEmail` (§5): **only Run As One's Organizer row signs in as the owner** (`organizerOwnerCanSignIn`, §5) — any other Organizer row is answered *Invalid credentials* before its password is checked and is not logged, exactly like an address with no account, and Run As One's row in any status but `APPROVED` is refused as `NOT_APPROVED` — a `StaffAccount` signs in to its earliest-accepted membership of an active organizer (an invitation not yet accepted has no password and is answered like a wrong one). Every sign-in and every failed or refused one is written to the audit trail, except an address that matches no account; `register` and `admin/profile` refuse an address either table already holds. **`register` is the organizer application, and since `ADMIN_MERGE_PLAN.md` Batch 3 it writes a `Client` (`NEW`) and nothing else** — no Organizer row, no password, no session, no email: the gate is staff pressing Send invite on `/admin/clients`. It validates the whole body through `readOrganizerApplication` (§5) — the same module the form runs, so a tab left open cannot post past a rule the form enforces — and writes the fifteen application columns, empty strings stored as null so a screen reading them back has one absent value to test for. It refuses, under `errors.email`, an address either account table holds and an address a client submission already holds (the unique index backs that for two presses at once). A refusal carries `errors` keyed by field beside the catch-all `error` string |
| `admin/events/[id]/registrants/export` | POST | **The audit entry for a CSV export**, which is built in the browser from rows already on screen. The registrants table calls it fire-and-forget (with `keepalive`) before building the file, so a failed log never costs the organizer their download. Records the row count and whether it was a selection — never who was in it. Answers 204 |
| `checkout` | POST | PayMongo checkout session. Re-derives every amount from the database. The **admin fee is checked after the promo code is resolved**, not before, because a pacer code can waive it (`platformFeeAfterDiscount`) — a client posting a waiver it had not earned would be handing itself Run As One's commission. When the recomputed chargeable total is **0** the order takes the free path (`lib/free-checkout.ts`): the transaction fee must be 0 too, `FREE_ORDER_COLUMNS` writes it `PAID`/`COMPLIMENTARY` at ₱0, the confirmation email goes out instead of the acknowledgement, and the route **returns the success URL without ever calling PayMongo**, which rejects a zero-amount charge. The PayMongo key check moved down to cover only orders that will actually be charged — still before the write, so a misconfigured key cannot leave an unpayable registration behind, but no longer in the way of an order PayMongo will never see. |
| `checkout/manual` | POST | Bank transfer: multipart, proof file → private blob. The file is validated by `uploadPrivateProof` under the `proof` kind — JPG, PNG, WEBP, GIF or PDF, 4 MB — which is the same list the wizard's picker offers. The same free path as `checkout`, and the **proof is required a little later than it used to be**: an order that costs nothing has no deposit slip to show, and whether it costs nothing is only knowable once the event and the promo code have been read. A free order stores no proof and no reference number — there is nothing either could be evidence of — and a file attached to one is ignored rather than kept |
| `webhooks/paymongo` | POST | HMAC-verified; marks the registration `PAID` |
| `upload` | POST | Organizer-only image upload (public store) |
| `admin/events`, `admin/events/[id]` | POST / GET, PUT, PATCH, DELETE | Event CRUD including categories and bank accounts. **`clientId`** (Batch 3) goes through `readClientLink` (§5) on POST and PUT: only `platform:manage` may set it, anyone else's is ignored, and a refusal answers 400 under `errors.clientId`, which the form puts under its Client picker; PUT records it in `event.updated`'s changes like any column. Categories keep the position they were created in across every `PUT` — see `category-order.ts`. `PATCH` is **when sign-ups are open, on its own** — `{ registrationPaused }` from the menu's pause item, `{ registrationOpensAt }` from its scheduling modal, either or both, so the events table changes one thing without re-posting a form it never rendered; a body carrying neither is refused rather than treated as a no-op. An opening sent on its own also clears `registrationPaused`, or the date would arrive to a paused event. Scoped to the signed-in organizer's own events. **`DELETE` answers 409 for a race with any remittance** (voided ones too), naming how many, before it removes anything. `GET` also carries `promotions` — what `eventPromotions` says is running on this race — for the read-only panel at the foot of the edit screen |
| `admin/events/[id]/results/upload` | POST | CSV/XLSX results import; dedupes by bib, computes seconds and the three ranks |
| `admin/events/[id]/pacers` | GET, POST | This race's pacers, and adding one (`PACER_DISCOUNT_PLAN.md` Batch 1). `promo:manage`, scoped to the signed-in organizer's own event — without the `organizerId` any admin handed another's event id could mint free entries in their race. POST writes the code, `discountType: 'PACER'`, `usageLimit: 1`, `automatic: false` and **exactly one `PromoCategory` row in the same statement**, since a pacer code with no category would be a free entry to whichever distance the pacer chose. Uniqueness is the `[organizerId, code]` index: the route retries a fresh `pacerCodeFor` on `P2002` five times rather than checking first, because a check before a write is one two simultaneous requests both pass, and answers 409 if it somehow loses every time. `waiveAdminFee` is refused **403 with the field** without `promo:waive-fee`, never silently dropped. Creating with the waiver on writes **two** trail entries: `pacer.created` and `pacer.fee_waived`. GET is the same scope and permission as the write; the screen itself is server-rendered and re-reads through `router.refresh()` |
| `admin/events/[id]/pacers/[pacerId]` | PATCH, DELETE | Changing or removing one pacer. PATCH takes any subset of `assigneeName` (a rename — **the code never changes**, or a pacer already holding it would find it dead), `paused`, `codeSent` (whose timestamp is taken on the server: a client that could name it could name yesterday) and `waiveAdminFee` (`promo:waive-fee`, else 403 with the field). A body that changes nothing answers the row unchanged rather than writing a trail entry saying so. The **category is not editable** — it is in the code's own text and it is the slot the organizer set aside, so moving it would silently move a held place between distances; deleting and re-adding is the honest way. DELETE answers **409 once the code has been used**, saying to pause it instead: the registration survives on its snapshot either way, but removing the code would leave a runner in the race whose free entry nothing on the screen can account for. `discountType` is in the `where` alongside `organizerId` and `eventId`, so this is not a second way to pause or delete ordinary promotions |
| `admin/registrations/[id]/status` | PATCH | Confirm or reject a manual payment, and write the validator's internal `remarks`. Takes either or both; the status is guarded against a fixed list and the receipt email fires only on the *transition* into `PAID`, so a later remarks-only PATCH cannot send a second receipt. Auth-checked and scoped to the signed-in organizer's own events — **this route had none at all until Batch E**, which made it the one way for anyone on the internet to mark a registration `PAID`. When the status moved, the answer carries `statusChange` (`by`, `at`, `to` — the same name the trail entry snapshotted), which the registrant modal's *Validated by* line reads |
| `admin/registrations/[id]/email` | GET, POST | The email a registration is owed, rendered for a person to send by hand — `GET` returns the recipient, subject and **both** renderings (HTML for the clipboard, plain text for a `mailto:`), `POST` records that a staff member sent it. Auth-checked and scoped like the status route, which matters more here than most: the rendered email carries every runner's contact details, birthdate and emergency contact |
| `admin/runners/[id]`, `admin/runners/bulk-delete` | PUT/DELETE, POST | Registrant editing. **Removal is soft** — `deletedAt`/`deletedById` are stamped and the row stays (§4), so a runner already removed answers "Runner not found". An edit needs `registration:edit`, a removal `registration:delete`. Each edit writes one audit row naming the fields that changed (sensitive columns as "changed", never their values), and each removed runner — bulk included — gets its own row carrying their name and runner reference. The PUT refuses an email that is not an address (`email-address.ts`), and when the edited runner is **runner 1 it also writes `Registration.customerEmail`**: every email about an order is addressed to that column, it was previously written once at checkout and never again, so correcting the typo on the runner fixed the list and left the mail just as undeliverable. The sync is unconditional, which makes re-saving runner 1 the repair for an order whose contact address drifted out of step before this existed. It also takes `guardianName` (uppercased) and `guardianRelationship` (`asGuardianRelationship`; an unknown value is refused with "Select a relationship"; a blank name clears both), both audited as sensitive; it **never writes `guardianConsentAt`** and never requires a guardian, even for a minor. A body without the two keys leaves them alone |
| `admin/proof/[id]` | GET | Auth-checked redirect to a short-lived signed proof URL |
| `feedback` | POST | **Public**, and the only route on this site that writes a row on a stranger's say-so — the people most worth hearing from here are signed out, so an auth check would silence exactly them. Three things hold it: the `FEEDBACK_RULE` throttle (§5) applied **before the body is read**, every length and vocabulary rule from `lib/feedback.ts` enforced here and not only in the form, and the fact that nothing a sender writes is rendered anywhere but the dashboard's feedback inbox, as text. A refusal names the field it is refusing and hands back that field's key, so the form puts the caret in the right box (§8, rule 4) rather than showing a catch-all over a form the sender has to re-read themselves. The browser is read from the request headers rather than from the body — a client that can be asked to describe itself can be asked to lie — and the created row's id is deliberately **not** in the answer |
| `promos/lookup` | POST | **Public.** The terms of a code a runner just typed, scoped to the event they are registering for. Returns the *terms*, not a computed discount — the order keeps changing under the runner, so the wizard recomputes with `applyPromo` and nothing here is trusted at checkout. A code we do not have comes back as `{ promo: null }` with a 200, since "we don't have that" is an answer rather than a failure; the response carries no id, organizer or batch. **Throttled** by `lib/rate-limit.ts` (20 a minute per address) before the body is read, and a throttled caller gets that same `{ promo: null }` — a distinct "slow down" would make this endpoint a *better* oracle when throttled than when open |
| `admin/promos` | POST | Creates one code, a whole batch of single-use vouchers in one call, or an automatic promotion. Refuses rather than repairs, naming the field it refused, and scopes `eventId` to the signed-in organizer's own events. A `CATEGORY_PRICE` promotion's price rows are written **in the same statement** as the promotion, since one with no prices is one the event page would advertise and the checkout would ignore. A `PERCENTAGE`/`FIXED` promotion's `PromoCategory` rows likewise — for a voucher batch, for every voucher in the same transaction (read back by the generated codes, not the label). The audit entry records the value, the runner limit and the category count |
| `admin/promos/[id]/redemptions` | GET | Which orders used this promotion — order reference, event, runner count, status, `discountAmount`, `createdAt`, and for a voucher batch the specific code that was used. Covers **all** of the promotion's codes, since a batch is one promotion, and is capped at 500 with a flag saying when it was cut short. Auth-checked and scoped to the organizer's own events, which matters twice here: an id from the browser is not proof of ownership and neither is the code text |
| `admin/promos/[id]` | PATCH, DELETE | Edits, pauses or removes a promotion. A body carrying **only** `{ paused }` is the hold on its own and touches nothing else — the row menu has no form open, so it has no terms to re-post, exactly as `admin/events/[id]` PATCHes its registration hold. Any fuller body is a real edit and is validated in full. **A batch is one promotion, not two hundred**, so an operation on any of its vouchers is an operation on all of them, and the response says how many rows it touched. An edit runs in a **transaction**, because the terms and the price list have to move together: a promotion whose columns saved and whose prices did not is one advertising numbers the checkout no longer holds. The price list is updated in place (never reset, since its rows carry `usageCount`), so a category the organizer cleared loses its row. The `PromoCategory` restriction is **replaced** for every member of the batch, since those rows carry no count, and the trail records `discountValue` and the category count when they change. What a promotion *is* cannot be edited — a code cannot become codeless, a batch's shared label and its random codes stay put, and a voucher stays single-use — because those changes would take the promotion away from people already holding it. Deleting is safe for history: `Registration.promoCode` and `discountAmount` are snapshots, so it removes the ability to redeem, not the record of a redemption. Auth-checked and scoped to the organizer's own rows |
| `cron/expire-pending` | GET, POST | The daily abandoned-checkout sweep (`lib/pending-expiry.ts`). **Not an admin route** — a scheduled job has no cookie — so it is guarded by the `CRON_SECRET` shared secret in `Authorization: Bearer …` (what Vercel Cron sends) or `x-cron-secret` (a person with curl). With the secret **unset it returns 503 rather than running unguarded**, since the deployment that forgot the variable is exactly the one nobody would check. GET and POST do the same thing because Vercel Cron only issues GET; nothing reaches the sweep without the secret. Returns what it did — how many expired, how many redemptions went back, and whether `MAX_SWEEP` cut it short — and logs the order references, since the caller reads nothing |
| `admin/profile/avatar` | POST, DELETE | **The signed-in person's own profile photo** (any account, a client viewer too). POST takes `file` (multipart) through `uploadPublicFile` into `avatars/` in the public store and sets `avatarUrl`; DELETE clears it. **The replaced blob is never deleted** — the blob stores are shared with production (§2), so deleting from a laptop could take the live photo. Audited as `profile.updated` |
| `admin/profile/sessions` | POST | **Sign out other devices** — self-service like the rest of `admin/profile`, any account including a client viewer. Moves the person's own `sessionsValidFrom` (StaffAccount for staff and viewers, the Organizer row for the owner) to `sessionsCutoff()`, audits `profile.sessions.ended`, and reissues this session's cookie. No password asked: it only takes access away |
| `admin/profile`, `admin/profile/password` | PATCH | Self-service only; the id comes from the cookie, never the body. `admin/profile` takes `{ name, email, phone?, currentPassword? }`: **an email change requires `currentPassword`** (`errors.currentPassword`), **a client viewer's email change is refused** (`errors.email`, naming the admin email), and `phone` is saved only on a StaffAccount (E.164 via `phoneOf`, checked by `phoneNumberError`; absent leaves it alone, empty clears it) |
| `admin/team` | POST | **Invites a person.** `team:manage`, and the role must be one `canManageMember` allows. Validated by `readInvitee` + `readAccess` (§5), refusing per field (`errors`). An address that signs in as an **Organizer** is refused; an address that already has a **StaffAccount** gets a second membership on that same account (keeping the name they gave themselves) unless it already has one here. The account (if new), the membership with its hashed token, the assignments and the `staff.invited` trail row are one transaction; the email goes after and **never fails the invite** — the answer carries `emailSent` / `emailError`. Answers 201 |
| `admin/team/[id]` | PATCH, DELETE | One membership of this organizer. Every call first runs **`loadManagedMember`** (`team/[id]/member.ts`): a session with `team:manage`, a membership of *this* organizer ("Team member not found." otherwise), **not the actor's own**, and a role the actor may manage. `PATCH { suspended }` on its own suspends or reinstates (accepted memberships only — an invitation is revoked, not suspended); `PATCH { role, assignments }` changes access, re-checking the new role, updating assignments in place, and writing nothing when nothing changed. `DELETE` removes the membership and its assignments, and the StaffAccount too only if it never set a password and has no other membership. Each change writes one trail row. Takes effect on the person's next request, since `getActor()` reads the membership every time |
| `admin/team/[id]/invite` | POST | **Resends** an unaccepted invitation with a **new** token and a new week — the old link dies. Same guard; reports `emailSent` like the invite |
| `auth/invite/[token]` | POST | **Public.** Accepts an invitation — a team member's, or a **client viewer's** (Batch 3), whose acceptance also moves the client INVITED → ACTIVE **in the same transaction** (conditional on the status read; if the client moved, the whole acceptance rolls back and answers 403), writes `client.invitation.accepted` instead of `staff.invitation.accepted`, and is refused for an archived client. Unknown, used, expired or malformed tokens all answer 410 with one sentence. A new account must send `name`, `password`, `confirmPassword`; an existing account must send its **current password** (a wrong one is written to the trail as a failed sign-in). The membership is claimed with a conditional `updateMany`, so a double press cannot accept twice; then the account becomes `ACTIVE`, the trail gets `staff.invitation.accepted` + `auth.signed_in`, and the session cookie is set for that organizer |
| `admin/clients` | GET | **The client submissions** (Batch 3), `platform:manage` (`platformActor()`). Every client newest first with its fifteen application columns, `invitedAt`, its event count and its **viewers** (the VIEWER memberships on Run As One's tenant: name, email, account status, invited / accepted / suspended / expiry instants — never a token hash) |
| `admin/clients/options` | GET | The event form's Client picker: `id`, `name`, `status` of every client, archived included so an edit form can name a race's existing link. `platform:manage`; **a 403 is how the form knows not to draw the picker** |
| `admin/clients/[id]` | PATCH | **Archive or restore**, `{ status: 'ARCHIVED' \| 'NEW' }` and nothing else (400). The move is checked by `clientStatusAfter` (409 naming the status), the write is conditional on the status read (409 if it moved), and `client.archived` / `client.restored` is written in the same transaction. A status, never a delete; archiving ends the client's viewer sessions on their next request |
| `admin/clients/[id]/invite` | POST | **Send invite / Resend invite** (Batch 3). `{ name, email }` through `readInvitee`, refusing per field. Creates the viewer through the team machinery — a `StaffAccount` if the address has none, a `VIEWER` `StaffMembership` on the actor's tenant with `clientId`, a hashed token (`newInvitation`) — or, for a person whose invitation to this client is still waiting, **replaces the token** (the old link dies). Refuses an archived client (409), an address that signs in as an Organizer, one already on the team or signing in for another client (a membership is unique per person per tenant), and one already signing in for this client while it is ACTIVE. **A restored client whose old sign-in was never removed** is the one non-refusal: inviting that same person makes the client ACTIVE again and emails nobody (`reactivated: true`). The client moves via `clientStatusAfter` (INVITED, or stays ACTIVE), `invitedAt` is stamped, and `client.invited` / `client.invitation.resent` is written — all one transaction, conditional on the status read. The email (`clientInvitationEmail`) goes after and never fails the invite; the answer carries `emailSent` / `emailError`, `resent` and `expiresAt` |
| `admin/remittances` | POST | **Records a remittance** (Batch 6). Multipart: `eventId`, `kind`, `amount` (pesos as typed), `paidOn`, `method`, `reference`, `note`, optional `proof` file. The race is read `{ id, organizerId: actor.orgId }` and needs `remittance:manage` on it (404 *Event not found.* otherwise, 401 signed out); fields through `readRemittance`, refusing per field under `errors` (a bad receipt under `errors.proof`). The receipt is uploaded to the private store before the write; the row and `remittance.recorded` are one transaction. **A payout larger than the balance is allowed.** Answers 201 `{ id }` |
| `admin/remittances/[id]` | PATCH | **Voids one**, `{ void: true, reason }` and nothing else (400). Same reach (404 *Remittance not found.*), a reason through `readVoidReason`, 409 when already voided; the write is conditional on `RECORDED`, and `remittance.voided` (carrying the reason) is in the same transaction. There is no edit and no delete |
| `admin/remittances/[id]/proof` | GET | The receipt, as a redirect to a 5-minute signed URL, after writing `remittance.proof.viewed`. Same reach; 404 when there is no receipt |
| `admin/notifications` | GET | **The bell's feed** (§5 `notification-store.ts`): `{ items, viewerKey, now }`, `no-store`. Any signed-in person (401 otherwise) — each kind is gated by its own permission inside the store, so the route adds no check of its own. `viewerKey` is the person's id, under which the bell files its read marks |
| `admin/search` | GET | **What the quick jump can reach beyond the menu** (`DASHBOARD_SHELL_PLAN.md` Batch 2): `?q=` matched against event titles, case-insensitively, answering `{ events: [{ id, title, day, href }] }` — `href` is that race's **registrants** screen, because a person typing a race's name on event day is looking for the people in it. Any signed-in person (401 otherwise), but what they get back is `reachableEvents(actor, 'registration:view')` — the same gate the registrants page itself enforces — so a STAFF member sees only their assigned races and a **client viewer**, holding `event:view-summary` alone, gets an empty list and keeps the Batch 1 palette. **The filtering has to be here rather than in the browser**: shipping every title to the client so it could match them there would hand a staff member the names of the races they were deliberately not assigned to. A query under 2 characters is answered `{ events: [] }` without a database call, and the result is capped at 8 — the palette is a way to *one* known thing, and the menu's own rows have to stay in view underneath it |
| `admin/communities`, `admin/communities/[id]` | GET/POST, PATCH/DELETE | Club curation. `platform:manage` (`platformActor()`) |
| `admin/site-settings` | PATCH | **The admin email and the social links**, `{ contactEmail }` or `{ socialLinks: { facebook, instagram, tiktok, youtube } }` — **only the fields sent are validated and written**, so each panel saves alone. `platform:manage` (`platformActor()`). Email trimmed and shape-checked (`errors.contactEmail`); each link checked with `socialLinkError` (`errors.<channel>`), stored through `normalizeLink`, empty → null; 400 on any error. An unchanged value writes nothing. Upserts the `SiteSettings` row and writes `settings.contact_email.changed` and/or `settings.social_links.changed` (on the *Site settings* Activity shelf) in one transaction, then `revalidateTag(SITE_SETTINGS_TAG, { expire: 0 })` so the next page and email already carry it. Answers `{ settings: { contactEmail, socialLinks } }` |
| `admin/platform-fee` | PATCH | **The default platform fee** (`SETTINGS_PLAN.md` Batch 4), `{ adminFee }` in pesos as typed. `org:settings` (Super Admin only; 403 otherwise). Checked with `readPlatformFee` (`errors.adminFee`, 400). Writes `Organizer.adminFee` on the actor's tenant and `settings.platform_fee.changed` (`entityType: 'Organizer'`, old and new centavos in `changes`, on the *Site settings* shelf) in one transaction; an unchanged value writes nothing. **Existing events are not touched.** Answers `{ adminFee }` (centavos) |
| `admin/feedback`, `admin/feedback/[id]` | GET, PATCH/DELETE | The feedback inbox. `platform:manage` only (`platformActor()`) — a client or a per-event staff member reading it would be reading others' complaints about the software, and strangers' email addresses. `GET` returns everything newest-first rather than paged: the whole table is the messages people took the trouble to write, and if it ever outgrows one call that will be a good problem. **`PATCH` moves the triage mark and nothing else** — the message, the name and the address are what somebody else wrote, and an inbox that can edit its own mail is one whose contents cannot be trusted later. `DELETE` is a genuine delete, unlike anything on a registration: there is no person waiting on the row, nothing in the product reads it, and a kept-"in case" spam row is one more thing between the owner and the messages that matter. The screen confirms first |

