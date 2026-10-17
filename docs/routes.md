<!-- Part of the Run As One project guide. This file is §6, the routes; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 6. Routes

### Public
| Path | What it is |
| --- | --- |
| `/` | Home. Hero + up to 6 **upcoming** events, soonest first. Events are the point of this page. The hero stands under an animated brand-coloured dot arch — see `HeroArcBackground` in §9 |
| `/events` | Full upcoming listing |
| `/events/[slug]` | Event detail and registration entry point. **A draft or scheduled event (`Event.publishAt`, `lib/event-visibility.ts`) is a 404**, except to signed-in staff who may open it, who get the page with an amber *Preview* line (`lib/event-preview.ts`); its `/register` is a 404 to everyone. **Redirects to `/results/[slug]` once the race is over and its times are uploaded** — see the section rule below. **A results-only event** (`Event.resultsOnly`) redirects there as soon as it has results, whatever its date, and is a **404 until then**; it is never on `/` or `/events`, and its `/register` redirects back here instead of rendering a wizard. A finished race with no times yet stays here and says so. Carries `PromoHighlights`: the automatic promotions running on this race, named before the runner starts. Codes are never listed there — those are the organizer's to hand out. **Each row of the Categories / Packages sidebar is a link into the wizard with that option already chosen** (`registerPath(event, cat)`), wearing Register Now's chevron and its `LinkPendingIcon`. Only while Register Now itself shows: a full option, or every option while the race is paused, not yet open, full or over, stays plain text. **A race whose sign-ups have not opened yet** puts *Registration Opens Soon* and the date where Register Now stands, and its listing card wears an `Opens Oct 5` chip with a *View Event* button instead of the gradient one — the race is listed early on purpose, so the card and the page both stay readable The sidebar's logistics list names pick-up with `pickupLabel` (`lib/pickup.ts`): *On-site Pickup Available*, or *Kit Pickup Available* on a virtual run. |
| `/events/[slug]/register` | The wizard — `RegistrationWizardClient` (ONLINE: 3 steps, plus step 4 for proof when the runner picks bank transfer) or `BankTransferWizardClient` (3 steps). Steps: **1** runners & categories, **2** logistics, **3** checkout/payment, **4** proof upload. **The waiver sits directly above the button that submits:** on step 3 for online and free orders (above *Pay*), on step 4 for a bank transfer (after the deposit slip and transaction number, above *Submit & Finish Registration*) — the same order as `BankTransferWizardClient`, whose single step 3 already runs upload, waiver, submit. **`?category=`** preselects the first runner's option (`initialCategoryId` on both wizards); the page resolves it against this event and its slot counts, so an unknown or since-filled option is not preselected. **With no usable `?category=`, an event with only one option still open (`soleOpenCategory`) opens with that one already chosen** — a single-distance race, or one whose other options are full — and `CategoryPicker` then heads it "Your Category" / "Your Package" with a line saying it is the only one open, instead of "Select …" over a choice of one. Two or more open options wait for the runner. Runners added later inherit runner 1's choice as before. The **proof upload on step 4 takes a PDF as well as a photo** — a bank confirmation arrives as one — and both its `accept` attribute and the hint under the drop zone are built from `uploads.ts` rather than typed out, so what the picker offers is what the server will take. **When the order comes to ₱0 both wizards drop their payment half** (`isFreeOrder`, `PACER_DISCOUNT_PLAN.md` Batch 2): the last step is headed *Review & Confirm*, the online wizard hides every payment method (and can therefore never reach step 4, so the counter stays at three), the bank-transfer wizard hides the bank panel, the drop zone and the reference-number box, the total box reads *Nothing to Pay* with a line saying so rather than leaving a runner to infer it from a zero, and the button reads **Complete registration**. A waived admin fee is shown **struck through beside ₱0.00**, not removed: the pacer was told the fee was covered, so the line that says so has to stay visible — and no transaction fee is computed or shown, because there is nothing for it to be a share of. Hidden rather than disabled throughout: a bank panel on an order worth nothing would have a pacer hunting for a payment to make. The bank wizard's success screen reads the **saved** registration (`status === 'PAID' && totalAmount === 0`) rather than its own state, which is back at defaults after the round trip, and then says *Registration Confirmed* / *Total Paid* instead of promising a verification that will never come. Both success screens read the stored total with `??`, never `||`, or a free order's ₱0 would be thrown away for a freshly-defaulted local figure. **The sidebar's event heading is one component both wizards share (`WizardEventHeader`):** the picture, the title and the race day — or, for a virtual run (`isVirtual`, `lib/event-format.ts`), two rows — the calendar icon with the window from `formatEventRange`, the globe icon with *Virtual · Run anywhere* — and no venue, the same line the public card prints. Step 2's pick-up card is titled by the same `pickupLabel` (*Kit Pickup* on a virtual run). |
| `/results` | Finished-event landing, most recent first — the same `EventGrid` card as `/events`, with `action="results"` |
| `/results/[slug]` | Winners board. Each division is one `DivisionPanel` (the male and female podiums differ only by accent). **On a phone a podium row is two lines** — the name gets the full width beside the medal, the bib and time share the line under it — because on one line the medal, gaps and time left the name ~70px and every winner read "DANIEL…"; from `sm` the time returns to the right edge. The category heading always reads `{name} ({distance}) Winners` — "10K (10KM)" included, so every category reads alike — and carries no icons; a package, having no distance, drops the brackets. **Pacers are left off the podium** (`pacerResultMatcherForEvent`, §5 `pacer.ts`): matched by bib, or by name within the pacer's category, and dropped before each division's top three is taken, so the next finisher moves up |
| `/results/[slug]/full` | Full searchable table; category filter via query param. **The table shows from `lg` only**; below that it is cards — one column on a phone, two on a tablet — because seven columns need ~800px and between `md` and `lg` the table overflowed behind a hidden scrollbar, cutting off Actions. **There is no row-number column**: rows come grouped by category in category-rank order, so a running count read like a place but was not one — it ran on across categories (the 10K winner showed as No. 201) and counted pacers, who hold no place. Category Rank and Gender Rank carry the placing. Tapping a row turns its Actions button into the running figure until the runner's page loads. A count line says how many finishers match; **Clear filters** sits at its right end, faded in only while the search or a filter narrows the list. It clears the search and both filters with `setColumnFilters([])` — not `resetColumnFilters()`, which would restore a category that came in the link — and moves focus to the count, not the search box, so a phone does not raise its keyboard. It is always laid out (no line-height jump) with a 44px target held inside the line by negative margins. The pager has first/last as well as prev/next, 40px targets, and **turning the page scrolls the top of the list back under the navbar** when it has scrolled away. The two filter menus split the row on a phone, the second opening from its right edge; both, and the rows-per-page menu, close on an outside press or Escape (`useDismissableMenu`). The search field is 16px on a phone — see §9. **A row's Actions menu opens the e-certificate in place** (`useECertificate`, §5): *View E-Cert* used to link to the runner's page with `?cert=1`, costing the reader their place in the list; now the item reads "Generating…" until the certificate is drawn, then the menu closes and the dialog opens over the leaderboard. *View Details* still goes to the runner's page. **A pacer's row carries an orange *Pacer* tag** beside the bib and gender (table and card alike), stays where its time puts it, and shows "-" for Category and Gender Rank; everyone behind moves up (`withPacerRanks`, §5 `pacer.ts`); the page sends the client only an `isPacer` flag per row, never the pacer list |
| `/results/[slug]/[bib]` | One runner's result, addressed by **the number they wore** — `/results/bizrun-v2-0/1042`, not a 25-character cuid — because this is the link a runner shares and should be able to read, recognise and even type. `@@unique([eventId, bibNumber])` is what makes a bib a valid address. The segment is read as a bib first and as a row cuid only if that finds nothing, so every cuid link already sent to a runner still resolves and is then redirected to its bib address. Build these with `runnerResultPath(event, result)`. Plus `ECertificateGenerator` — the button, over the shared `e-certificate.ts` / `ECertificate.tsx` (§5); `?cert=1` still opens the certificate on arrival. Container is `max-w-5xl`, wide enough that the four analytics tiles get a real column each — they go four across from **860px**, the width at which a tile can hold "Overall Rank" on one line, and sit two across below that. The hero splits into name + time panel at `md`, where the name column is at its narrowest (~300px); the name sizes are tuned against that width so no word ever has to break in half. The card is built to hold **any** name: the time panel never shrinks and the name's display size steps down as the name gets longer (see §9), so a 30-character name and a 9-character one produce the same card. The certificate shrinks the drawn name to fit the page for the same reason. The *View E-Certificate* button is full-width on phones and a centred `w-fit` on desktop. The card's padding and the tiles' step down on a phone (and again under 360px) so every tile label holds one line down to 320px; the gender tile reads "in Male division", not "in M". **Back to Leaderboard** opens `/full`, where the search is — it used to say "Back to Search" and open the winners board. **The certificate opens as a bottom sheet on a phone** and a centred dialog from `sm`, closes on Escape and locks the page's scroll. The PDF is previewed inline (`#view=Fit`) only where `navigator.pdfViewerEnabled` and a fine pointer both hold — Chrome on Android paints an empty grey box and iOS Safari a cropped corner — and a phone instead gets a summary of what the certificate says, with the download as the way to see it. *Share Result* uses the share sheet where there is one and otherwise copies the link and raises a toast. **A pacer wears an orange *Pacer* pill** beside *Finisher*. Both rank tiles and the certificate use the pacer-free ranks (`withPacerRanks`, §5 `pacer.ts`): a pacer's tiles read "-" with no total and their certificate has no rank tile; everyone else's totals leave pacers out |
| `/feedback` | **The one place a runner or an organizer tells us about the app itself** — a broken page, something that could be easier, something they wish it could do. A page rather than a floating widget on purpose: a persistent bubble covers the bottom-right corner, which on a phone is where the wizard's Next button and the leaderboard's pager live, and the home page is meant to showcase events rather than argue with a badge. So the entry points are **placed**: the footer's Legal & Support column, on every public page, and the button beside *Return to Homepage* on both registration success screens — the one moment we know somebody has just used the app end to end. The form asks the kind first and **the prompt in the message box changes with it** (`FEEDBACK_KIND_COPY`, §5); name and email are optional and say so, because a required contact field is how a feedback form ends up collecting nothing. `?from=` carries the page the sender came from, validated by `asSitePath` and **shown to them** rather than collected quietly, along with the browser version. The reveal is the stagger (`.t-stagger`), and the thank-you replaces the form through the same motion rather than as a jump cut. The support address stays on the page under the form: some things need a screenshot, and a form is the wrong shape for those |
| `/pay/[token]` | **The resume-payment page** (`UNPAID_FOLLOWUP_PLAN.md` Batch 3): where a runner lands from the payment link staff copied, to finish paying an abandoned online order without registering again. `noindex`, throttled (`PAY_LINK_RULE`). Shows the race, race day, the runner count, the method, the reference, *Pay by* (`expiresBy`, the same time the tab shows) and the amount, and **no name, email, phone or birthdate** — the link gets forwarded. **Pay now** (`PayNowButton`) posts to `api/pay/[token]` and follows its URL; an answer with a `state` refreshes into that state's panel. Every other case is its own designed `StatusPanel`: already paid, cancelled, expired (both offer *Register Again*), online payment unavailable, link not valid or expired, too many tries |
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

### Hosts: the main site and client sites (`CLIENT_SUBDOMAIN_PLAN.md`)
`src/proxy.ts` runs on every page (not `/api`, `_next` or static files) as well
as on `/admin/**`. It reads the host's client label (`lib/site-host.ts`) and
forwards it as `x-rao-site`, with the URL as `x-rao-url`, after deleting any
the browser sent. **On a client's site** (`crc.runasone.ph`, `crc.localhost:3000`):
`/` → 307 `/events`, and `/admin/**` — the public admin pages included — →
307 to the same path and query on the main host, **before** the session check,
because `admin_token` is host-only. (Under `next dev` that second move is a
refresh page, since Next rewrites a `Location` on the host it thinks it serves
into a bare path.) Staff set a client's subdomain and branding in the client
panel's **Site & branding** section on `/admin/clients`.

**What a client's site shows** (Batch 2). The root layout reads
`getSiteClient()` (`lib/site-client.ts`) and hands it to the navbar and
footer: the **client's logo** (its name as a wordmark when none is uploaded)
linking to `/events`, and the client footer (`components/ClientSiteFooter.tsx`,
D9: logo, name, public email / phone, website, socials, Run As One's address
for payment concerns, Privacy / Terms / Feedback, "Powered by Run As One"; no
Organizers column). `/events` lists only that client's upcoming races
(`clientId`, still `resultsOnly: false`) under its **hero**
(`components/ClientSiteHero.tsx`, the event page's `.event-hero` banner: hero
image, headline — the client's name when only an image is set — and tagline;
none when neither image nor headline is saved, and the usual heading instead).
`/results` lists only its races with results, **results-only races
included**, under the plain heading. The page title is "*Client* | Events &
Results", `metadataBase` is the client's origin, and the **tab icon is the
client's site icon** (`faviconUrl`, a square upload; Run As One's mark when
none is saved — never the logo, which would be stretched). `/privacy`, `/terms` and
`/feedback` work there unchanged; `/pay/[token]` is moved to its order's own
site by `ensureEventHost`, so it wears that organizer's branding. An unknown
or archived label is sent to the main site from the layout, path and query
kept.

**Wrong host.** `/events/[slug]`, `/events/[slug]/register`,
`/results/[slug]`, `/results/[slug]/full` and `/results/[slug]/[bib]` call
`ensureEventHost(event)` first: a client's event opened anywhere but its
client's site goes there, a no-client event goes to the main site, path and
query kept (PayMongo's `?success=true&orderRef=…` included). Those pages stream
under `loading.tsx`, so the move arrives as Next's in-stream redirect (the
client router, with a meta-refresh fallback) rather than a header 307; same as
the canonical-slug redirects they already made. Each sets
`alternates.canonical` to the page on `eventOrigin(event)`
(`eventPageMetadata`). **On the main site, event and result cards** (home,
`/events`, `/results`) link a client's race straight to its subdomain
(`EventGrid`'s `siteOrigin`, from `eventLinkOrigin()`), with no redirect hop.

**Payment comes back to the event's site** (Batch 3). `api/checkout`'s
return URLs, `api/pay/[token]`'s success and cancel URLs, and the
`/pay/[token]` link staff copy or email (`lib/payment-link.ts`) are all built
on `eventOrigin(event, request.url)`: a client's race returns to its
subdomain whichever host the request came from, a no-client race to the main
site. The registration emails carry no other link. Staff's *Copy registration
link* (Unpaid checkouts) still builds on the admin host and reaches the
client's site through `ensureEventHost`.

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
alone. Both sit in `.dash-header-tools`, the last flex item in every page's
`DashboardHeader` row (handed down from `DashboardShell` through context), so
a long name pushes the title to ellipsise rather than running under it. Pressing the bell
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
`admin/ViewerDashboard.tsx`, reading `client-summary.ts`): *Your Events* — four
tiles (Registered Runners, Paid, Awaiting Verification, Unpaid Checkouts) over one card per race: the
poster at 16:9, the events table's own registration badge
(`events/registration-state-badge.ts`, shared so the two never word a state
differently; *Opens …* under Scheduled), title, date and place, the total (paid plus awaiting verification — **an unpaid online checkout is
never a registered runner**), a paid / awaiting / unpaid bar that is
`aria-hidden` with the numbers written beside it in words (unpaid the lighter,
neutral segment), a one-line explanation of unpaid checkouts when a race has
any (the viewer has no list to open), and each category's total with
`N paid · N awaiting` (`· N unpaid` when there are some). **No money, names
or references.** The whole card is pressable: its foot is a tinted bar,
**View race details and report →**, whose link is stretched over the card, so
the card lifts and its border turns blue under the pointer while staying one tab
stop. Each card's **By category (N)** is a closed `<details>` above that link
(opening it does not open the race), so cards in a row share one height with
their bars aligned; while one is open, the grid's cards keep their own heights.
Races still ahead sit under **Upcoming events (N)**; races already run fold
under **Past events (N)**, closed unless nothing is ahead; opened, it shows six
cards and a **Show N more past events · M left** button that adds six at a time
in the browser (`PastEventsGrid.tsx`; no URL change, focus moves to the first
new card). The grid is one
column on a phone and ~340px columns after; a category's counts drop under its name when they cannot share
the line. With no linked race the tiles read 0 over *No events linked yet*,
naming the client. The wait draws four tiles over a section title and three
event cards (`VIEWER_OVERVIEW_SHAPE`). Between the tiles and the cards, one link row —
*Preparing your e-certificate?* … **Read the template guide →** — opens
`/admin/certificate-guide`. A viewer's sidebar is **Dashboard and the
E-Certificate Guide**, Settings in the account menu, and **every other
`/admin` screen answers it with *Not Part of Your View*** (`admin/forbidden.tsx`,
§7) — Settings stays, name, email and password as for anyone.

**`/admin/your-events/[id]` is one of a client viewer's races**
(`CLIENT_RACE_PAGE_PLAN.md` Batches 1–3, `admin/your-events/[id]/page.tsx`, its
sections in `RaceReport.tsx`, reading `client-race-report.ts`). `requireActor()`, then the report decides: a race
the person may not see — another client's, removed, or a made-up id — is the
same *Race not found* panel. Breadcrumb *Your Events*, the race as title, and
Dashboard stays lit in the sidebar (`isActivePath`). **Staff read the same
page** (`SHIRT_COUNT_PLAN.md` D5; `event:view-summary` is every role's),
reached from the Events table's row menu as **Race Report**, under
Registrants; for staff the breadcrumb, and the not-found panel's way back,
is *Events* (`/admin/events`), since their `/admin` is the team dashboard. A wrapping line of the
registration badge, date and place; the four count tiles; then four panels,
each with one sentence saying what it counts: **Slots per Category** (registered,
`N of M slots left` with a fill bar, *Almost full* at 90%, *Full* at the limit,
*No slot limit* when unlimited — taken slots include unpaid checkouts, as on the
public page), **Registrations over Time** (`RegistrationTrend.tsx`: *Last 7
days* and *Busiest day* over a bar chart, a bar per day since the first order —
per week past 62 days — one series and one axis, no library; hovering a bar's
column shows its day and count, and *Show the numbers* opens the same counts as
a grid of day chips across the panel's width, only the days someone
registered; the PDF prints those chips open under *Runners per day*, since a
printed bar has no hover), **Shirt Sizes** (**pieces to order, not runners**,
`SHIRT_COUNT_PLAN.md`: a totals line by type — *8 singlets · 5 T-shirts · 13
pieces*, a type nobody gets left out, the pieces total only when there are two
types — then one block per garment named in the categories' *What's
Included*, singlets first: its name, a *Singlet* / *T-shirt* tag in words,
its piece count, *With* the categories it comes with, and its sizes as
wrapping tiles in chart order. No runners-per-size-by-category view (owner,
2026-10-08): its runner counts read as wrong next to piece counts, and kits
are packed from the Runners list. Spelled-out sizes such as *Large* count as
their code), and **Race Kits**
(pickup, with the pickup place and schedule or a line saying none is set, and
delivery, split *Inside / Outside Province* only where the race asked). Counts
only; no wide tables, so nothing scrolls sideways on a phone. **Save report as
PDF** prints a light copy of the same sections with a title block (`PrintableCopy`,
below; paper layout in `race-print.css`) — the sizes are what goes to the shirt
supplier. The button is in the page, never the header, and not in a column of
its own: from 640px up it sits at the end of the race's status line
(`.race-toolbar`), above the tiles; on a phone it comes right after Race Kits,
the last printed section, in the guide's *Sending this to your supplier or
team?* panel (`SavePdfPanel`) with a line naming what the PDF holds. The
button says "report", not "Save as PDF", and the screen-only panels below sit
under a dashed rule and a **Not in the PDF** heading (`.race-screen-only`), so
an organizer does not read the six panels as one export. The four tiles sit four, two
or one to a row by the report's own width (a container query), never three
and an orphan. **Payout Summary** (Batch 3, `PayoutSummary.tsx`, reading
`client-payout.ts`) opens the *Not in the PDF* group, **on screen only** — the printed copy is
for a shirt supplier and never carries money, whatever is passed. It is drawn
only for someone holding `event:view-payout` on the race (the race's client
viewer, an owner or an admin; a per-event staff member sees the page without
it): five figures that add up — *Collected*, *Run As One fees* (platform
fees only), *Payment processing fees* (the transaction fee, never naming
PayMongo to a client), *Paid out to you*, *Still owed* (read *Overpaid* when
negative) — five across, or two pairs with *Still owed* across the bottom, or
one column, one plain sentence on where the race stands, then the payouts
latest first as day, method and amount, a return listed as a negative amount
*Returned to Run As One*. Its hint says confirmed payments only. **Runners** (Batch 4, `RunnerList.tsx`, reading
`client-runners.ts`) follows it, also **screen only** and only for someone
holding `event:view-runners` on the race: the list a client releases and
ships race kits from, built like the staff Registrants table. Columns: mark
checkbox, runner (name over runner ref), category, size (the size table's
code; *No shirt* for a package with nothing to wear), a *Paid* / *Awaiting
verification* badge, race kit (*Pickup* / *Delivery*, with the delivery area
under it), contact (tap-to-call phone, mailto email that wraps only at its
`@`) and address (the ship-to address for a delivery, the home address for a
pickup, *Not given* on rows from before addresses were asked). A table from
`lg` up, `AdminCardList` with mark boxes and *Mark all on this page* below,
`AdminTablePager` under both (25 a page). Every runner arrives with the page;
the search (name, ref, phone or email, every word must match), the **Filters**
chip (Category, Status, Race Kit, Shirt Size in chart order, Province) and the
paging all run in the browser. **Export to CSV** (`runner-csv.ts`, the staff
export's quoting, phone-as-text and BOM; `runners_<race>.csv`) takes the
marked rows when any are marked — the button reads *Export Marked (n)*, with
*Unmark All* beside it — and every filtered row otherwise; it tells the
activity trail first (`list: 'client'`). On a phone, marking slides up the
staff screen's bulk bar (*n marked*, Export, Clear). Left out on purpose
after the owner's look at a competitor's portal: withdrawals, a per-order money
ledger, promo-code tools, inventory allocation and courier stages.

**`/admin/certificate-guide` is the e-certificate template guide**
(`ECERT_GUIDE_PAGE_PLAN.md`, `admin/certificate-guide/`), for **everyone signed
in, client viewers included** — `requireActor()`, not `requireTeamActor()`,
because it is static text with no data in it (§7). It tells an organizer's
designer how to make artwork the app can print on: the layout diagram
(`GuideDiagram`, its content-area band drawn from `CONTENT_AREA_PRESETS`), the
file specs (the size limit read from `MAX_UPLOAD_MB`), what is printed for each
runner (Always / Optional tiles, and a line on the pacer edition), do and
don't, what to send with the file, and a 7-item checklist that is not saved
(`GuideChecklist`). Every number that is a constant in code is read from it, so
the guide cannot drift from the certificate (`GuideDocument`'s header lists
which rule lives where). **Save as PDF** is `window.print()`
over a light copy portalled onto `<body>` (`admin/PrintableCopy.tsx` with
`admin/print-copy.css`, shared with the client race page; the consent
sheet's pattern; the copy sets `data-theme="light"`, so the tokens turn light),
because the designer usually has no account. On paper (`guide-print.css`) a
section is a heading over a hairline rather than a boxed panel, only small
units are kept whole, and the page margin is 0 with the copy inside a
one-cell table whose empty header and footer rows repeat as the margin, so
the browser has nowhere to stamp its date and URL: three A4 pages. **The
button is not in the page header** (no other dashboard screen puts an action
there on a phone): from `xl` up it heads an aside to the right of the
article, sticky under the header, over an **On this page** list (`GuideToc`)
that marks the section being read; a link scrolls to it (instantly under
reduced motion) and replaces the hash, so Back still leaves the page. Below
`xl` the aside is not drawn and the button closes the page in its own
*Sending this to a designer?* panel. Either way its one-line hint says the
print dialog opens with "Save as PDF" as a destination. It is reached from
the sidebar's **Help** group (its own trailing group; unlabelled in a viewer's
two-row sidebar), the quick jump, the viewer's Overview, and a **Template
guide** link under the template upload in E-Certificate Settings, which opens
in a new tab so an unsaved edit is not lost. `robots: noindex`. Its wait is a
document shape (`route-loading-shape.ts`). Everyone else's `/admin` is the
dashboard's **Overview** (`OVERVIEW_PLAN.md` Batch 1), four blocks and no more
— the owner wants the work queue and the numbers, but not a long page:
**tiles** — **Total Revenue (Net)** (`subtotal + deliveryFee − discountAmount`
of PAID orders), **Total Registrants** (runners on PAID orders and on bank transfers awaiting verification — the same registrants every screen counts, never an unpaid checkout), **Active
Events** (races not finished, `upcomingEvents`), plus **Platform Fees
Collected** (the `platformFee` of PAID orders) for `platform:manage` only — all
**all-time**, with no period selector (per-period money is
`/admin/remittances`). **Every tile is a link**: the money tiles to
`/admin/remittances` for `remittance:manage`, otherwise to `/admin/events`; the
other two to `/admin/events`. Then **Awaiting Verification** — PENDING **bank
transfers** only (an online PENDING waits on PayMongo and is swept by
`pending-expiry.ts`) that still have a live runner (an order emptied by
removing its runners is nobody to verify), the count in the heading, the five **oldest first**, each
with the customer, race, reference, runners, amount and **how long it has
waited** (amber from 48h), each opening
`/admin/events/[id]/registrants?search=<orderRef>`. **With nothing waiting it
is one quiet line** (`.overview-quiet`), not an empty state, so a calm morning
does not lengthen the page. Then **Live Events** — one row per race not
finished, soonest first, up to six (then *All N* to `/admin/events`): title,
runners paid, awaiting verification and — when there are any — on unpaid
checkouts (`heldPlacesByCategory`; only the first two are registrants), a fill
bar with unpaid as a lighter neutral segment, and *N of M slots* (all three
hold a slot) when every option is
capped (else *No slot cap*, the same reading `fullEventIds` gives), and the
date; each opens its registrants, and its *N unpaid checkouts* is its own link
to `?tab=unpaid` (the title's link stretches over the row,
`.overview-row.has-links`, since a link cannot hold another). Hidden when nothing is live. Last, the five
most recent PAID registrations, each reference opening its order the same way
(*View Order* on a phone's card); empty, it offers *Create Event* (or *Go to
Events* without `event:create`). **Everything is counted by the database** — an
`aggregate`, two `count`s, two `runner.groupBy`s and three bounded `findMany`s,
run together — never a whole table reduced in JavaScript, and every query goes
through `reachableEvents(actor, 'registration:view')`, so a STAFF member's
queue and numbers cover only assigned races. Dates are the **Manila** day
(`formatInstantDay`). The wait draws the tiles, the queue as its quiet line,
two live rows and the recent list (`route-loading-shape.ts`, `linkPanels`).
There is no *Page Views* tile: it was a placeholder that only ever read `N/A`,
and a metric card that never carries a number teaches an organizer to stop
reading the row. Do not re-add a tile until something real counts behind it · **`/admin/login`** — a server `page.tsx` that sends a signed-in person (`getActor()`, so a revoked session gets the form, not a loop) on to `next`, and otherwise draws `LoginClient.tsx`, which returns there after sign-in and has a "Keep me signed in" box (30 days, off by default) that the password form sends and the Google link carries as `?keep=1`; `next` is set by `src/proxy.ts` and always read through `safeNextPath` (`lib/next-path.ts`, §7). The password box is the shared `admin/PasswordField.tsx` (reveal button), and both boxes carry autocomplete tokens for password managers (`LOGIN_UX_PLAN.md` Batch 1). It links *Forgot password?* under the password box, and `?reset=1` shows a green "Password updated" banner (Batch 2). Above the form, once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, **Continue with Google** (`login/GoogleSignInButton.tsx`, Google's dark-theme button, Roboto Medium via `next/font`) and an "or" divider; `?error=<code>` shows that code's sentence from `lib/sign-in-errors.ts` and nothing for an unknown code (Batch 3) · **`/admin/two-factor`** (**public**, `noindex`; `TWO_FACTOR_PLAN.md` Batch 3) — the second sign-in step, where both doors land for an account with two-step sign-in on; without a valid pending cookie it redirects to `/admin/login`. `TwoFactorClient.tsx`: one 6-digit box (`inputMode=numeric`, `autocomplete=one-time-code`), *Use a recovery code instead* (swaps the box), *Back to sign in*. A refusal that ends the pending sign-in goes to `/admin/login?error=<code>`; a recovery code shows how many are left before *Continue*, and links Settings › Security when 3 or fewer · **`/admin/forgot-password`** (**public**, `noindex`; Batch 2) — an email box, then "Check your email" whatever the address was; it says an invitation not yet accepted cannot be reset · **`/admin/reset-password/[token]`** (**public**, `noindex`, `referrer: no-referrer`) — a server page that reads the link through `findReset` (`lib/password-reset.ts`): open → `ResetPasswordClient.tsx`, a new password and its confirmation (`PasswordField`, `new-password`), then `/admin/login?reset=1`; used → "already used"; expired, unknown, or an account no longer allowed → "expired"; both with *Request a New Link* · **`/admin/register` — the service inquiry,
titled "Inquire About Our Services" and linked as "Our Services" from the
Footer and the sign-in page (`SERVICE_INQUIRY_PLAN.md` O2; the URL is kept so
shared links still work), which since `ADMIN_MERGE_PLAN.md` Batch 3 creates a
`Client` submission and no account** (both drawn without the sidebar, and both carrying
`AuthHomeLink` back to the public site — §8). A server `page.tsx` carries the
metadata title; the form is `RegisterClient.tsx`. Its copy reads as an inquiry
for a service, never a partnership or an order (S2): the subtitle names every
service, and nothing promises a price or a date. It is a **three-step form**, not
a sign-up box: *Your organization* (name, kind, city + province, website or
Facebook page, how many events they have run), *You and how to reach you* (the
contact person and their role, email and a `+63` mobile number — **no password**:
its two boxes were removed in Batch 3, and the step's blurb says we reply by
email or phone)
and *What you need* (the services, the event they are for — name, date
and place — the size they expect, a free-text note, and a consent line). The
mobile number is the **runner wizard's own `PhoneField`** — flag, dial code and
country menu — rather than a second phone control built for this page; there is
one right way to type a number on this site and it already existed. It brings
its own `.input-group`, so only its radius and ground are reconciled to this
card, and it gained an optional **`hint`** prop in the same change so small
print lands *above* the error rather than under it (a hint below a red line
reads as part of the complaint). The wizards pass none and are unchanged. "Which
services do you need?" (`ServicesQuestion.tsx`, Batch 2) offers every service
Run As One sells in groups: **Online** (Online Registration, whose hint carries
the payments and promo codes; Results and E-Certificates; Custom Website), **Race day**,
fulfilled through suppliers (Race Timing, Race Bib Production, Race Kit
Fulfilment), *Not Sure Yet* — which cannot share the answer with any other, a
rule `servicesOf` enforces on the route too — and **Coming soon**, greyed,
tagged and not tickable (`COMING_SOON_SERVICES`, dropped by the route). It asks all of it because Run As One decides from it whether and how to run
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
ribbon (`ThankYouPanel.tsx`) — three numbered steps that **follow the services
chosen** (`signInComing`, §5, which `/admin/clients` will share): with Online
Registration, we read it; we call or email to agree the details, the price and
settlement; **you get your sign-in**, described as a view of the race's
registrations and results while our team runs the rest. Without it, the third
step is **"No sign-in needed"** (S5). Then the address the
reply will go to, which is what stops somebody applying twice an hour later.
Its button goes back to the public site, not to sign-in, since the applicant
has no account yet. **A second application from the same address** is refused
under Email with `ALREADY_APPLIED_MESSAGE` (§5), the route's exact text; the
form recognises it and draws `ReachUs.tsx` beneath it — the saved contact
address and each social channel with a saved link (S3) ·
`/admin/events` (**the list is in the order staff work it**: races still to
come first, soonest at the top, then the races already run, most recent first —
sorted in `events/page.tsx`, which also fixes each row's **No.** (`listNo`) so a
search, filter or column sort never renumbers it. A **Registrants** column
counts the registrants — runners on PAID orders and on bank transfers awaiting
verification, in people not orders, removed runners excluded, the same people
the registrants screen lists (`heldPlacesByCategory` in `pending-expiry.ts`,
three grouped queries for the page). The count is a **link to the registrants
screen**; hovering or focusing it opens a tooltip (`.reg-count-tip`, the rail
tooltip's `--tt-*` tokens) splitting it into *Paid / Validated* and *Awaiting
verification*. **Unpaid online checkouts are never in the count**
(`UNPAID_ORDERS_PLAN.md`): a dashed **"+N unpaid"** chip sits beside it, whose
hover or focus explains *Online checkout not paid yet. Expires
automatically.* It links to the registrants screen's **Unpaid checkouts** tab
(`?tab=unpaid`). **One
*Filters* chip at every width** (`FiltersMenu`, §9 — the pattern every table
filter copies) opens a popover (a bottom sheet on a phone) holding **Client** (only
for `platform:manage`, built from the listed races' clients plus *No client
yet*) and **Registration Status** (the `REGISTRATION_STATES` labels); the
filters narrow the data before the table, so search, sort and the pager work
inside the result. The row menu carries **Race Report** under Registrants
(the race's `/admin/your-events/[id]` page, which staff read as the client
does),
**Publish Event** (**Change Publishing** on a live row; `PublishModal`, the
same `PublishPicker` as the create form, `EVENT_PUBLISH_PLAN.md`): publish now,
schedule it, or — only while the event has **no registrations** — back to
draft. A draft row wears a neutral *Draft* badge beside its title, a scheduled
one an amber *Scheduled* badge with *Goes live Oct 20, 8:00 AM* quietly under it (the hour matters for a same-day schedule); a published row wears none. And
**Schedule Sign-Ups**, which opens a modal holding the same
`RegistrationOpeningPicker` the create and edit forms use: open registration
now, or name the date and time it opens itself. Saving either answer also lifts
a manual hold, since both are the organizer saying when sign-ups happen. A
scheduled row shows a *Scheduled* badge with the opening date quietly under it.
**Close Sign-Ups** (after a confirm) closes registration for good — the row
reads *Closed*, Schedule and Pause leave the menu, and the item becomes
**Reopen Sign-Ups**, which hands the row back to its hold, schedule or counts.
Runners see *Registration Closed* on the event page, a *Closed* chip on listing
cards, and both checkout routes refuse with 409.
**The table lists only races that take sign-ups here**: `reachableEvents(actor)`
AND `resultsOnly: false` (`RESULTS_NAV_PLAN.md` R5, Batch 3) — a results-only
event lives under Results alone, so every row here has registrants, a race
report and sign-ups to schedule, pause or close. The special results-only row
(a muted **—** for Registrants and a menu cut down to Manage Results, Edit and
Delete) was removed in that plan's Batch 4 once none could reach the table;
the `EXTERNAL` registration state and its *Results only* badge stay, because
the server gates and the edit form still use them. The table is
`EventsTableClient` (toolbar, table, cards) over `event-columns.tsx`,
`EventRowCells.tsx` (the cells the table and card share), `DeleteEventModal`
and `useEventRowActions` (the pause, close, schedule and delete requests).
Plus `/new` and `/[id]/edit` — both open on an optional **Client** picker
(`events/EventClientField.tsx`, `AdminSelect`: *No client yet* plus every live
client, and an archived one only when the race is already linked to it), drawn
**only for `platform:manage`** — it asks `admin/clients/options` and renders
nothing on a 403, and the form sends `clientId` only when it drew the picker;
below `sm` both keep Cancel and Save in a bar
stuck to the foot of the screen, below `lg` an uploaded image's Remove is a bar
under it rather than a hover overlay, and the certificate preview comes above
its controls. **The edit screen's E-Certificate is one line** linking to the race's results workspace
(*Open in Results* → `/admin/results/[id]`), and the form no longer sends the certificate fields
(`RESULTS_NAV_PLAN.md` Batch 2), so two screens never edit the same setting. **E-Certificate Settings**
(under Results only: the workspace and step 3 of `/admin/results/new`) is
`results/[id]/CertificateSettingsPanel.tsx`, moved there from `events/` in
`RESULTS_NAV_PLAN.md` Batch 4: the
template upload with a **Template guide** link under it (`/admin/certificate-guide`, new tab), then — once there is a template — the designed layout's controls (content area top/bottom with *With sponsors* / *Clean template* presets,
text color, accent, which fields show, byline position and height) or, for a legacy event, its three sliders and a
*Switch to designed layout* button; beside them the **real PDF** drawn by `buildCertificatePdf` on a sample
runner (with a *Long name* sample), regenerated 500ms after the last change and always a link away for a
phone (§5 `e-certificate.ts`); the edit screen ends with a **read-only
Promotions panel**: what a runner registering for this race can be given, its status and
its conditions, with a link through to the marketing screen. Read-only on
purpose — one screen owns promotions, and a second place to edit them is a
second place for them to drift) · `/admin/events/[id]/registrants` (**an online
order appears only once PayMongo has confirmed it** — an unpaid or expired card /
QRPh / GCash / Maya order is filtered out by `listedRegistrationWhere()` in
`lib/pending-expiry.ts`; bank transfers are always listed. **Two tabs**
(`RegistrantsTabs`, the `.t-tabs` sliding tabs, chosen in the URL as
`?tab=unpaid`, switched with `history.replaceState` and both panels kept
mounted): *Registrants (n)* is everything below, so it counts every listed
row, a CANCELLED or REFUNDED order that kept its runner included, and can
read higher than the overview and the events table (kept by the owner,
2026-10-05) (its Reference cell carries,
under the reference, when the order was placed: `registeredAtLabel`, the
order's `createdAt` in Manila, shared by every runner of a group; the CSV
export carries it as *Registered At*, spelled `2026-10-03 08:46` so Excel
sorts it as a date), and **Unpaid checkouts (n)**
(`UnpaidCheckoutsList`, `UNPAID_ORDERS_PLAN.md` Batch 3) lists the online
orders that list leaves out, from its own query (`unpaidFollowUpWhere`) so they
never reach the registrants count, selection or CSV. Built like the
registrants table (owner, 2026-10-05): search (reference, any runner's name,
email, phone), a Filters chip (Status, Payment), the View chip
(`ColumnsViewMenu`, shared with the registrants toolbar), mark / unmark
checkboxes (`selectionColumn`, shared), a **No.** fixed per order oldest first
(`listNo`), sortable headers, Sort below `lg`, **Export to CSV** (its own file,
`buildUnpaidCheckoutCsv`: one line per order with *Submitted At*, the marked
rows or every filtered row), and `AdminTablePager`, all off one TanStack
table. One row per order:
reference and created time, runners, the first runner's email and phone,
method and amount, and *Awaiting payment · Expires by …* (`expiresBy`, the real
sweep schedule) or *Expired …*. Expired ones stay until race day. n counts
runners still awaiting payment, the same number as "+N unpaid". Nothing on a
row is editable. **Each row has a ⋮ menu** (`UnpaidCheckoutActions`,
`UNPAID_FOLLOWUP_PLAN.md` Batch 1), icon and label on every item, in the order
staff need it: **Check payment** first (`UNPAID_ORDERS_PLAN.md` Batch 4), which
asks PayMongo whether the order was paid before anyone chases the runner — a
QRPh payment can land while its webhook never does. A found payment on a
PENDING order marks it PAID and the page refreshes, moving it to the
Registrants tab; on an EXPIRED order it says *Paid after it expired* and
changes nothing; otherwise *No payment found*. Then **Call**, **Text (SMS)**
and **Email** (`tel:`, `sms:`, `mailto:` with the reference in the subject,
opened in place so a phone hands them to its dialer or apps), **Copy contact**
(name, email, phone, reference; a toast confirms) and **Log follow-up…**
(`FollowUpModal`: one of *Contacted*, *No answer*, *Will pay*, *Not
interested*, *Wrong number*, and an optional note up to 300 characters). The
**Follow-up** column (and a line on the card) shows the latest one — outcome,
who, "2h ago", the note — or *Not contacted yet*, read with
`latestFollowUps` in one query; Filters gains **Follow-up** (Not contacted yet
and each outcome). Every event role sees the tab and may use the contact items
and log a follow-up (`registration:view`); Check payment only
`registration:validate` (OWNER, ADMIN, EVENT_MANAGER, VALIDATOR).
**Cancel order…** (`UNPAID_FOLLOWUP_PLAN.md` Batch 2, danger tone, last in the
menu, `registration:validate`, PENDING rows only) opens `CancelOrderModal`: a
required reason (*Runner declined*, *Duplicate order*, *Test order*, or
*Other* in the staff member's words, up to 200 characters), then the status
route's PENDING → CANCELLED with that `reason` and `expectedStatus: 'PENDING'`,
so the slot and promo go back at once and the trail line says why. A
cancelled order leaves the default view and the count but stays on the tab
until race day under **Filters → Status → Cancelled**, its badge reading who
cancelled it, when and why; its menu keeps only Call, Text, Email and Copy
contact. It never reaches the Registrants tab (`isCancelledCheckout`).
**Copy payment link** (`UNPAID_FOLLOWUP_PLAN.md` Batch 3,
`registration:email`, PENDING rows) asks `payment-link` for a `/pay/[token]`
URL, copies it (or shows it to copy by hand when the browser refuses the
clipboard) and refreshes, since the first link moves the hold and the row's
*Expires by* with it. An EXPIRED row offers **Copy registration link**
instead (the event's `/register`, decision D5).
**Send payment link** and **Send by hand…** (Batch 4, same gate, PENDING
rows) sit under it. The first asks for an `info` confirm naming the quota
(1 of the 100 a day), emails the link through Resend and refreshes; a send
Resend refuses opens Send by hand with the rendered email and Resend's reason.
Send by hand opens `PaymentLinkEmailModal` — the registrants tab's
`ManualEmailModal` panel (preview, *Copy formatted email*, *Open in my
email app*) whose *Mark as sent* logs the follow-up *Link sent*. With rows
marked, the toolbar shows **Send payment link to N** (pending rows only,
behind a confirm naming the N emails and how many marked rows are skipped),
sending one order at a time and naming at the end any that did not go out.
Rows are keyed by order id, so a mark stays on its order when filters change.
**The list is
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
links straight to one order. **Home address** (`RUNNER_ADDRESS_PLAN.md` Batch 3):
each row carries the four `Runner` address parts raw (for the edit modal) and
`homeAddress` joined by `formatRunnerAddress`; a hideable **Province** column
(also on the cards) feeds a *Province* group in the Filters sheet, with "NOT ON
FILE" for rows from before addresses were collected; the detail modal prints the
whole address; the CSV gains *Home Address* and *Province* columns. On a
**`deliverySplit`** order page.tsx groups the runners with `shipmentsFor` (the
rule the checkout charged by), so each row's *Delivery Address* / *Delivery Area*
— on screen and in the CSV — is that runner's own parcel rather than "N/A", and
the detail modal lists every parcel of the order and who is in it
(`DeliveryParcels` in `registrant-display.tsx`, grouped from the rows on screen
so a corrected address regroups at once). The edit modal lives in
`RunnerEditModal.tsx` (split out of the table) with the address in
`RunnerAddressEditor.tsx`: AdminSelects over the PSGC lists, falling back to text
where a list is missing, optional, but all four parts once any is typed. **Minors** (`GUARDIAN_CONSENT_PLAN.md` Batch 4):
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
like a payment somebody forgot to record. It is drawn in `RegistrantStatusBadges`
(`registrant-display.tsx`), so the table cell and the card's badge row carry it alike. The *Filters* sheet
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
and the four write modals. **Split again** for `UNPAID_ORDERS_PLAN.md` Batch 2,
when it had grown back to 1,737 lines, with no change in behaviour: the columns
are `registrant-columns.tsx`, a row's Remarks/Email buttons and menu
`RegistrantRowActions.tsx`, the toolbar and its filters `RegistrantsToolbar.tsx`
(`useRegistrantQueues` holds the four filters that narrow the data rather than
a column), and the remarks, manual-email and delete/bulk-delete modals
`RemarksModal.tsx`, `ManualEmailModal.tsx` and `DeleteRegistrantModals.tsx`,
each with a `use…Modal` hook that owns its state and hands the result back.
`RegistrantsTable.tsx` keeps the runners, the one table instance, the desktop
table, the cards, the bulk bar and the edit modal's state. ·
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
`/admin/results/[id]` (moved from `/admin/events/[id]/results`, which redirects — see the Results menu below; the uploader detects the sheet's real header row —
timing exports open with banner rows — and maps columns by sheet index, not by
label; Chip and Gun Time print to whole seconds like everywhere else —
§5, `race-time.ts`. **Below `lg` the finishers are cards** (Mobile Batch 4):
the name truncating, a Bib chip, then category, gender, both ranks and both
times. **A pacer's row carries a blue *Pacer* badge** (beside the name in the
table, beside the Bib chip on a card), and the same
pacer-free Category and Gender Rank the public pages print (`withPacerRanks`):
a pacer reads "-" and sorts after every ranked finisher, everyone behind them
has moved up. The stored upload is untouched. Every picker in the uploader is `AdminSelect`, one to a row with its
label above it on a phone. The Header Row picker lists each row's first labels
as small print and spells out the chosen row's columns under the field, and
*Process & Upload Results* sits in a footer that stays on screen. **On a results-only event each sheet's Target Category also offers *Create category from sheet name*** (`TargetCategoryPicker`, RESULTS_ONLY_EVENT_PLAN Batch 6), its small print naming the category as it will be stored (uppercase); chosen, a required Distance field opens under it, pre-filled from the sheet name (`guessDistance`: "5K Results" → 5K, "10KM" → 10K) or left blank to type. A blank distance, or a sheet whose name the event already has as a category, is named in the error and marked on that sheet before anything is sent; the success line names the categories created. So a results-only event can be created with no categories at all and get them from the upload) · `/admin/events/[id]/pacers` (**this race's pacers**, `PACER_DISCOUNT_PLAN.md` Batch 1, reached from the events table's row menu as *Pacers*, which also carries the count — "Pacers · 3 not sent" — so a forgotten pacer is visible without opening the screen. `promo:manage`, the same verb its routes ask, and a no-permission reads as "Event not found." exactly as Registrants and Results do. Rows are **grouped by category** in the event's own order, each group naming its distance beside its name, and each row carries the pacer, their bib (or a quiet *Not set*), the code in monospace with a copy button, the state (*Registered* with a link to that order on the registrants list, *Paused*, or *Not yet used*), the amber *Code not sent* chip and the blue *Admin fee waived* chip. The amber reminder line sits above everything as a `role="status"`, so a *Mark as sent* is heard as well as seen; every chip carries an icon as well as a colour, because a colour on its own is not a message. *Add Pacer* opens `.admin-modal-panel` with Category (`AdminSelect`, preselected when the race has one), Pacer name (an **uppercase** sample placeholder, because the name is stored and shown uppercase), an **optional Bib number** (it is what keeps the pacer off the Race Winners podium, and bibs often come later), an optional **Pace group** ("SUB1", "1:00" — printed on the pacer's e-certificate; also on *Edit*, and a *Pace group* column beside *Bib*) and the *Include admin fee in discount* switch — the new shared `.admin-switch-row` (`role="switch"`, the whole row is the target, `.t-toggle`'s motion), **disabled with its reason in the hint** for anyone but the Super Admin, since the person who may not use a control is exactly the person who needs to be told why. The row menu says what each item does with an icon and a label — Copy code, Mark as sent, *Edit details* (`EditPacerModal.tsx`: name, bib and pace group; it replaced Rename when the bib arrived — a late or swapped bib and a mistyped name are the same kind of correction), Pause, *Waive / Charge admin fee* (Super Admin only, withheld by not passing its handler) and Delete — and the Actions cells sit under their column header. **Copying is not sending**: the copy button never marks a code as sent, or the reminder would hide the one pacer it exists for. Delete is offered only while the code is unclaimed; once a pacer has registered, Pause is the answer and the route refuses the other. Under the intro sits **"N of M pacers registered"** (Batch 3), counted in the client from the rows on screen with the same `isPacerRegistered` each row's chip reads, so adding or deleting a pacer moves it at once and the line can never disagree with the list; the amber reminder above says what is still owed to the pacers, this says what they have done with it. Cards below `lg`, and the route fallback draws this shape) · `/admin/marketing` (promotions: the kind, the event it is scoped to, what it
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
`/admin/settings` (**grouped into four pages, reached from the account menu** — the owner's call, 2026-09-18, after the single page grew too long; there is **no section tab strip on the pages themselves**, the menu is the navigation. The groups live in `settings/sections.ts`; `settings/account.ts` `loadOwnAccount(actor)` is the one read of the person's own row, redirecting to sign-in when it is gone. **`/admin/settings` = Profile** — an optional **profile photo** (picked, centre-cropped and shrunk to a 256px JPEG in the browser, saved at once through `admin/profile/avatar`, shown in the account menu in place of the initial), then name, sign-in email and, for a StaffAccount only, an optional mobile number (`PhoneField`; the Organizer row has no phone column). **Changing the email opens a Current Password box** and the route requires it. **A client viewer's email is read-only** and names the admin email to write to — only Run As One's staff change it. **`/admin/settings/security`**: **Password** (a change signs out every other device, owner and staff alike); **Two-step Sign-in** for everyone (`settings/TwoFactorPanel.tsx`, `TWO_FACTOR_PLAN.md` Batch 2; left out while `TOTP_ENCRYPTION_KEY` is unset unless it is already on): *Off* with **Turn On Two-Step Sign-in** → step 1 a server-drawn QR plus the key in fours, step 2 the first 6-digit code (`one-time-code`, numeric) → the ten recovery codes, shown once, with Copy, Download .txt and an **I saved these codes** tick that unlocks Done; *On* says since when and how many recovery codes are left (a warning at 3 or fewer), with **New Recovery Codes** (asks a code) and **Turn Off** (asks the password and a code). Sign-in does not ask for the code until Batch 3; **Google Sign-in** for staff and client viewers, never the owner (`settings/GooglePanel.tsx`; shown once Google sign-in is set up, or while a link remains): *Linked* with a Current Password box and **Unlink Google** (`admin/profile/google`), or *Not linked* with how a link is made; **Sign-in Activity** for everyone — the last sign-in (`lastLoginAt`, recorded on both account tables) and **Sign out other devices**, which asks first, posts to `admin/profile/sessions` and keeps this browser signed in. **`/admin/settings/site`** (Site Settings; `forbidden()` for anyone holding neither `platform:manage` nor `org:settings`, and hidden from their menu): for `platform:manage` (Super Admin *and* Admin, by the owner's call) the **Admin Email** panel — the one address the footer, the 404, feedback, coming-soon, Terms, Privacy and organizer sign-up pages and every email use; its hint warns when the address is off the Resend-verified domain, so mail keeps its default sender — and beside it the **Social Links** panel, one box per channel (brand glyph on the label, sample address as placeholder), each checked on blur and on Save with `socialLinkError`; an empty box hides that icon in the footer. The two save separately. Then, for `org:settings` only (the **Super Admin** — an Admin does not see it), the **Default Platform Fee** panel: one peso box (`readPlatformFee`), saving through `admin/platform-fee`, whose hint says plainly it **only affects new events** — existing events keep their own fee. **Both forms end with a "Publishing & Sign-ups" panel** (`PublishingPanel`, 2026-10-17, the owner's call after staff read the publish and registration-opening controls as duplicates): two numbered questions, **1. When can runners see this event?** (`PublishPicker`: *Save As Draft* — the default — *Publish Now*, *Schedule Publishing* with a Manila date and time; on the edit form a read-only sentence pointing to the events list's Publish item instead) and **2. When can runners register?** (`RegistrationOpeningPicker`, its cards now *When It Goes Public* / *On A Later Date*; it left *Registration & Fees*), then the edit form's Pause Registration (an `AdminSwitch`, like Logistics' delivery toggle, not a browser checkbox), then a live blue sentence (`describeTimeline` in `publish-draft.ts`) saying what runners will experience — while paused on a live event it says only that sign-ups are paused, since a hold outranks the schedule. An opening set before a scheduled publish time is refused under the opening field (`openingBeforePublish`, D8). The create form's submit button says which publish answer it carries (*Save As Draft* / *Publish Event* / *Schedule Event*). **`/admin/events/new` is a server shell** (`page.tsx`, `requireTeamActor`) that reads `Organizer.adminFee` and hands the client form (`NewEventForm.tsx`) its starting Admin Fee, so there is no flash of a hardcoded ₱60. **Both forms open with an Event Format panel** (`EventFormatPanel`, `VIRTUAL_RUN_PLAN.md` D3): two cards, *On-site Race* / *Virtual Run*, drawn like the distances-or-packages cards; locked with its reason once the event has a registration, and absent on a results-only race. Choosing *Virtual Run* swaps Basic Information's Date and Location for **Run Window Starts / Run Window Ends** and hides Start / End Time (the hidden values stay in the draft); `basicInfoProblem` in `event-form-draft.ts` names a missing or backwards window under its field. One Create Event button either way. On the events table a virtual run carries a blue **Virtual** badge beside its title, its Date reads as the range, and its row menu has no *Pacers* item; `/admin/events/[id]/pacers` on a virtual run says *Virtual runs have no pacers.* **The create and edit forms share their panels** (`admin/events/`: `BasicInfoPanel`, `EventOptionsPanel`, `BankAccountsPanel`, `LogisticsPanel`, `RegistrationFeesPanel`, `PublishingPanel` — whose `children` slot holds the edit form's registration hold — and `EventFormResultModals`), so a change to a section is made once; each form file keeps only its draft, validation and save. **Neither form moves a race between Events and Results** (the Move to Results switch was removed 2026-10-15, the owner's call): the create form makes races that take sign-ups, a results-only race is made from `/admin/results/new`, and the event PUT ignores `resultsOnly` and keeps the stored value; a race made in the wrong place is recreated. A save lands where the race lives (`/admin/results/[id]` or `/admin/events`), and a results-only race's edit form reads **Results › {title}** / *Edit Details* with Cancel back to its workspace. For a results-only race the form shows only client, title, date, location, province (`EventProvinceField`, moved up from Logistics), an optional cover and each category's name and distance — the type picker, prices, slot limits, inclusions, posters, description, times, highlights, size chart and the Bank Accounts, Logistics, Registration & Fees and (on edit) Promotions panels are hidden, the opening and delivery checks are skipped. The edit form's E-Certificate is only the line linking to the results workspace (see the edit screen above). **`/admin/settings/access`** (Your Access), read-only (`settings/AccessPanels.tsx`): **Your Role** with its `ROLE_HINTS` sentence, for Super Admin / Admin the matrix's list of what the role may do, for Staff each assigned race with its event role and a link to its registrants, for a client viewer its organization) · `/admin/team` (**who can sign in to
this organizer, and to what** — `team:manage` only, anyone else gets the
admin's 404. Three metric cards (Active Members, Invitations Waiting — expired
ones included, since each needs a resend — and Suspended) over the admin's one
table: the **owner is always the first row and has no menu**, because the
owner is the Organizer row and not a membership, then everyone else in
invitation order, which never changes under an action. Columns: Member (with a
*You* chip, and a *Two-step on* chip — `admin/TwoStepChip` — for anyone with
two-step sign-in on, the owner included), Role, Events (a STAFF member's races with their role on each),
Status (with *Link expires Sep 20* under a waiting invitation), Last Sign-In.
The row menu (`TeamActionsMenu`) offers Edit Access, then **Resend
Invitation** for someone who has not accepted or **Suspend / Reinstate** for
someone who has, then **Reset Two-Step Sign-in** for a member who has it on
(`TWO_FACTOR_PLAN.md` D4: a `confirm` saying they are signed out and
emailed), then Remove from Team / Revoke Invitation. A row the viewer
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

**`/admin/results` is the Results menu** (`RESULTS_NAV_PLAN.md` Batch 1),
under Races after Events, with the `Trophy` icon and the same `nav.events`
check. It lists every race whose results live here: `reachableEvents(actor)`
AND (`resultsOnly` OR at least one `RaceResult`), the most recent race first.
Nothing is stored to mark a race as listed — a results-only event is on it
from creation, a normal one from its first result, and a normal event without
results is not. Columns: No., Event Name, Date, **Type** (*Registered here*,
`info`, or *Results only*, `neutral` — `results/result-row.ts`), **Finishers**
(`_count.raceResults`; *No results yet* instead of 0), **Certificate**
(*Custom* when `certificateTemplate` is set, else *Default* — Run As One's own
is always there) and **Client**; search also reads the hidden location. One
*Filters* chip holds **Type** and, for `platform:manage`, **Client**. Below
`lg` the rows are `AdminCardList` cards. The row menu is `RowActionsMenu`,
icon and label on every item: **Open Results**
(`/admin/results/[id]`), **View Public
Page** (`/results/[slug]`, new tab, only with results), **Edit Details**
(`/admin/events/[id]/edit`, `event:edit`) and **Delete** (results-only rows
only, `event:delete`, through the Events table's `DeleteEventModal` and
`useEventRowActions`; the modal names the uploaded results that go with it).
**Add Results** (`event:create` only) opens `/admin/results/new`.
`RowActionsMenu` items take **`to`** for an in-app page (a `next/link` that
keeps the menu open on `LinkPending`, as `EventActionsMenu` does), beside
`href` for a new tab. Files: `results/page.tsx`, `ResultsListClient.tsx`,
`result-columns.tsx`, `result-row.ts`.

**`/admin/results/new` starts a race's results, the whole job on one page**
(`RESULTS_NAV_PLAN.md` Batch 3, R2). `event:create`, the verb its POST asks;
without it the page is `AdminNotFound` with the way back to Results.
Breadcrumb **Results › Add Results**. It first asks with two large radio cards,
built like the create form's event type (`EventOptionsPanel`), then shows that
choice's three numbered steps — **1** the race, **2. Upload results** and
**3. E-Certificate**, both marked *- optional* — and **one Save at the foot**
whose label names what it will save (*Save Race*, *Save Race and Results*,
*Save Race, Results and Certificate*, *Save Results*…). The owner chose this
over details-then-*Save and Continue*, which confused staff. Steps 2 and 3 only
gather: the uploader runs in its **prepare mode** (`ResultsUploaderClient`
`onPrepared`; its modal's button reads *Use These Results*), and the step holds
a summary — finishers, sheets, the categories it will create, skipped sheets —
with *Change file* (the modal reopens with its mapping) and *Remove*; the
certificate step is the shared `CertificateSettingsPanel` on the page's draft
(its template image uploads when picked, as everywhere; the setting waits).
**Event is already in the system**: step 1 is a searchable picker (`EventPicker`)
— loaded on the server as `reachableEvents(actor)` AND `resultsOnly: false` AND
no `RaceResult` AND `date <= today()` (R6), most recent first, with each race's
categories and current certificate, searched on the page by title or client;
choosing one folds the list into the race with *Change race*, and steps 2 and 3
show locked ("Choose the race first.") until then. With nothing to save, Save
is disabled and the line above it says why. **Results only, registration was
elsewhere**: step 1 is `BasicInfoPanel` with `resultsOnly` and the title
*1. Details*; a missing title, date or location is named in the error.
**Save** (`save-new-results.ts`) is up to three requests to existing routes in
order — `POST /api/admin/events` (`resultsOnly: true`, `eventType` RACE,
`categories: []`; results-only only), the upload route, the certificate PUT —
then opens `/admin/results/[id]`. A failure before anything is stored keeps the
page as it was and says why; one after opens the race's workspace anyway and
names the part that did not save and where to redo it, so a second Save can
never make a second race. The upload and certificate requests are
`results-upload.ts` `postResults` and `certificate-draft.ts` `saveCertificate`,
which the workspace uses too. **`?client=<id>`** is *Add Results* on a
client's application (`SERVICE_INQUIRY_PLAN.md` Batch 4): the page reads the
client on the server and opens with **Results only** already chosen (the
question stays, so staff can switch), the client linked and its first event's
name, date and location filled in, all editable. The date is kept only when it
is today or past (R6); a future one is left blank. The parameter is honoured
only for `platform:manage` and a client that is not archived; anyone else, or
an unknown id, gets the page as if it had none, and the form still sends
`clientId` only once its picker says the actor may link one. Files: `results/new/page.tsx`,
`NewResultsClient.tsx`, `EventPicker.tsx`, `ExistingRaceFlow.tsx`,
`ResultsOnlyFlow.tsx`, `ResultsSteps.tsx`, `save-new-results.ts`.

**`/admin/results/[id]` is one race's results workspace** (`RESULTS_NAV_PLAN.md`
Batch 2). It moved from `/admin/events/[id]/results` with its uploader pieces
(`git mv`); the old address is a **308 in `next.config.ts`**, so bookmarks and
old links land on the same race. The upload API did not move
(`/api/admin/events/[id]/results/upload`). Breadcrumb **Results › {title}**;
scope and gate are the old page's — `organizerId: actor.orgId` and
`event:view`, a miss is `AdminNotFound`. **Two shapes, decided by the rows**:
with **no `RaceResult`** it is the create layout, three numbered panels —
**1. Details**, **2. Upload results** (the existing `ResultsUploaderClient`
button and modal; on a results-only event it says a sheet can make its own
category) and **3. E-Certificate**; **with results** it is Details, the
results table with its re-upload, and the E-Certificate. **Details is
read-only** (`EventDetailsPanel.tsx`, R4): event, date, location, client,
categories and the *Registered here* / *Results only* badge, with **Edit
Event** (registered here) or **Edit details** (results only) to
`/admin/events/[id]/edit`, shown only with `event:edit`. **E-Certificate**
(`CertificateWorkspacePanel.tsx`) mounts the shared `CertificateSettingsPanel`
on `useEventImageUpload` and saves with **Save Certificate** through `PUT
/api/admin/events/[id]/certificate`, enabled only once something changed;
without `event:edit` the panel is shown disabled with a line saying why and
no Save. Its starting state is `certificate-draft.ts` (moved from the edit
form's draft, rules unchanged). **Manage Results** in the Events row menu
links here, which covers R3: the table when there are results, the create
layout when there are none. **The results table has a row menu**
(`RESULTS_ROW_ACTIONS_PLAN.md` Batches 2–3, `use-runner-actions.tsx`), shown
with `results:manage` on every race. **Every row has Edit details** first
(`ResultFormModal.tsx`, Batch 3): name (uppercased as typed), bib, gender
(`AdminSelect`, Male / Female, or the sheet's own word kept), category and
status (`AdminSelect`), chip and gun time; one column on a phone, two from
`sm`, Cancel and Save in the footer; a refusal lands under the field it names.
**Changing the bib warns** that the runner's page moves to
`/results/[slug]/{new bib}` and a shared link to the old one stops working. A
hand-edited row wears a quiet **Edited** badge, and a row not FINISHED its
status (**DQ**); its ranks read "-". The re-upload modal names the count of
edited rows above *Process & Upload Results* ("3 results were corrected by
hand. Uploading this file replaces them."). **Add runner** sits beside
*Upload results* (`AddRunnerButton.tsx`, Batch 4, `results:manage` only): the
same form with nothing filled (a race of one category has it chosen) and a
bib required, for a finisher the sheet left out. It shows above the table, and
in the create layout's Upload step once the race has a category (a race with
none makes its categories from the sheet). A runner added here wears **Added**
(its `editedAt` equals its `createdAt`; `handMade` in `runner-row.ts`) until
it is edited, when it reads *Edited*; both are counted in the re-upload
warning, which names each kind ("1 result was added and 2 were corrected by
hand."), since a new sheet replaces them. **Every row ends with Delete result**
(red, Batch 5), and the table's checkboxes delete in bulk: **Delete Selected
(N)**, a red chip in the toolbar from `lg` up, and below it the bulk bar
(`.bulk-bar.is-no-export`: the count and Clear, Delete beneath on a phone);
the cards have select-all for the page. Both ask first (`AlertProvider`
`confirm`, naming the runner or the count, saying a re-upload brings back
whoever is still in the sheet), and the selection is keyed by result id. On a
results-only race, a runner's row also has **Mark as pacer** (`PacerTagModal.tsx`,
`.admin-modal-panel`: names the runner, bib and category, says what a pacer's
ranks do, and takes an optional pace group); a pacer tagged here reads
**Pacer** and has **Edit pace group** and **Remove pacer tag** (asks first,
saying the runners behind move back down); a pacer from a code reads **Pacer
· from Events** and has no item, since it is changed on the Events Pacers
screen. A normal race has no pacer items, unless a tag was left on it, which
can still be removed. Each change refreshes
the page, so badges and ranks move at once; cards below `lg` carry the same
badge and the menu in their footer, and a card with nothing to offer has no
footer.

**The sidebar and the events table follow the permission matrix.** Marketing
Tools shows only with `promo:view` somewhere, **Clients, Communities and
Feedback only with `platform:manage`** (between Marketing Tools and Team),
Team only with `team:manage`, Activity only with `activity:view`, and
the account menu's role line reads **Super Admin** (the OWNER role's label), or `Admin · ORGANIZER` /
`Staff · ORGANIZER`. There is no organizer switcher: it was removed with
`api/auth/switch-organizer` in `ADMIN_MERGE_PLAN.md` Batch 2, because Run As
One is the one tenant and nobody has a second organizer to move to. On `/admin/events`, Create Event needs `event:create`, and each
row's Edit Event, Schedule / Pause / Close Sign-Ups and Delete Event follow
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
labels from `organizer-vocabulary.ts`, a blank answer reading *Not given*, a
pre-form row saying so in one sentence — whose *The decision* section is gone
and whose **Sign-ins** section (shown once anybody was invited) lists each
viewer with the team screen's own state badge (Active / Invited / Invite
Expired / Suspended, `memberState`), a *Two-step on* chip for a viewer who has
it on, and beside that viewer a labelled **Reset Two-Step Sign-in** button (a
`confirm`, D4). **The services read in their groups** (`servicesByGroup`,
§5): an *Online* line and a *Race day* line of chips, Not Sure Yet on its own,
so a registration client, a race-day job or both shows at a glance
(`SERVICE_INQUIRY_PLAN.md` Batch 4). The panel is split along its seams:
`application-rows.ts` (the row types and date / phone / website formatting,
which the list shares), `useApplicationDialog.ts` (open, close, focus, Escape,
Tab), `SignInsSection.tsx`, `ApplicationAnswers.tsx` and `ApplicationSection.tsx`
(`Section`, `Detail`); the moves, the status badge and the invite dialog's
opening values left `ClientsClient.tsx` for `client-actions.tsx`, which the
menu, the card and the footer share. The row's ⋮ menu offers **Read
Application** and the moves; the panel's footer spells the moves out as
labelled chips, and adds two things only it carries: **Add Results** (an
application that chose Results and E-Certificates, not archived) linking to
`/admin/results/new?client=<id>`, and **No sign-in needed** beside Send invite
when the application did not choose Online Registration (`signInComing`, the
rule its thank-you panel used; a pre-form row gets no note). Send invite still
works either way. The moves come from `canMoveClient`, the
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
four tiles — *Collected (Paid Orders)*, *Run As One's Share* (platform fees
only; the transaction fee is PayMongo's), *Balance Due to
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
(`.settlement-lines`: collected, less platform fees (Run As One) and payment
processing fees (PayMongo), owed — with list-price
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
| `auth/login`, `auth/logout`, `auth/register` | POST | Sets / clears `admin_token`. **The account email is lowercased at the door** on both `login` and `register` (`normalizeAccountEmail`, §5) — and on `admin/profile` PATCH, which is the third place one can be written. Postgres compares text exactly, so until this landed a single capital from a browser autofill found no row and the login answered "Invalid credentials" for a password that was perfectly correct; `register` had the matching gap, where two accounts could exist for one address differing only in case and the unique index would not have stopped them. All three normalise through one helper, because this is precisely a rule two screens must never disagree about. **`login` checks the password and hands the rest to `checkSignIn` and `finishSignIn`** (`lib/sign-in.ts`, §5), which Google sign-in shares. **An account with two-step sign-in on gets no session here** (`TWO_FACTOR_PLAN.md` Batch 3): the answer is `{ twoFactor: true }` and the `two_factor_pending` cookie (`lib/two-factor-pending.ts`), carrying `keep` and the body's `next` (through `safeNextPath`), and the page goes to `/admin/two-factor`. An optional `keep: true` in the body (the page's "Keep me signed in" box, `LOGIN_UX_PLAN.md` Batch 4) makes the session 30 days instead of one (`SESSION_SECONDS`, `lib/jwt.ts`). **It looks the address up in both account tables** through `findAccountByEmail` (§5): **only Run As One's Organizer row signs in as the owner** (`organizerOwnerCanSignIn`, §5) — any other Organizer row is answered *Invalid credentials* before its password is checked and is not logged, exactly like an address with no account, and Run As One's row in any status but `APPROVED` is refused as `NOT_APPROVED` — a `StaffAccount` signs in to its earliest-accepted membership of an active organizer (an invitation not yet accepted has no password and is answered like a wrong one). Every sign-in and every failed or refused one is written to the audit trail, except an address that matches no account; `register` and `admin/profile` refuse an address either table already holds. **`register` is the organizer application, and since `ADMIN_MERGE_PLAN.md` Batch 3 it writes a `Client` (`NEW`) and nothing else** — no Organizer row, no password, no session, no email: the gate is staff pressing Send invite on `/admin/clients`. It validates the whole body through `readOrganizerApplication` (§5) — the same module the form runs, so a tab left open cannot post past a rule the form enforces — and writes the fifteen application columns, empty strings stored as null so a screen reading them back has one absent value to test for. It refuses, under `errors.email`, an address either account table holds and an address a client submission already holds (the unique index backs that for two presses at once); the latter's text is `ALREADY_APPLIED_MESSAGE` (§5), which the form matches to show the contact links. A refusal carries `errors` keyed by field beside the catch-all `error` string. **Throttled** (`SERVICE_INQUIRY_PLAN.md` Batch 3): `APPLICATION_RULE` in `lib/rate-limit.ts`, 5 posts every 10 minutes per address, checked before the body is read and answered `429 { error }`, which the form shows in its banner |
| `admin/events/[id]/registrants/export` | POST | **The audit entry for a CSV export**, which is built in the browser from rows already on screen. The registrants table calls it fire-and-forget (with `keepalive`) before building the file, so a failed log never costs the organizer their download. Records the row count and whether it was a selection — never who was in it. The Unpaid checkouts tab's export calls it too with `list: 'unpaid'`, recorded as its own action, `unpaid_checkouts.exported` (*Exported unpaid checkouts*), so the trail never counts those orders as registrants. A client viewer's runner list (`your-events/[id]/RunnerList.tsx`) calls it with `list: 'client'`: accepted under `event:view-runners` with the race's `clientId` beside staff's `registration:view`, recorded as `registrants.exported` worded *from <race>'s client runner list*. Answers 204 |
| `checkout` | POST | PayMongo checkout session. **A results-only event is refused with 400** (`RESULTS_ONLY_MESSAGE`) the moment the event loads, before anything is priced — `checkout/manual` does the same, before any proof is uploaded. **Throttled** first (`CHECKOUT_RULE`, 10 a minute per address, one window shared with `checkout/manual`; 429 with a plain `error` the wizard alerts), because every order placed here holds slots and promo uses until paid or swept. **At most 20 runners an order** (`participantCountError`, `MAX_RUNNERS_PER_ORDER` in `lib/order-size.ts`): a longer `participants` list is refused with a 400 and a plain `error` the wizard alerts, since each runner reserves a slot — the wizard stops adding runners at the same number. Re-derives every amount from the database. The **admin fee is checked after the promo code is resolved**, not before, because a pacer code can waive it (`platformFeeAfterDiscount`) — a client posting a waiver it had not earned would be handing itself Run As One's commission. When the recomputed chargeable total is **0** the order takes the free path (`lib/free-checkout.ts`): the transaction fee must be 0 too, `FREE_ORDER_COLUMNS` writes it `PAID`/`COMPLIMENTARY` at ₱0, the confirmation email goes out instead of the acknowledgement, and the route **returns the success URL without ever calling PayMongo**, which rejects a zero-amount charge. The PayMongo key check moved down to cover only orders that will actually be charged — still before the write, so a misconfigured key cannot leave an unpayable registration behind, but no longer in the way of an order PayMongo will never see. **Online orders (not bank transfer, not free) are sent no email here** — the PayMongo webhook sends the one receipt once paid — **and are discarded if PayMongo rejects the request or anything throws** before a checkout URL is returned (`discardFailedCheckout` in a `finally`), so a failed attempt leaves no registrant, no email and no held slot or promo. GCash and Maya (`MAYA` or legacy `PAYMAYA`) use a Payment Intent; card and QRPh a Checkout Session. The transaction fee is priced from the **stored** (uppercased) method, and a chargeable order whose method is neither a currently offered PayMongo one (`isPayMongoMethod`, which reads `OFFERED_PAYMONGO_METHODS` — QR Ph only for now) nor a bank transfer is refused with a 400 — otherwise `"gcash"` or an unknown method would reach PayMongo carrying no fee. |
| `checkout/manual` | POST | Bank transfer: multipart, proof file → private blob. Throttled by the same `CHECKOUT_RULE` window as `checkout`, before the form or the upload is read (429). The same 20-runner cap as `checkout` (400, `participantCountError`). The file is validated by `uploadPrivateProof` under the `proof` kind — JPG, PNG, WEBP, GIF or PDF, 4 MB — which is the same list the wizard's picker offers. The same free path as `checkout`, and the **proof is required a little later than it used to be**: an order that costs nothing has no deposit slip to show, and whether it costs nothing is only knowable once the event and the promo code have been read. A free order stores no proof and no reference number — there is nothing either could be evidence of — and a file attached to one is ignored rather than kept. **The payment method is always `BANK_TRANSFER`** (a free order is rewritten `COMPLIMENTARY`), whatever the form posts: a posted `GCASH` would write an order the registrants list hides and the 24h sweep expires despite its slip. The order itself is swept after `BANK_TRANSFER_EXPIRY_DAYS` (7) if nobody validates it. **A slip whose order then fails to save is deleted** (`discardUnclaimedProof`, Strix vuln-0001 of run fca9) — on a Vercel deployment only; locally it is kept and logged, because the private store is production's |
| `pay/[token]` | POST | **Public**, Pay now on `/pay/[token]`; throttled (`PAY_LINK_RULE`, 429). Trusts only the signed token (`resume-payment.ts`, 404 when invalid) and bills only the stored order (`paymongoOrderFromRegistration`). Refuses an order that is not payable with `{ state }` (409). Then, in order: asks PayMongo whether the stored page was paid and, if so, settles it through `settleOnlinePayment` and answers `{ state: 'paid' }`; **closes the stored page** (`retirePaymongoPage`, 409 if it will not close — a payment may be in flight); opens a new one; and **claims it** with a conditional update on the old `checkoutSessionId`, closing its own page again if another press won (409). Answers `{ checkout_url }`. Success returns to the wizard's own `?success=true&orderRef=` screen; cancel returns to the link |
| `webhooks/paymongo` | POST | HMAC-verified, failing closed: with `PAYMONGO_WEBHOOK_SECRET` unset it logs an error and answers 500 without reading the event (PayMongo retries, so nothing is lost once it is set); an unsigned or malformed header is refused 401, the signature is read from the slot the event's own `data.attributes.livemode` names (`li=` for live, `te=` for test — never whichever is filled; a missing slot is 401, a body without a boolean `livemode` is 400) and compared with `crypto.timingSafeEqual`, a mismatch also 401. **A genuine event is then refused (400) when its signed `t=` is more than 3 hours old or more than 5 minutes ahead** (`MAX_EVENT_AGE_SECONDS`, `MAX_CLOCK_SKEW_SECONDS`), so a captured delivery cannot be replayed later (Strix vuln-0001). Three hours because PayMongo does not document whether a retry gets a fresh `t=`, and its 12 automatic retries span about 136.5 minutes: a tighter window could refuse real retries, and three events that fail every retry disable the webhook. A real payment refused for its age (a dashboard *Resend* of an old event) is settled with "Check payment" instead. Reads the event name from `data.attributes.type` (`data.type` is always `"event"`). `checkout_session.payment.paid` matches the stored `cs_` id or `reference_number`→`orderRef` (card, QRPh); `payment.paid` matches `attributes.payment_intent_id` against the stored `pi_` (GCash, Maya). Marks the registration `PAID` and sends the receipt once — a retried delivery for an already-PAID row is acknowledged and skipped. The flip and the receipt are `settleOnlinePayment` (`lib/online-payment.ts`), shared with the admin's payment check so the two cannot disagree. **Only a `PENDING` row is flipped**, with a conditional update so racing deliveries cannot both send a receipt: a payment that lands on an `EXPIRED` (slot and promo already released), `CANCELLED` or `REFUNDED` order is acknowledged with 200, left as it is, and logged as needing a manual reinstate or refund. Test and live mode each need their own PayMongo webhook with its own `whsk_` secret: Preview → `run-as-one.vercel.app` (dev), Production → the production domain |
| `upload` | POST | Organizer-only image upload (public store). `folder: clients` (a client site's logo or hero, `CLIENT_SUBDOMAIN_PLAN.md`) also asks for `platform:manage` and lands under `clients/`; anything else lands under `events/` |
| `admin/events/[id]/publish` | PUT | **When the public first sees the event** (`EVENT_PUBLISH_PLAN.md`): `{ publishAt: 'now' | <ISO> | null }` — publish, schedule, or back to draft. Its own route so nothing that saves the rest of the event can publish or hide it. `event:edit`, 404 otherwise. **409 when it would hide an event that has any registration** (D5); 400 for an unreadable time or one after a still-future `registrationOpensAt` (`publishConflict`). The registration recount for the 409 is repeated under a `FOR UPDATE` lock inside the write. Records `event.published`, `event.publish.scheduled` or `event.unpublished` with the before/after instants. Answers `{ id, publishAt, publishState }` |
| `admin/events`, `admin/events/[id]` | POST / GET, PUT, PATCH, DELETE | Event CRUD including categories and bank accounts. **POST and PUT take `format` and `virtualEndDate`** (`lib/event-format.ts` `readFormatFields`): a virtual run's venue and times are ignored and stored as *Virtual* / none, a missing or backwards window end is refused under `errors.virtualEndDate`, and **PUT refuses a format change once the event has a registration** (`errors.format`, D7). The `[id]` handlers are split: `route.ts` keeps GET and DELETE, PUT is `update-event.ts`, PATCH is `registration-controls.ts`. **POST takes `publishAt`** (`'now'`, an ISO instant, or null for a draft — the create form's **Publishing** panel; a results-only race is published on creation regardless) and refuses one after the registration opening; PUT never touches it. **A PUT without `certificateTemplate` / `certificateCoordinates` keeps what is stored** (`RESULTS_NAV_PLAN.md` Batch 2): the edit form no longer sends them, since the certificate is saved from the results workspace. **`resultsOnly`** on POST only (a strict `true` counts); **PUT ignores it and keeps the event's value**, since a race never moves between Events and Results (the switch was removed 2026-10-15). When on, every category saves at price 0 with no slot limit, and the poster stays optional as it always was. **`clientId`** (Batch 3) goes through `readClientLink` (§5) on POST and PUT: only `platform:manage` may set it, anyone else's is ignored, and a refusal answers 400 under `errors.clientId`, which the form puts under its Client picker; PUT records it in `event.updated`'s changes like any column. Categories keep the position they were created in across every `PUT` — see `category-order.ts`. `PATCH` is **when sign-ups are open, on its own** — `{ registrationPaused }` from the menu's pause item, `{ registrationOpensAt }` from its scheduling modal, `{ registrationClosed }` from its close / reopen item (a boolean on the wire; the server stamps `registrationClosedAt`, keeps the first instant on a repeat close, and records `event.registration.closed` / `.reopened`), so the events table changes one thing without re-posting a form it never rendered; a body carrying none is refused rather than treated as a no-op. An opening sent on its own also clears `registrationPaused`, or the date would arrive to a paused event. Scoped to the signed-in organizer's own events. **`DELETE` answers 409 for a race with any remittance** (voided ones too), naming how many, before it removes anything. `GET` also carries `promotions` — what `eventPromotions` says is running on this race — for the read-only panel at the foot of the edit screen |
| `admin/events/[id]/certificate` | PUT | The race's e-certificate on its own (`RESULTS_NAV_PLAN.md` Batch 2), for the results workspace: **only `certificateTemplate` and `certificateCoordinates`**, never the rest of the event. `event:edit`, scoped to the actor's organizer; a miss is a 404. The template must be an `https://` URL (the upload's) or empty for Run As One's own — anything else is a 400, since runners' browsers fetch it; the layout is required and is stored through `parseCertificateSettings` → `serializeCertificateSettings`, so the column only holds a shape the drawer reads. A change is on the trail as `event.updated` naming the fields |
| `admin/events/[id]/results/upload` | POST | CSV/XLSX results import; dedupes by bib, computes seconds and the three ranks. **`newCategories`** (`[{ name, distance }]`, RESULTS_ONLY_EVENT_PLAN Batch 6) founds categories from sheet names, and a row joins one with `newCategory: name` instead of a `categoryId`: they are created **in the same transaction as the results** (name uppercased, price 0, no cap, at the end of the event's order), only if some row survives the bib dedupe, and the audit summary names them. **Refused with 400 on an event that is not `resultsOnly`**, for a blank name or distance, and for a name the event already has. **Every row must point at a category of this event** (by id, or a declared new one), or the whole upload is a 400 — before, a row could carry another race's category id |
| `admin/events/[id]/results` | POST | *Add runner* (`RESULTS_ROW_ACTIONS_PLAN.md` Batch 4, any race under Results): `{ name, bibNumber, gender, categoryId, status, chipTime, gunTime }`, one finisher the sheet left out. Same verb, scope and checks as *Edit details* below (`results/result-fields.ts`, shared by both routes), except the **bib is always required** (a runner's page is found by it) and the gender must be Male or Female. **One transaction:** the row, **stamped `editedAt` equal to its `createdAt`** (one clock reading, so it reads *Added*; the re-upload warning counts it), every result of the race re-ranked (`rerankRace`), and `results.added` on the trail naming the runner, the category and how many results moved. A pacer tag already on the bib applies at once. 201 `{ result: { id } }` |
| `admin/events/[id]/results` | DELETE | *Delete result* and *Delete Selected* (`RESULTS_ROW_ACTIONS_PLAN.md` Batch 5, any race under Results): `{ resultIds }`, one or many. Same verb and scope as *Add runner*. 400 for none; **409 and nothing deleted** when any id is not a result of this race (a stale table reloads rather than deleting part of it). **One transaction:** the rows, a `ResultPacer` on any of their bibs (with no row it could never be seen or removed), the race re-ranked (`rerankRace`), and `results.deleted` naming up to 20 runners ("and N more"), the tags removed and the results moved; `changes.results` is the count before and after. A re-upload brings back whoever is still in the sheet. `{ deleted }` |
| `admin/events/[id]/results/[resultId]` | PATCH | *Edit details* on one runner (`RESULTS_ROW_ACTIONS_PLAN.md` Batch 3, any race under Results): `{ name, bibNumber, gender, categoryId, status, chipTime, gunTime }`. **`results:manage`**, scoped like the pacer routes (`resultPacerEvent`), a miss is 404. Checked as the upload reads a sheet, each refusal `{ field, error }`: name required and stored `upperCaseForStorage`; bib trimmed, required unless the row had none, **409 naming whose** when another result of the race holds it (case-blind); gender Male / Female, or unchanged when it reads as the same division; the category one of this race's; status one of `RESULT_STATUSES`; a chip time `isRaceTime` reads, required for a FINISHED row; a gun time blank or readable. An unchanged save writes nothing. **One transaction:** the row with `editedAt`, a `ResultPacer` on the old bib moved to the new one (a stale tag already on the new bib is dropped), **every result of the race re-ranked** with `rankResults` (the changed ranks written in one `UPDATE … FROM unnest`), and `results.edited` on the trail with the old and new value of each changed field (category by name) |
| `admin/events/[id]/result-pacers` | POST | *Mark as pacer* on a results-only race (`RESULTS_ROW_ACTIONS_PLAN.md` Batch 2): `{ bibNumber, paceGroup? }` writes a `ResultPacer`. **`results:manage`** (the upload's verb), scoped by `organizerId` like the upload, a miss reads "Event not found". Refused **400** on a race that is not `resultsOnly` (its pacers are its codes, under Events), **400 naming the bib** when no result of this race has it, **409** when the finisher is already a pacer — by a tag here, or by a pacer code under Events (by bib or by name in its category, the results' own match), saying which. The pace group goes through `paceGroupFromInput`. Audited `result_pacer.added`, naming the runner and the race; a race past the check meets the unique index and gets the same 409 |
| `admin/events/[id]/result-pacers/[pacerId]` | PATCH, DELETE | One pacer tag. PATCH `{ paceGroup }` only (the bib is not editable: a tag on the wrong runner is removed and the right one marked), refused 400 on a race that is not results-only; an unchanged group writes nothing. DELETE is allowed on any race, so a tag can never be stranded. Same scope and verb as the POST; audited `result_pacer.updated` / `result_pacer.removed` |
| `admin/events/[id]/pacers` | GET, POST | This race's pacers, and adding one (`PACER_DISCOUNT_PLAN.md` Batch 1). `promo:manage`, scoped to the signed-in organizer's own event — without the `organizerId` any admin handed another's event id could mint free entries in their race. POST takes an optional `bibNumber`, refused **409 with the field** when another pacer in the race has it. POST writes the code, `discountType: 'PACER'`, `usageLimit: 1`, `automatic: false` and **exactly one `PromoCategory` row in the same statement**, since a pacer code with no category would be a free entry to whichever distance the pacer chose. Uniqueness is the `[organizerId, code]` index: the route retries a fresh `pacerCodeFor` on `P2002` five times rather than checking first, because a check before a write is one two simultaneous requests both pass, and answers 409 if it somehow loses every time. `waiveAdminFee` is refused **403 with the field** without `promo:waive-fee`, never silently dropped. Creating with the waiver on writes **two** trail entries: `pacer.created` and `pacer.fee_waived`. GET is the same scope and permission as the write; the screen itself is server-rendered and re-reads through `router.refresh()` |
| `admin/events/[id]/pacers/[pacerId]` | PATCH, DELETE | Changing or removing one pacer. PATCH takes any subset of `assigneeName` (a rename — **the code never changes**, or a pacer already holding it would find it dead), `bibNumber` (set, changed, or cleared with a blank; 409 when another pacer here has it; audited as "bib set to …" / "bib cleared"), `paceGroup` (set, changed or cleared; `paceGroupFromInput`, audited as "pace group set to …" / "pace group cleared"), `paused`, `codeSent` (whose timestamp is taken on the server: a client that could name it could name yesterday) and `waiveAdminFee` (`promo:waive-fee`, else 403 with the field). A body that changes nothing answers the row unchanged rather than writing a trail entry saying so. The **category is not editable** — it is in the code's own text and it is the slot the organizer set aside, so moving it would silently move a held place between distances; deleting and re-adding is the honest way. DELETE answers **409 once the code has been used**, saying to pause it instead: the registration survives on its snapshot either way, but removing the code would leave a runner in the race whose free entry nothing on the screen can account for. `discountType` is in the `where` alongside `organizerId` and `eventId`, so this is not a second way to pause or delete ordinary promotions |
| `admin/registrations/[id]/follow-up` | POST | **"Log follow-up…" on the Unpaid checkouts tab** (`UNPAID_FOLLOWUP_PLAN.md` Batch 1). Body `{ outcome, note? }`, the outcome one of `FOLLOW_UP_OUTCOMES` (`lib/follow-up.ts`), the note trimmed and at most 300 characters (400 otherwise, saying which). Gated by `registration:view` and scoped to the order's race — every event role, VIEWER included, since staff doing follow-up is the tab's point — and only for an order `unpaidFollowUpWhere` would list and not CANCELLED (409 for a paid or cancelled one). Writes one `registration.followed_up` audit row (`changes: { outcome, note }`) and nothing on the order. `LINK_SENT` (Send by hand's *Mark as sent*, Batch 4) also needs `registration:email` (403 otherwise) and records `via: 'hand'`. Answers `{ followUp: { outcome, note, by, at } }` |
| `admin/registrations/[id]/payment-link` | POST | **A payment link for an unpaid order** (`UNPAID_FOLLOWUP_PLAN.md` Batches 3–4), the checks and the hold in `lib/payment-link.ts`. Body `{ via }`: `copy` (the default, no body needed) answers `{ url, expiresBy, untilLabel }`; `manual` renders `paymentLinkEmail` and answers `{ message: { to, subject, html, text }, expiresBy, untilLabel }`; `email` sends it through Resend and answers `{ sent: true, to, … }`, or `{ sent: false, error, message, … }` when Resend refuses, so the client falls back to by hand; any other `via` is a 400. One trail row per call: an email that went out is a `registration.followed_up` row (`outcome: 'LINK_SENT', via: 'email'`), everything else a `registration.payment_link.copied` row saying what became of the link; the row of the call that moved the hold carries `holdUntil`. Gated by `registration:email` (decision D3) and scoped to the order's race; only for an order `unpaidFollowUpWhere` lists that `payableState` calls payable (409 naming why otherwise — an expired one is told to send the registration link). The first link sets `holdUntil` through `extendedHold` with a conditional claim (`holdUntil: null`), so two copies at once move it once. The link is valid until the order's `expiresBy` and built on the event's own site (`eventOrigin`: a client's subdomain, else the main host; `CLIENT_SUBDOMAIN_PLAN.md` Batch 3) |
| `admin/registrations/[id]/payment-check` | POST | **"Check payment" on the Unpaid checkouts tab** (`UNPAID_ORDERS_PLAN.md` Batch 4). Gated by `registration:validate` and scoped to the order's race, like the status route; refuses a bank transfer or complimentary order (400) and a CANCELLED / REFUNDED one (409). Looks the stored `checkoutSessionId` up through `lookUpPaymongoPayment` (`lib/online-payment.ts`: `cs_` → `GET /v1/checkout_sessions/{id}`, `pi_` → `GET /v1/payment_intents/{id}`). Answers `{ result, message }`: `marked_paid` (a PENDING order PayMongo has paid — flipped through `settleOnlinePayment`, the webhook's own path, which sends the receipt and writes one `registration.status.changed` row in the same transaction), `already_paid`, `paid_after_expiry` (EXPIRED but paid — never flipped, needs a reinstate or refund) or `not_paid`. Only a check that changes the status writes to the trail. PayMongo unreachable or answering badly is a 502 with the reason |
| `admin/registrations/[id]/status` | PATCH | Confirm or reject a manual payment, and write the validator's internal `remarks`. Takes either or both; the status is guarded against a fixed list and the receipt email fires only on the *transition* into `PAID`, so a later remarks-only PATCH cannot send a second receipt. Auth-checked and scoped to the signed-in organizer's own events — **this route had none at all until Batch E**, which made it the one way for anyone on the internet to mark a registration `PAID`. When the status moved, the answer carries `statusChange` (`by`, `at`, `from`, `to`, `reason` — the same name the trail entry snapshotted), which the registrant modal's *Validated by* line reads. Two optional fields serve Cancel order… on the Unpaid checkouts tab (`UNPAID_FOLLOWUP_PLAN.md` Batch 2): `reason` (text, at most 200 characters) goes into the status change's trail summary and `changes.reason`; `expectedStatus` refuses with 409 and changes nothing when the order is no longer in that status, checked after the permission check and again inside the transaction's PENDING claim, so an order paid while the dialog was open is never cancelled. **PENDING → CANCELLED hands the order's promo back** (`releaseRedemption`, `pending-expiry.ts`) and the trail row says so; cancelling from any other status hands nothing back. **Moving an order that holds no slot (`EXPIRED`, `CANCELLED`, `REFUNDED`) to PAID or PENDING takes its slot again** through `reserveSlots`, under the category lock checkout uses, and is refused with 409 when the race has refilled (the promo is not spent again); this is how an organizer validates a bank transfer the 7-day sweep already expired, and it stops an undone cancellation from overselling a full race (Strix vuln-0001, run 9cda) |
| `admin/registrations/[id]/email` | GET, POST | The email a registration is owed, rendered for a person to send by hand — `GET` returns the recipient, subject and **both** renderings (HTML for the clipboard, plain text for a `mailto:`), `POST` records that a staff member sent it. Auth-checked and scoped like the status route, which matters more here than most: the rendered email carries every runner's contact details, birthdate and emergency contact |
| `admin/runners/[id]`, `admin/runners/bulk-delete` | PUT/DELETE, POST | Registrant editing. **Removal is soft** — `deletedAt`/`deletedById` are stamped and the row stays (§4), so a runner already removed answers "Runner not found". An edit needs `registration:edit`, a removal `registration:delete`. **Removing the last live runner of a PENDING order cancels the order** in the same transaction and hands its promo back (`cancelEmptiedOrders`, `UNPAID_ORDERS_PLAN.md` Batch 5), with a `registration.status.changed` trail row; the answer lists it in `cancelledOrders`, and the delete confirmation warns first. A PAID order left empty stays PAID — the confirmation tells the admin to settle it separately. Each edit writes one audit row naming the fields that changed (sensitive columns as "changed", never their values), and each removed runner — bulk included — gets its own row carrying their name and runner reference. The PUT refuses an email that is not an address (`email-address.ts`), and when the edited runner is **runner 1 it also writes `Registration.customerEmail`**: every email about an order is addressed to that column, it was previously written once at checkout and never again, so correcting the typo on the runner fixed the list and left the mail just as undeliverable. The sync is unconditional, which makes re-saving runner 1 the repair for an order whose contact address drifted out of step before this existed. It also takes `guardianName` (uppercased) and `guardianRelationship` (`asGuardianRelationship`; an unknown value is refused with "Select a relationship"; a blank name clears both), both audited as sensitive; it **never writes `guardianConsentAt`** and never requires a guardian, even for a minor. A body without the two keys leaves them alone. It also takes the four home-address parts (`RUNNER_ADDRESS_PLAN.md` Batch 3): all blank clears them, anything else must pass `runnerAddressProblems` ("Home address — Barangay: choose a barangay") and is stored with `storedRunnerAddress`; audited as sensitive; a body without the keys leaves them alone |
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
| `admin/team/[id]/two-factor` | DELETE | **An admin resets a member's two-step sign-in** (`TWO_FACTOR_PLAN.md` D4). Same `loadManagedMember` guard (never one's own row, an admin never another admin, the owner has no membership). `resetTwoFactor` (§5): 409 when it is not on; otherwise the four columns cleared, the member's `sessionsValidFrom` moved, `auth.two_factor_reset` on their StaffAccount with the admin as actor, then `sendTwoStepResetEmail` in `after()` (D10) |
| `admin/team/[id]/invite` | POST | **Resends** an unaccepted invitation with a **new** token and a new week — the old link dies. Same guard; reports `emailSent` like the invite |
| `admin/profile/google` | PATCH | **Unlink Google sign-in** (`LOGIN_UX_PLAN.md` D7) — the signed-in StaffAccount only (400 for the owner). `{ password }` → 400 with `errors.password` when empty or wrong; otherwise clears `googleSub` and writes `auth.google_unlinked` (nothing written when nothing was linked). Ends no session |
| `admin/profile/two-factor/start` | POST | **Two-step sign-in, step 1** (`TWO_FACTOR_PLAN.md` 2.1) — self-service, any account. 503 when `TOTP_ENCRYPTION_KEY` is unset, 409 when already on. Writes a fresh sealed secret **unconfirmed** (overwriting an unfinished one; it counts for nothing until confirmed) and answers `{ qrSvg, secret }` — the QR drawn on the server with `qrcode`, the secret in fours |
| `admin/profile/two-factor/confirm` | POST | `{ code }` (6 digits, else `errors.code`). Throttled per account (`TWO_FACTOR_RULE`, bucket `two-factor`, shared by the three code routes). A wrong code → 400 `errors.code` and `auth.two_factor_failed`. Right: one conditional transaction on the secret that was read (409 if another tab restarted setup) sets `totpConfirmedAt`, `totpLastStep`, ten recovery-code hashes and `sessionsValidFrom` (D9), writes `auth.two_factor_enabled`, then reissues this session. Answers `{ codes }`, the only time they exist in plain text |
| `admin/profile/two-factor/disable` | POST | `{ password, code }` — both required (D6); a recovery code counts as a code. Same throttle. The password is checked first (a Google-only account with none gets `errors.password` saying to set one), then the code (`checkSecondStep`). Clears all four columns (`TWO_FACTOR_OFF`), moves `sessionsValidFrom`, writes `auth.two_factor_disabled` (`changes.with`: `totp` or `recovery`), reissues this session and emails "Two-step sign-in was turned off" in `after()` (D10) |
| `admin/profile/two-factor/recovery-codes` | POST | `{ code }` (app or recovery code). Same throttle. Replaces all ten hashes and answers the new `{ codes }` once; writes `auth.recovery_codes_renewed`. No email, no sessions ended |
| `auth/two-factor` | POST | **Public; the second sign-in step** (`TWO_FACTOR_PLAN.md` 3.3). `{ code }` — an authenticator code or a recovery code. Needs a valid `two_factor_pending` cookie (`lib/two-factor-pending.ts`), else `{ code: 'two_factor_expired' }` 401. **Checks the account again** (`signInSubject` + `checkSignIn`): suspended or archived in the meantime → that refusal's `{ code }` and the cookie is cleared; two-step turned off meanwhile → `two_factor_expired`. Then `checkSecondStep` (spends the code). Right → the cookie goes, `finishSignIn` with the carried `method` and `keep`, the `auth.signed_in` row records `twoFactor: 'totp' \| 'recovery'`, a recovery code also writes `auth.recovery_code_used`, a pending Google link is written; answers `{ next, recoveryCodesLeft? }`. Wrong → `errors.code` 400 and `auth.two_factor_failed`; the fifth wrong code on one pending cookie clears it (`{ code: 'two_factor_tries' }`). Throttled per address (`LOGIN_RULE`, bucket `two-factor-sign-in`) and per account (`TWO_FACTOR_RULE`, bucket `two-factor`, the one Settings › Security uses) |
| `auth/google` | GET | **Public.** Starts "Continue with Google" (`LOGIN_UX_PLAN.md` Batch 3): `?next=` through `safeNextPath`, then a redirect to Google with state, nonce and a PKCE challenge, kept in the `google_oauth` cookie (`lib/google-oauth.ts`), together with `?keep=1`, the "Keep me signed in" box (Batch 4). The redirect URI is this request's origin + `/api/auth/google/callback`, so every host it runs on must be listed on the Google OAuth client. Not configured → back to `/admin/login?error=google_unavailable` |
| `auth/google/callback` | GET | **Public.** Throttled with `LOGIN_RULE` (bucket `google-callback`). Refuses a `state` that does not match the cookie (deleted either way), exchanges the code, verifies the ID token, finds the account (`googleSignInAccount`), then `checkSignIn(subject, { method: 'google' })` — the password route's own rules — and `finishSignIn` with the cookie's `keep` for a 30-day session. Success links the `sub` the first time and redirects to `next`. **An account with two-step sign-in on is asked the code too** (D2): it gets the pending cookie and a redirect to `/admin/two-factor`, and a first sign-in's `sub` rides in that cookie, linked only once the code is right; every refusal redirects to `/admin/login?error=<code>` (keeping `next`), never with text |
| `auth/forgot-password` | POST | **Public** (`LOGIN_UX_PLAN.md` Batch 2). `{ email }` → always `200 { success: true }`, held to a 1-second floor, whether or not a link was made; 400 only for an empty email, 429 past `PASSWORD_RESET_RULE` (per address and per email). Makes a link only when `canResetPassword` allows it, writes `auth.password_reset_requested`, and emails it in `after()`. |
| `auth/reset-password/[token]` | POST | **Public.** `{ password, confirmPassword }` → 400 with field errors (`newPasswordErrors`), 410 `{ error, state }` (`used` or `expired`), 403 when the account may no longer reset, else `{ success: true }`. One transaction claims the link, writes the hash, ends every session and writes `auth.password_reset`; the "password changed" email goes in `after()`. Does not sign in. Throttled with `LOGIN_RULE` (bucket `reset-password`). |
| `auth/invite/[token]` | POST | **Public.** Accepts an invitation — a team member's, or a **client viewer's** (Batch 3), whose acceptance also moves the client INVITED → ACTIVE **in the same transaction** (conditional on the status read; if the client moved, the whole acceptance rolls back and answers 403), writes `client.invitation.accepted` instead of `staff.invitation.accepted`, and is refused for an archived client. Unknown, used, expired or malformed tokens all answer 410 with one sentence. A new account must send `name`, `password`, `confirmPassword`; an existing account must send its **current password** (a wrong one is written to the trail as a failed sign-in). The membership is claimed with a conditional `updateMany`, so a double press cannot accept twice; then the account becomes `ACTIVE`, the trail gets `staff.invitation.accepted` + `auth.signed_in`, and the session cookie is set for that organizer |
| `admin/clients` | GET | **The client submissions** (Batch 3), `platform:manage` (`platformActor()`). Every client newest first with its fifteen application columns, `invitedAt`, its event count and its **viewers** (the VIEWER memberships on Run As One's tenant: name, email, account status, invited / accepted / suspended / expiry instants — never a token hash) |
| `admin/clients/options` | GET | The event form's Client picker: `id`, `name`, `status` of every client, archived included so an edit form can name a race's existing link. `platform:manage`; **a 403 is how the form knows not to draw the picker** |
| `admin/clients/[id]` | PATCH | **Archive or restore**, `{ status: 'ARCHIVED' \| 'NEW' }` and nothing else (400). The move is checked by `clientStatusAfter` (409 naming the status), the write is conditional on the status read (409 if it moved), and `client.archived` / `client.restored` is written in the same transaction. A status, never a delete; archiving ends the client's viewer sessions on their next request **Or `{ branding: {…} }`, the client's own site** (`CLIENT_SUBDOMAIN_PLAN.md` Batch 1): the whole Site & branding section, checked by `readBranding` (400 with `errors` per field), a subdomain held by another client refused by name (409, the index catching a race), and in production a new subdomain refused (409) until `https://<label>.runasone.ph/` answers with the proxy's 307 to `/events`, so one saved before its DNS record and Vercel domain cannot take the client's races offline, written with one `client.branding.changed` trail row naming only the fields that moved; never touches the status. |
| `admin/clients/[id]/viewers/[viewerId]/two-factor` | DELETE | **The same reset for a client viewer** (D4, task 4.2). `platformActor`; the membership must be a VIEWER of *this* client in this organizer (404 otherwise, whoever's it is) and not the actor's own (403). Then exactly the team route's `resetTwoFactor` and email. The clients list (`GET admin/clients`) carries each viewer's `twoFactorOn` as a yes/no, never the secret |
| `admin/clients/[id]/invite` | POST | **Send invite / Resend invite** (Batch 3). `{ name, email }` through `readInvitee`, refusing per field. Creates the viewer through the team machinery — a `StaffAccount` if the address has none, a `VIEWER` `StaffMembership` on the actor's tenant with `clientId`, a hashed token (`newInvitation`) — or, for a person whose invitation to this client is still waiting, **replaces the token** (the old link dies). Refuses an archived client (409), an address that signs in as an Organizer, one already on the team or signing in for another client (a membership is unique per person per tenant), and one already signing in for this client while it is ACTIVE. **A restored client whose old sign-in was never removed** is the one non-refusal: inviting that same person makes the client ACTIVE again and emails nobody (`reactivated: true`). The client moves via `clientStatusAfter` (INVITED, or stays ACTIVE), `invitedAt` is stamped, and `client.invited` / `client.invitation.resent` is written — all one transaction, conditional on the status read. The email (`clientInvitationEmail`) goes after and never fails the invite; the answer carries `emailSent` / `emailError`, `resent` and `expiresAt` |
| `admin/remittances` | POST | **Records a remittance** (Batch 6). Multipart: `eventId`, `kind`, `amount` (pesos as typed), `paidOn`, `method`, `reference`, `note`, optional `proof` file. The race is read `{ id, organizerId: actor.orgId }` and needs `remittance:manage` on it (404 *Event not found.* otherwise, 401 signed out); fields through `readRemittance`, refusing per field under `errors` (a bad receipt under `errors.proof`). The receipt is uploaded to the private store before the write; the row and `remittance.recorded` are one transaction. **A payout larger than the balance is allowed.** Answers 201 `{ id }` |
| `admin/remittances/[id]` | PATCH | **Voids one**, `{ void: true, reason }` and nothing else (400). Same reach (404 *Remittance not found.*), a reason through `readVoidReason`, 409 when already voided; the write is conditional on `RECORDED`, and `remittance.voided` (carrying the reason) is in the same transaction. There is no edit and no delete |
| `admin/remittances/[id]/proof` | GET | The receipt, as a redirect to a 5-minute signed URL, after writing `remittance.proof.viewed`. Same reach; 404 when there is no receipt |
| `admin/notifications` | GET | **The bell's feed** (§5 `notification-store.ts`): `{ items, viewerKey, now }`, `no-store`. Any signed-in person (401 otherwise) — each kind is gated by its own permission inside the store, so the route adds no check of its own. `viewerKey` is the person's id, under which the bell files its read marks |
| `admin/search` | GET | **What the quick jump can reach beyond the menu** (`DASHBOARD_SHELL_PLAN.md` Batch 2): `?q=` matched against event titles, case-insensitively, answering `{ events: [{ id, title, day, href }] }` — `href` is that race's **registrants** screen, because a person typing a race's name on event day is looking for the people in it. Any signed-in person (401 otherwise), but what they get back is `reachableEvents(actor, 'registration:view')` — the same gate the registrants page itself enforces — so a STAFF member sees only their assigned races and a **client viewer**, holding only its counts and payout verbs, gets an empty list and keeps the Batch 1 palette. **The filtering has to be here rather than in the browser**: shipping every title to the client so it could match them there would hand a staff member the names of the races they were deliberately not assigned to. A query under 2 characters is answered `{ events: [] }` without a database call, and the result is capped at 8 — the palette is a way to *one* known thing, and the menu's own rows have to stay in view underneath it |
| `admin/communities`, `admin/communities/[id]` | GET/POST, PATCH/DELETE | Club curation. `platform:manage` (`platformActor()`) |
| `admin/site-settings` | PATCH | **The admin email and the social links**, `{ contactEmail }` or `{ socialLinks: { facebook, instagram, tiktok, youtube } }` — **only the fields sent are validated and written**, so each panel saves alone. `platform:manage` (`platformActor()`). Email trimmed and shape-checked (`errors.contactEmail`); each link checked with `socialLinkError` (`errors.<channel>`), stored through `normalizeLink`, empty → null; 400 on any error. An unchanged value writes nothing. Upserts the `SiteSettings` row and writes `settings.contact_email.changed` and/or `settings.social_links.changed` (on the *Site settings* Activity shelf) in one transaction, then `revalidateTag(SITE_SETTINGS_TAG, { expire: 0 })` so the next page and email already carry it. Answers `{ settings: { contactEmail, socialLinks } }` |
| `admin/platform-fee` | PATCH | **The default platform fee** (`SETTINGS_PLAN.md` Batch 4), `{ adminFee }` in pesos as typed. `org:settings` (Super Admin only; 403 otherwise). Checked with `readPlatformFee` (`errors.adminFee`, 400). Writes `Organizer.adminFee` on the actor's tenant and `settings.platform_fee.changed` (`entityType: 'Organizer'`, old and new centavos in `changes`, on the *Site settings* shelf) in one transaction; an unchanged value writes nothing. **Existing events are not touched.** Answers `{ adminFee }` (centavos) |
| `admin/feedback`, `admin/feedback/[id]` | GET, PATCH/DELETE | The feedback inbox. `platform:manage` only (`platformActor()`) — a client or a per-event staff member reading it would be reading others' complaints about the software, and strangers' email addresses. `GET` returns everything newest-first rather than paged: the whole table is the messages people took the trouble to write, and if it ever outgrows one call that will be a good problem. **`PATCH` moves the triage mark and nothing else** — the message, the name and the address are what somebody else wrote, and an inbox that can edit its own mail is one whose contents cannot be trusted later. `DELETE` is a genuine delete, unlike anything on a registration: there is no person waiting on the row, nothing in the product reads it, and a kept-"in case" spam row is one more thing between the owner and the messages that matter. The screen confirms first |

