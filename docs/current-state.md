<!-- Part of the Run As One project guide. This file is §10, the current state; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 10. Current state

**Production is current as of 2026-10-21.** `main` equals `dev` at
`a1b05df`: everything below is live, including category changes and delivery
switches paid on the runner's link (online, or GCash/bank with a proof staff
validate), one **Pay ₱X** button in the category change email, the switch
link's two-step rail, and the Neon compute cut. Every migration in
`prisma/migrations` is applied, through `20261018120000_logistics_change`
(the live register page reads every `Event` column, so it would fail without
it). The previous release was at `b689956`.
Pre-deploy QA passed on 2026-10-21 on `local-dev` with the owner's orders
RM-7B67DB3F (bank) and RM-98EEC0B5 (QR Ph), every email to the owner only: a
bank upgrade 5K → 10K by proof link and Validate Payment; an online upgrade
3K → 5K (₱203.05) through PayMongo test mode, applied on the `?paid=1` return;
an online switch (₱152.29) and a bank switch re-priced on the link from ₱200
to ₱150 with a receiver, proof and Validate; back to pickup; and the link at
375px. **A real PayMongo webhook settling an upgrade or a switch is still to
be seen** (the return path settled them; the webhook cannot reach localhost).
Strix `run-as-one-scan_4695` found vuln-0001 (a switch rode free on another
order's paid parcel; fixed in `234c782` by the owner's rule below, one
delivery fee per order) and vuln-0002 (staff recording a payment with a fee or
proof the runner had just changed; fixed in `a1b05df`); the re-scan
`run-as-one-scan_aaa6` found nothing. **`crc.runasone.ph` answers in
production; `racecore.runasone.ph` does not resolve yet** (`ON_HOLD.md`).
`TOTP_ENCRYPTION_KEY` and the Google sign-in credentials are set in Vercel.
The live PayMongo account is not yet a business account, so the online wizard
offers **QR Ph only** (`OFFERED_PAYMONGO_METHODS` in `lib/free-checkout.ts`)
until it is. Where an entry below says something is "not released" or
"production is N migrations behind", it predates this release.

**Image compression on upload (2026-10-21, not committed).** Every image
upload but certificate templates is shrunk in the browser before it is sent
(`lib/image-compress.ts`, `IMAGE_COMPRESSION_PLAN.md` C1–C6): both
registration wizards' proof, the category change and delivery switch links,
staff-recorded payments, remittance receipts and feedback screenshots
(`proof`); event cover, size chart, posters, highlights and a client's hero
(`photo`); client logo, site icon and bank QR (`graphic`). Stored files are
left as they are (C6). Checked on localhost 2026-10-21 with the upload request
stopped in the page, so nothing reached the shared Blob store: a 1080×2400
PNG screenshot 1,876 KB → 0.30 MB JPEG (900×2000, every reference number
legible); a 4032×3024 camera JPEG 6,187 KB → 227 KB for cover, poster and
highlights, and accepted where the 4 MB check used to refuse it (feedback
6.04 MB, remittance receipt 5.51 MB); a 2000×2000 transparent PNG logo
148 KB → 72 KB, 1024×1024, PNG, corners still transparent; a 1600 px QR PNG
sent unchanged (resizing made it no smaller); a GIF untouched. *Optimizing
image* shows and the form's submit waits while it runs. The bank-transfer
wizard's proof step was walked on `local-dev`'s Pink Run 2026 Virtual (the
owner's pick, nothing submitted, `/api/checkout` stopped in the page): a
picked 1,804 KB PNG screenshot → 0.27 MB, a dropped 5,634 KB camera JPEG →
0.19 MB, a PDF untouched, a photo overtaken by a PDF picked straight after
left the PDF, and *Submit & Finish Registration* disabled while a
replacement was optimizing. **Not clicked through in the browser**: the
online wizard's proof step (`RegistrationWizardClient`, the same change as
the bank-transfer wizard's), and the category change and switch proofs
(unchanged call, preset now 2000 px instead of 1600).

**Neon compute cut (2026-10-18, on `dev`, not released).** By Oct 18 the
free plan's 100 CU-hours for October were 93% used: production ~77.5, the
`local-dev` branch ~15. The compute averaged 0.26 CU, so queries were not the
cost — it woke ~49 times a day and stayed up ~85% of hours, through the night
too. The public pages read the database on every request, so every crawler
hit kept it awake, and the dashboard bell asked every minute. Fixed with
cached public reads (`lib/public-db.ts`, cleared by any write in `lib/db.ts`),
`src/app/robots.ts`, and the bell asking every 10 minutes and not at all after
15 idle minutes. `pg_stat_statements` is not installed and Neon logs are not
on, so which callers woke it overnight was inferred, not seen. Still worth
doing by hand: Vercel Firewall's bot protection, and watching the CU-hours
after release.

**Delivery switches (2026-10-19, complete on `dev`, not released; `LOGISTICS_CHANGE_PLAN.md`
Sessions 1, 2, 2b, 3 and 4 and Revisions 1–3b — the plan was deleted on
2026-10-21 (it lived in the git-ignored `docs/plans/`, so it is not in
history); every decision is below and what is open is in `ON_HOLD.md`).**
Staff switch one PAID receipt at a time between kit pickup and delivery from
the **registrants table's row menu** (Revision 2, below): any runner's row
switches that runner's whole receipt, so a group registration moves as one.
Session 1 (`aa2f7dd`): the `LogisticsChange` and `LogisticsChangeOrder`
tables and `Event.logisticsChangeUntil` (migration
`20261018120000_logistics_change`, in `ON_HOLD.md`'s release steps), the pure
quote and rules `lib/logistics-change.ts`, and the event form's *Delivery
switch deadline*. Session 2 (`12db630`): the writer
`lib/logistics-change-store.ts` (with `logistics-change-context.ts` and
`logistics-change-view.ts`), the routes `admin/registrations/[id]/logistics-change`
and `admin/logistics-changes/[id]/cancel`, and a registrants-table modal.
**Session 2b (Revision 1, the owner's call after trying Session 2):** the
switch moved off the registrants table onto Pickup & Delivery, one row per
receipt (the owner then asked for a table on desktop, cards only on a phone); the store takes one receipt per switch (no `includeIds`, no
same-email candidates, no rider pre-ticking, no preview read); new
`lib/logistics-change-parcels.ts` (riders, R4's check and both sentences) and
`lib/logistics-receipts.ts` (the page's one read); the registrants Logistics
cell keeps the chip, "Ships with" and the export's *Logistics Note* but no
action, modal or history. **Session 3 (payment):** a switch with a fee is
paid through a third kind of payment-link token and `/pay/logistics/[token]`
(`api/logistics-change/checkout`, the category change's checkout with its claim
hardening), or by GCash or bank recorded on the card with a reference and an
optional proof (`admin/logistics-changes/[id]/record-payment`, `…/proof`);
both apply through `applyLogisticsChange` under the switch locks, moving the
order's logistics and never its amounts. The PayMongo webhook settles a switch
after orders and category changes; a payment for a cancelled or expired switch,
or one arriving after the switch deadline, is written as
`logistics_change.payment_late` and never applied
(`lib/logistics-change-payment.ts`). The daily sweep expires lapsed switches
(`lib/logistics-change-expiry.ts`; the three sweeps now run from
`lib/expiry-sweep.ts`). Two emails to the order's contact
(`lib/email-logistics-change.ts`): *payment needed* (link, or accounts and QR
codes) and *switched* (where it ships, or the pickup details from `pickup.ts`),
stamped on the switch, with a by-hand send. The waiting receipt's card and
opened row carry *Copy payment link*, *Email payment link* (both methods since Revision 3),
*Record payment* and *Cancel switch*, each on its own permission. The trail
vocabulary was split out of `activity.ts` into `activity-actions.ts` on the way.
**Session 4 (money, client view):** an APPLIED switch that charged something
is its own settlement line (`settlement.ts` `SwitchTotals`, summed by
`settlement-store.ts` while its order is PAID): what it charged is collected,
its PayMongo cut is processing, and owed rises by exactly the fee (L8). A
waiting, cancelled or expired switch, a payment flagged late (never applied)
and a ₱0 ride never count. `/admin/remittances` shows "₱… delivery switches"
under Owed, the race's breakdown *Paid for delivery switches* and *Delivery
switches*, and the client payout summary a *Delivery switches* sentence
(`client-payout.ts`). The client viewer's runner list and export read
"Switched from pickup" and "Ships with RM-…" (`client-runners.ts`, through the
registrants' own `logisticsMove` and `shipsWith`; no amount, status, payment
or reason of a switch leaves its select). **The owner's addition, *Already
paid, record it now*:** a fee the runner already sent by GCash or bank is
recorded as the switch is made, with its reference and an optional proof
compressed in the browser: one form post to the create route, the proof
uploaded to the private store first and deleted again if the switch is
refused, the switch written APPLIED in the store's own transaction and locks
(money as *Record payment* writes it: `BANK_TRANSFER`, `totalCharged = fee`,
no transaction fee), one `logistics_change.applied` row saying "recorded as
the switch was made" (`recordedAtCreation`), and only the *switched* email.
Offered on every receipt with a fee to staff with `registration:validate`
(the route asks it too), whatever the entry was paid with, since the money is
already in (`switchPaymentChoices` in `category-change-hold.ts`).
Session 4 verified on the same QA event with two temporary orders (removed,
the event restored, the proof deleted): *Already paid* through the panel on a
QR Ph order with a reference and a proof — applied at once, one audit row,
`createdEmailSentAt` empty and `appliedEmailSentAt` stamped, the receipt's
amounts unchanged; owed moved from ₱3,500.00 to ₱3,650.00, exactly the ₱150.00
fee, on the breakdown and the list (desktop and card); a ₱100 switch waiting
for payment left owed alone and was cancelled; *Already paid* with a proof on
a switch that had become a ₱0 ride was refused and its upload deleted; the
₱0 ride added nothing; and the client runner list, its export and the payout
summary read through the lib functions with a client viewer actor ("Switched
from pickup · Ships with RM-…", *Delivery switches* 1, ₱150.00). **Not seen:**
the client race page signed in as a client viewer (the only viewer accounts on
local-dev are real clients'), and the *Already paid* fields at 375px (they are
single-column inside the shared panel). The Overview's *Total Revenue (Net)*
counts paid switches the same way since (`admin/overview-data.ts`, split out of
`admin/page.tsx` with `OverviewPanels.tsx` first): with one temporary ₱100
online switch (₱5.25 PayMongo cut) on the QA event, the tile and Remittances'
owed both rose by exactly ₱100.00 and *Platform Fees Collected* did not move.
Verified on `local-dev`'s QA event `qa-virtual-run-test` with four temporary
orders (removed after, the event's settings restored): a ₱0 switch riding on a
paid parcel (the host's card gained *Also in this parcel*), a ₱100 switch saved
as waiting and cancelled from its card, R4 refused in the panel and at the
route, R5 refused in the panel and at the route and then the rider back first
and the host after, the panel empty when opened on the next receipt, no
receipt amount changed, the registrants row menu without a switch, and the page
at 375px with no sideways scroll. Session 3, on the same event with three
temporary orders (all removed, the event restored, the test proof deleted from
the private store): a ₱101.53 switch paid through PayMongo test mode (QR Ph,
simulated) and applied on the return through `settleSwitchOnline`, the
webhook's own path (a webhook cannot reach localhost); the real webhook route,
called in-process with a signed test event, ignoring a retry and flagging a
payment for an expired switch and one after the deadline as late; a bank
payment recorded with a proof (lib) and one through the card's *Record
payment*; a switch expired by the sweep; *Copy payment link*, *Email payment
link*, *Cancel switch* and the by-hand send from the card, at desktop and
375px; and both emails, including back to pickup, rendered and delivered to the
owner's own address.
Decisions the code cites: **L2** whole order; **L3** PAID only; **L4** the
receipt is never edited; **L5** staff never type a fee; ~~**L6** one fee per
parcel, ₱0 on a paid parcel~~ (retired 2026-10-21: one fee per order, above);
**L7** no Run As One fee; **L8** the fee is the organizer's; **L9** back to
pickup is free and refunds nothing; ~~**L10** a parcel others ride on cannot go
back alone~~ (retired with L6); **L11** deadline, default 7 days
before race day; **L12** hold windows as an upgrade's; **L13** one awaiting
switch per order. Revision 1 (owner, 2026-10-19, final): **R1** a screen of its
own, Pickup & Delivery, `registration:view` to see and `registration:edit` to
switch; **R2** one card per receipt with counts, search and filters; **R3** one
receipt per switch, the panel mounted fresh per receipt; ~~**R4** a second
receipt to an address whose switch still waits for payment is refused~~ and
~~**R5** a receipt others ride on goes back to pickup after them~~ (both
retired with L6 on 2026-10-21: no receipt rides on or waits on another);
**R6** the registrants table only reads switches.
**One address per group (owner, 2026-10-20).** Shipping each kit to its
runner's own home is gone everywhere: the wizards' *Where the kits go* choice
(`DeliveryStep.tsx`, `useDeliveryPlan.ts`), both checkout routes
(`checkoutDelivery` no longer takes `deliverySplit`) and the *Ship kits*
panel's *One address* / *Each runner's home*. Every new order and switch is
`deliverySplit: false`; orders already split keep reading right through
`shipmentsFor`.
**Revision 2 (owner, 2026-10-20, final): per transaction, from the
registrants.** The Pickup & Delivery screen was removed (R1, R2 and R6 are
superseded; R3 and L2–L13 stand, less L6, L10, R4 and R5, retired on
2026-10-21). Each runner's row menu offers *Switch to
Delivery* / *Switch to Pickup* for its receipt — the same *Ship kits* panel,
mounted per receipt, every runner on the order moving with it — plus
*Delivery Payment* while a switch waits for its fee (`OrderSwitchModal.tsx`,
wired by `useOrderSwitch.tsx`); past switches are in the row's one *History*
since 2026-10-21 (below). The
registrants page reads `readEventReceipts` beside its own list, and the table
takes the fresh rows after a switch re-reads the page.
**Ship kits like the wizard (owner, 2026-10-20).** RM-1D5EEF1B's panel showed
empty pickers under "from Runner 1's home address" because its runners have no
home address at all (registered 2026-09-20, before `RUNNER_ADDRESS_PLAN.md`;
the street text was the placeholder). The panel now lays the address out like
the wizard's Logistics step (`ship-kits-address.tsx`): Runner 1's home as a
card with *Change*, or empty fields and no claim when there is none; the fee
line; ZIP, landmark and *Someone else will receive the kit*. The receiver is
stored in `deliveryAddress` as checkout stores it. Both switch emails show a
*Delivery* card with the landmark and receiver (`deliveryAddressDetails`).

**Revision 3 (owner, 2026-10-20): the runner confirms their own delivery
details on the link**, for online and GCash/bank switches alike (T1–T11 at the
top of `LOGISTICS_CHANGE_PLAN.md`). Staff pick only how the fee is paid; the
*confirm and pay* email (one for both methods) links to `/pay/logistics/[token]`,
now two steps (`SwitchConfirm.tsx`; since 2026-10-21 each opens with the
wizards' `StepRail`, *Delivery details* → *Payment*, and "Step n of 2"): the wizard's `DeliveryStep` from the
switch's address, re-quoted under the locks on *Confirm Details*
(`lib/logistics-change-runner.ts`, `api/logistics-change/details`: a new tier
re-prices it; until 2026-10-21 a paid parcel there applied it at ₱0 and R4
refused, both now gone), then *Pay now*
or the accounts, QR codes and the screenshot and reference
(`api/logistics-change/proof`). The page shows the whole address while a switch
waits (T4, reversing the masking). "Proof submitted" is a waiting bank switch
with a proof (`lib/logistics-change-proof.ts`, no migration): it stops the hold
until the switch deadline (T6), the runner may replace it (T7), the registrants
cell and *Delivery Payment* show it with *View proof*, and *Record payment*
starts from its reference and keeps its screenshot. The checkout route refuses
a bank switch (T10). Verified on `local-dev` with the owner's orders only
(RM-7B67DB3F by bank: Ship kits → Copy link → address moved from Pangasinan to
Tarlac, ₱200 → ₱150 with a receiver → proof → replaced, the first file gone →
*Proof submitted* on the row → Record payment applied with the runner's proof
kept; RM-98EEC0B5's existing online switch: confirm, step 2 with ₱152.29 *Pay
now*, then its address moved onto RM-7B67DB3F's paid parcel applied at ₱0 and
showed *Kits Switched to Delivery*), all test data removed and RM-98EEC0B5's
switch restored. **Not exercised:** pressing *Pay now* after an edit (the
open-page close path) and the sweep skipping a proof past its hold, which the
check script covers as a rule only.

Revision 3 and 3b decisions the code cites (the owner's, settled by grilling
on 2026-10-20): **T1** staff pick only how the fee is paid (narrowed by T12);
**T2** the runner may change the address on the link, re-quoted live and
re-checked under the event's locks on confirm (a new tier rewrites `fee`,
`transactionFee` and `totalCharged`; the hold never moves); **T3** confirm,
then pay: editable until payment starts, an edit after *Pay now* closes the
open PayMongo page first, read-only once bank proof is in; **T4** while a
switch waits the link shows the whole street and the receiver's name and
mobile (the link goes only to the order's contact and dies with the hold);
applied, cancelled and expired switches show none of it; **T5** GCash/bank on
the link: the event's accounts and QR codes and the exact amount, then the
screenshot and reference on `LogisticsChange.proofOfPayment` /
`transactionNumber` ("proof submitted" is a waiting bank switch with a proof,
no migration), and nothing applies until staff validate; **T6** proof stops
the clock: the sweep ignores `holdUntil` and waits until the switch deadline;
**T7** the runner may replace the proof until staff record it (the old file is
deleted), and staff get no *Reject*: they message the runner or cancel;
**T8** no staff email, the registrants row shows it, the runner gets a short
*proof received* email; **T9** one *confirm and pay* email for both methods,
with no account list and no "reply with the screenshot"; **T10** the link
offers only the method staff picked, and the checkout route refuses a bank
switch; **T11** no *Keep pickup* button, an unpaid switch lapses on its own;
**T12** *Ship kits* has no address fields: *Send to Runner*, quoted from Runner
1's home address when there is one, otherwise sent with no address and no fee
for the runner to type on the link; **T13** only *Already paid* opens the
address fields, because it switches at once.

**Revision 3b (owner, 2026-10-20): Ship kits is confirm and send.** Trying
RM-1D5EEF1B (runners with no home address on file) opened the whole address
form with *Switch to Delivery* disabled. Now staff type no address: the panel
says where the switch starts from, how the runner pays, and **Send to Runner**;
with no home address it is sent with none (`switchAwaitsAddress`, no fee) and
the runner types it on the link, where the fee is set. Only *Already paid*
opens the address. Record payment, checkout, the proof upload and apply all
refuse a switch with no address. `logistics-change-store.ts`
was split first (`logistics-change-outcome.ts` holds apply and cancel).
Verified on `local-dev`: RM-1D5EEF1B's panel viewed only (its contact is not
the owner, so nothing was sent); RM-7B67DB3F with its home address blanked for
the test: *Send to Runner* → "Waiting for address · to delivery" → the email
listed ₱150/₱200 with *Pay Delivery Fee* → the page opened on empty
fields, refused a proof before an address, showed ₱200 for Lingayen →
confirmed → ₱200 due on the row. The test switch was removed and the address
restored.

**Delivery Payment like validating a payment (owner, 2026-10-20).** The modal
(`OrderSwitchModal.tsx`) now reads like checking a registrant's bank transfer:
once the runner sent GCash or bank proof on the link, the proof shows at once
(a PDF as a card), opens full screen in the registrants' own `ProofLightbox`
(new `src` and `amountLabel` props; the view gained `proofIsPdf`), and
**Validate Payment** sits in the footer and in the viewer
(`useValidateSwitch`: one press, the record-payment route with the runner's
reference, their screenshot kept). Fewer buttons, as the owner chose: *Copy
payment link*, *Email payment link* and the *Record payment* form are gone (the
runner pays on the link in the email; proof sent another way is recorded with
*Already paid* on *Switch to Delivery*); *Send email by hand* shows only when
Resend refused the *confirm and pay* email; *Cancel switch* stays, and once
proof is in its confirm says the runner paid and is not refunded. The
history's *View proof* opens the same viewer. The cramped gap under "Kits ·
Pickup" was Tailwind 4's `space-y` losing to the children's `m-0`; the body
and the cards use flex gaps. The `payment-link` route has no caller left.
Verified on `local-dev` with RM-7B67DB3F-L1 (the owner's test switch, PDF
proof): the modal, the viewer, the by-hand email with the send marked failed,
Cancel's warning (kept), Validate from the viewer (applied, *switched* email to
the owner), then the switch, the order and the audit rows put back as they were.

**BALANCE DUE and FOR VALIDATION for delivery switches (owner, 2026-10-20).**
The Status column's display-only rule (`displayStatus`) now covers a switch:
a PAID order with a switch waiting for its fee reads **BALANCE DUE**, as an
unpaid upgrade did, and one whose runner sent GCash or bank proof reads
**FOR VALIDATION** (blue; not PENDING, which is an entry's own payment) until
staff validate it. That row joins the *Needs Validation* filter and count, and
the bell lists *Delivery fee to validate* (`notification-store.ts`). Category
changes got their proof link the same day (below). Verified on
`local-dev`, data untouched: RM-7B67DB3F (the owner's L2 with proof) reads FOR
VALIDATION and the queue went 6 → 7; RM-98EEC0B5 reads BALANCE DUE; the bell
shows the item.

**A proof link for GCash or bank category changes (owner, 2026-10-20; was
`ON_HOLD.md` §14 and `CATEGORY_CHANGE_PROOF_UPLOAD_PLAN.md`, deleted
2026-10-21).** That plan's staff *Reject* with a reason was not built: as on a
switch (T7), the runner replaces the proof and staff cancel the change. An upgrade paid by GCash or bank used to have no link:
staff emailed how to pay, the runner replied with proof, and staff recorded it,
so it never read FOR VALIDATION. Now its *payment needed* email carries the
change's link (since 2026-10-21 one **Pay ₱X** button for online and GCash/bank
alike, with no accounts or QR codes in the email, as a delivery switch's), and
`/pay/change/[token]` shows the accounts and takes the screenshot and reference
(`ChangeBankProof.tsx` around the switch's `SwitchBankProof`, posted to
`api/category-change/proof`, written by `submitChangeProof` in the new
`category-change-runner.ts` with a `category_change.proof_submitted` row and a
*proof received* email). No schema change: the change's own `proofOfPayment`
and `transactionNumber` carry it, and `changeProofSubmitted` reads them, as
`switchProofSubmitted` does. **Proof stops the clock** (the owner's choice, as
a switch's T6): `changeHeldUntil` drops the hold once the proof is in, so the
page, the sweep (`category-change-expiry.ts`), the seat count (`slot-holds.ts`)
and the apply (`applyCategoryChange`) keep the seat until staff validate or
cancel, or the change deadline closes it; the link of a GCash or bank change
lasts until that deadline. The row reads **FOR VALIDATION**, joins *Needs
Validation* (`proofForValidation`) and the bell (*Category change to
validate*). In the runner's *Category Payment* modal (below), the waiting card shows the
screenshot (`ProofPreview`, shared with the switch's modal), opens it in
`ProofLightbox`, and **Validate Payment** (`useValidateChange`) records the
runner's reference and keeps their screenshot (`recordChangePayment` no longer
blanks a proof when no file is sent). The online checkout now refuses a GCash
or bank change. Verified on `local-dev` on RM-7B67DB3F (a QA upgrade 5K → 1K
PAWMAKER, ₱200): the email's button, the page, *Submit My Proof*, the row, the
trail, the bell, the card's proof, the viewer and Validate (applied, screenshot
kept); then the runner, the change and the proof blob put back (the trail rows
stay). Not exercised in the browser: a hold lapsing with proof in.

**Category changes moved to their own modal (owner, 2026-10-21).** The
*Category Changes* section left *Registrant Details*, which had grown long, for
`CategoryChangesModal.tsx`, opened from the row menu the way a delivery switch's
*Delivery Payment* is: **Category Payment** while an upgrade waits for its
money (`useCategoryChanges.tsx`); while *Category Payment* is offered, *Change
Category* is not, as *Switch to …* goes while a switch waits. It carries the order and runner, the Category line
and the history, and **Validate Payment** in its footer once the runner's proof
is in (the hook moved up from `CategoryChangeHistory`, which the card and the
viewer share). The detail modal keeps only the Category line. Verified on
`local-dev` on RM-7B67DB3F: the menu item, the modal, Validate from the footer
(the modal turned into *Category Changes* at once), the detail modal without
the section; the order put back after. **The same day the two histories
became one** (owner: fewer menu items): the row menu's **History**
(`RegistrantHistoryModal.tsx`, `useRegistrantHistory.tsx`) replaces *Category
Changes* and *Switch History*, with the runner's category changes and the
receipt's pickup / delivery switches as two sections; *Category Payment* and
*Delivery Payment* stay only while a payment waits. Verified on RM-7B67DB3F:
the menu (View Details, Edit Registrant, Change Category, Switch to Delivery,
History, Delete), both sections, and a switch's read-only *View proof*.

**One delivery fee per order (owner, 2026-10-21, final; Strix vuln-0001).**
In the owner's words: "Wala dapat libreng delivery kung different transaction
or reference order. Even same address, kung magkaibang transaction or
reference order, separate ang bayad sa delivery fee. Ang pwede lang
magsabay-sabay sa iisang delivery ay kung group registration yun." A delivery
fee is charged per order (orderRef, receipt); only the runners inside one
order, a group registration, share one parcel, which they already do because a
switch moves a whole order (L2). This **retires L6** (a ₱0 ride on an address
another PAID order already ships to, `ridesOnRegistrationId`), and with it
**L10, R4** (refusing a second receipt to an address whose switch still waits
for payment) and **R5** (a host receipt going back to pickup only after its
riders). Strix scan `run-as-one-scan_4695` (vuln-0001, MEDIUM) showed why:
since Revision 3 the runner types the address on the public link, so anyone
with a switch link could type the street of a stranger's paid delivery (their
own unit and receiver in the landmark) and have the switch applied at ₱0,
learn the stranger's order reference from the email and "Ships with RM-…", and
block the stranger's own switch back to pickup through R5. Fixed at the root:
`quoteLogisticsChange` takes no other order (`existing`, `paidParcels` and the
quote's `ridesOnRegistrationId` are gone) and refuses two orders in one quote
(`MANY_ORDERS`); `readSwitchContext` reads only the switching order (its own
open switch for L13); `logistics-change-parcels.ts` keeps only `refsOf`; the
runner's *Confirm Details* (`confirmSwitchDetails`) can no longer apply a
switch or move an order — every tier the event delivers to is above ₱0, so it
only rewrites the figures, and refuses (409) should a quote ever come back
with nothing to pay; the store refuses a delivery with no fee the same way.
The *Ship kits* panel, *Delivery Payment*, the registrants Logistics cell and
CSV note, the client runner list and its export, and the *switched* email no
longer say "Ships with" or "Also in this parcel". Back to pickup stays free and
refunds nothing (L9), and any receipt may go back on its own. The
`LogisticsChange.ridesOnRegistrationId` column stays (no migration; the
release already carries `20261018120000_logistics_change`) and is never
written; no screen reads it, so the few riding rows on `local-dev` read as a
plain ₱0 switch in the history. `lockSwitch`'s advisory lock stays.

**Staff's payment record pins what it was judged on (2026-10-21, Strix
vuln-0002, LOW).** `recordSwitchPayment` read the switch's `fee` and
`proofOfPayment` before taking `lockSwitch`, and `applyLogisticsChange`
claimed the row on its status alone, so a runner re-quoting the address
(`confirmSwitchDetails`) or replacing the proof (`submitSwitchProof`) on the
link while staff pressed *Record payment* / *Validate Payment* could apply the
switch with `totalCharged` from the old fee (settlement then disagrees with
`fee`) or with a proof staff never saw. The apply now takes an optional
`expected` (`{ fee, proofOfPayment }`) pinned in its claim, as the online
checkout route already pins `fee`; when it moved, staff get a 409 telling
them to reload. Category changes got the same: `applyCategoryChange` takes
`expected` (`{ proofOfPayment }`) from `recordChangePayment`, and
`submitChangeProof` now judges `payable` and reads the proof it replaces under
`lockChange`. The webhook and `settleSwitchOnline` / `settleChangeOnline` pass
nothing and are unchanged.

The decisions in full, as the owner accepted them (L1–L14, before Revision 1;
L6 and L10 were retired on 2026-10-21, above):
**L1** staff only, started by staff like a category change; runner
self-service is out of scope. **L2** a switch moves a whole order (logistics
is an order-level fact); a group ships to one address (the option to ship to
each runner's home was removed on 2026-10-20, at checkout and here). **L3** PAID orders only; a
PENDING bank transfer or an unpaid checkout cannot switch; a complimentary
order can, and pays the fee. **L4** the receipt is never edited: on apply the
order's `logisticsMethod`, `deliveryZone`, `deliveryAddress` and
`deliverySplit` move, its `deliveryFee`, `totalAmount` and other amounts
stay, and the money lives on the `LogisticsChange` row. **L5** staff never type
a fee: it is computed from the address with the checkout's own functions;
with the event's province unknown, staff pick the zone; an address in a zone
the event does not deliver to is refused. **L6** (retired 2026-10-21 for one fee per order, above) shipping was charged
per parcel, not per receipt: an address that already received a PAID delivery
in the event rode on it at ₱0 and recorded the order it rode on. **L7** no Run As One fee in v1:
the delivery fee is the whole price, PayMongo's transaction fee on top when
online; a configurable fee could come later like `categoryChangeFee`
(`ON_HOLD.md`). **L8** the fee is the organizer's, added to what it is owed
like a checkout delivery fee; the transaction fee is PayMongo's. **L9**
delivery → pickup is allowed, at once and at ₱0, with no refund (staff may
refund by hand outside the app). **L10** (retired with L6) a parcel others rode on could not be reversed
alone. **L11** a per-event
deadline, `Event.logisticsChangeUntil`, null meaning 7 days before race day,
00:00 Manila; after it the action is hidden and the routes refuse. **L12** an
awaiting switch waits with an upgrade's windows (`changeHoldUntil`: hours
online, days by bank), never past the deadline, then expires and the order
stays pickup; no seat is held. **L13** one `AWAITING_PAYMENT` switch per
order; a category change on the same order is independent. **L14** out of
scope for v1: runner self-service, switching some runners of a group order,
changing only the address of an order already on delivery, refunds on a
reverse switch, and kit release or shipment tracking.

**Category changes (2026-10-18, on `dev`, not released; `CATEGORY_CHANGE_PLAN.md`
Sessions 1–4, `e7e091f`, `f0907f5`, `9d141f5` — the plan is deleted (it lived
in the git-ignored `docs/plans/`, so it is not in history); every decision is
below and what is open is in `ON_HOLD.md`).** Staff with
`registration:edit` move a runner on a PAID order to another category from the
registrants row menu (*Change Category*). The move is its own `CategoryChange`
row with every figure snapshotted (§4); an upgrade waits for its payment — a
PayMongo link (`/pay/change/[token]`) or a GCash/bank payment staff record,
whichever way the entry was paid —
and holds a seat in the new category while it waits; downgrades are on hold
(below), their refund flow built but not offered;
every step has an audit row and the runner an email. Remittances, the client
payout summary, both runner lists and both exports show the change (§5
`settlement.ts`, §6). Migration `20261018090000_category_change` is the only
one; it is in `ON_HOLD.md`'s release steps. Settlement was verified on
`local-dev`'s QA event `qa-virtual-run-test`: two orders (₱1,500) and nine
moved changes — a lateral move, a NO_REFUND downgrade with and without a ₱50
fee, a REFUND_DIFFERENCE downgrade refunded (₱150) and one still to refund
(₱250, ₱50 fee kept), upgrades paid by QR Ph (test mode and a signed webhook)
and by GCash recorded, one with a ₱50 fee — read collected ₱2,362.19 =
platform and change fees ₱150 + processing ₱12.19 + owed ₱2,200, the same on
`/admin/remittances`, the race's breakdown and the race page's payout summary
(seen as the owner, who reads the client's page; no client viewer was signed
in). Not seen: a real PayMongo webhook delivery for an upgrade (none reaches
localhost) and the real cron route expiring one. Decisions (the plan's D1–D13
and the owner's changes after it):
**D1** a change is its own row; the original order and receipt are never
edited, and settlement adds the change as its own line. **D2** staff-initiated
only; runner self-service is Phase 2 (`ON_HOLD.md`). **D3** the basis (what the
runner paid for the entry) is `promoPrice ?? fromCategory.price` less the
runner's even share of an order-level deduction (`isPricedIn` false); an
order-level discount or a ₱0 order marks the quote *estimated*, and staff may
override the basis with a required reason, logged. **D4** the new category is
charged at its list price, never a running sale, and spends no promo seat.
**D5** the downgrade refund is per event, `NO_REFUND` (default) or
`REFUND_DIFFERENCE`, paid by hand and recorded. **D6** the change fee is per
event, ₱0 default, and Run As One's — counted with platform fees on every
moved change, paid or not (Session 4: on a downgrade it comes out of money the
order line counted as the organizer's, so owed falls by it). **D7** *Kit
changed* with the inclusions that differ, wherever staff and the client see
the category, and in the exports; only when the two kits differ, measured
from the first move to the last. **D8** one formula: `amount = (toPrice −
basis) + changeFee`; above zero waits for payment, at or below zero applies at
once, refunding `−amount` under REFUND_DIFFERENCE and nothing under
NO_REFUND. **D9** PAID orders only. **D10** at most one open
(`AWAITING_PAYMENT`) change per runner. **D11** an awaiting upgrade holds a
seat in its target (`slot-holds.ts`); the runner keeps the old one until it
applies. **D12** a deadline per event, `categoryChangeUntil`; null means
changes close 00:00 Manila on race day (confirmed by the owner); every open
change expires at it; a runner with a race result (matched by name) cannot
move. **D13** the transaction fee on an online upgrade is the runner's, on top,
as at checkout; a bank or outside-GCash payment carries none. **Payment
follows the entry (owner, 2026-10-18):** an upgrade is paid the way the
registration was — online stays online (tracked by PayMongo, no hand check),
bank stays bank; free orders may use any. While it waits, the registrant's
status reads **BALANCE DUE** instead of PAID (display only; the order stays
PAID). The *Runner paid a different amount?* field stays, without its
explanation paragraph. **Downgrades are on hold (owner, same day):**
`DOWNGRADES_ON_HOLD` (`category-change-settings.ts`) — a change whose quote direction is
DOWNGRADE is disabled in the modal and refused by `createCategoryChange`; the
event form hides the refund policy. See `ON_HOLD.md`. **promoPrice:**
applying a change sets `Runner.promoPrice` to null in the same transaction —
the only reader on a paid runner is `releaseRedemption` after staff move the
order PAID → PENDING and cancel it, where a kept snapshot would hand back a
seat in the *new* category's sale; the figure survives as `basis`.

**Virtual runs, Phase A (2026-10-17, on `dev`, not released).** An admin
picks **Virtual Run** at the top of the normal Create Event form and fills a
run window instead of a race day and venue; everything else — categories,
price, logistics (pickup and delivery unchanged), payment, promos, results
upload, certificates — is the same event. New `Event.format` and
`Event.virtualEndDate` (`lib/event-format.ts`, §4, §5). A virtual run is
upcoming and open through the last day of its window and finished after it
(`lib/event-schedule.ts`). Decisions, from `VIRTUAL_RUN_PLAN.md`: **D1**
revise the existing form, no separate flow; **D2** `format` is its own axis,
not a third `eventType`; **D3** one Create Event button, format cards first,
default On-site; **D4** `date` is the window's start, `virtualEndDate` its
end, required when virtual; **D5** logistics unchanged, `LogisticsPanel`
untouched; **D6** venue (saved as *Virtual*), times and pacers hidden; **D7**
format locked once the event has a registration; **D8** Phase A only —
**Phase B** (runner submission of a GPS screenshot and time, an admin
validation queue, approved → `RaceResult`) is **dropped** (the owner,
2026-10-21): the site handles registration for a virtual run and nothing
more, with no runner submissions and no system of its own for a virtual run's
results. The runner-side work built for it on 2026-10-17 was never committed;
its stash, its `VirtualSubmission` table on `local-dev` and
`VIRTUAL_RUN_PHASE_B_PLAN.md` were deleted the same day. Public card, event page and wizard heading show two rows like an on-site
race — calendar icon with *Nov 1–30, 2026*, globe icon with *Virtual · Run
anywhere* (the owner's call, 2026-10-17, after one combined line read badly); confirmation emails say *Run
Window* and *Where* instead of Date and Location. Both registration
wizards' sidebar heading (`WizardEventHeader`, split out of the two wizards
on 2026-10-17) prints the same window line and no venue. The owner then
chose (2026-10-17) that the e-certificate prints the window — *Oct 15–31,
2026 · Virtual* — and that a virtual run calls kit pick-up *Kit Pickup*
(`pickupLabel` in `lib/pickup.ts`: event page, both wizards' pick-up card and
the delivery refusals); on-site events still say *On-site Pickup*.
**Release:** migration `20261017120000_event_format` (additive, defaults
every existing event to on-site) must run before the code ships; the local
dev server must be restarted after it, because a running one keeps the old
Prisma client and `/events` errors on the new `where`. Checked on `local-dev`
2026-10-17 in the browser: a virtual run created from Create Event (window
Oct 15–31) saved as a draft with location *Virtual* and no times, showed
*Virtual* and *Oct 15–31, 2026* on the events table with no *Pacers* item,
and once published listed on `/events` and its page as open although its
first day had passed; shortening the window to end yesterday took it off
`/events` and its page said the run had ended. A format change on an event
with registrations answered 400 and the edit form showed the lock; on-site
Create still asks for date, venue and times. The test event,
`qa-virtual-run-test`, is still on `local-dev`, its window now Oct 15–31
so its register page opens; both wizards were checked on it (the bank-transfer
one by switching its form for the check and back), and the on-site
`32km-beyond-21` and `run-and-reachout-2026` headings still show one day. Its
event page reads *Kit Pickup Available*, `32km-beyond-21` still *On-site
Pickup Available*; the two certificates were rendered with
`buildCertificatePdf` and read back. The wizards' step-2 pick-up card was
checked through `pickupLabel` only, not by filling step 1 in the browser.

**Event publishing: draft, publish and scheduled publish (2026-10-17, on
`dev`, not released).** Creating an event no longer puts it on the site: it
starts as a **draft** unless the create form's new Publishing panel says
*Publish Now* or schedules it. One column, `Event.publishAt`
(`lib/event-visibility.ts`, §5). A scheduled event goes live by itself — the
public reads compare against the clock, there is no cron. The events table
gains *Draft* / *Scheduled · Goes live …* badges and a **Publish Event** row item with its
modal; staff can preview an unpublished event page, nobody can register for
one. Decisions, from `EVENT_PUBLISH_PLAN.md`: **D1** one nullable instant for
all three states; **D2** read-time, not cron; **D3** the migration stamps
every existing event published at its `createdAt`; **D4** a draft still needs
every field a published event needs — Publish only changes visibility; **D5**
back to draft only while the event has no registration (409 otherwise);
**D6** a results-only race is published on creation; **D7** client viewers do
not see drafts; **D8** a publish time after a still-future `registrationOpensAt`
is refused on create, the publish route, the edit PUT and the opening PATCH
(an opening already past never conflicts: sign-ups start on publish), and
checkout re-reads `publishAt` under its event lock so an order and a
back-to-draft cannot both land; **D9** staff preview on the event page
only. Both event forms now end with one **Publishing & Sign-ups** panel asking
the two "when" questions in order, with a plain sentence of what runners will
see (§6); Registration Opening left *Registration & Fees* — kept, not removed,
because it is the only way to list a race as a teaser before sign-ups open.
**Not done:** the edit form only shows the publish state (changing it is the
row menu's job). **Release:**
migration `20261017090000_event_publish_at` must run before the code ships.
`migrate deploy` runs its backfill once, so an event the old code creates
between the migration and the deploy going Ready stays a hidden draft. Create
no events in that window, or right after Ready run
`UPDATE "Event" SET "publishAt" = "createdAt" WHERE "publishAt" IS NULL AND "createdAt" < '<Ready time, UTC>'`
on production (`npx prisma db execute --stdin`); the bound keeps real drafts
made by the new code as drafts. Checked on `local-dev`
2026-10-17 in the browser: a draft is the same 404 as a missing slug on its
page and `/register`, absent from `/events`, refused by checkout (*Event not
found*) and by promo lookup; staff see the preview line; a publish scheduled
90 seconds ahead appeared on `/events` by itself; back-to-draft on a race with
registrants answered 409; every change is on Activity. **Client viewer hiding
(D7) was not exercised** — no viewer session was signed in.

**Move to Results switch removed (2026-10-15, on `dev`, not released).** The
owner's call, so staff follow one flow: a race is Events or Results from the
form that created it (`/admin/events/new` or `/admin/results/new`) and never
moves. The edit form lost `ResultsOnlyPanel`, and the event PUT ignores
`resultsOnly` in the body and keeps the stored value (the D3 registration
guard went with it, since nothing can flip the column now). A race made in
the wrong place is recreated in the right one. Production still has the
switch until this is promoted, so the 3 existing races must be moved there
first (`ON_HOLD.md`). No migration.

**Combinable promotions (2026-10-15, on `dev`, not released; migration
`20261015090000_combinable_promos`, applied to `local-dev`).** The marketing
form has a **Combine with other promotions** switch (`AdminSwitch`, `PromoCode.combinable`,
off by default; the table and cards say "Combines with other promotions").
When a price promotion (`CATEGORY_PRICE`, `PERCENTAGE`, `FIXED`) and a
`BUY_X_GET_Y` deal are **both** ticked and both qualify, one order gets both:
the early bird prices every runner, then the deal frees the cheapest at their
sale price — six on a ₱1,200 10K with a ₱900 early bird and "5+1 FREE" pay
5 × ₱900 (owner's example, Run and Reachout 2026). Only that pairing exists
(owner's call); two price promotions still never stack. Rules in
`promo-winner.ts` (§5); stored as `Registration.combinedPromoCode` /
`combinedDiscountAmount` beside `promoCode`, with `discountAmount` still the
whole discount. Both wizards print a line per promotion; the receipt email
prints the deal as its own `Discount (…)` row; expiry, cancel and failed
checkouts hand both redemptions back; each promotion's *Given* counts its own
share. **Verified** by `scripts/check-combined-promos.ts` (31 checks), the
typecheck, `resolveDiscount` against `local-dev` (₱2,249 off six 10K runners:
₱900 early bird + ₱1,349 free runner) and the bank-transfer wizard on
`local-dev` `run-and-reachout-2026` (five runners: early bird only, ₱6,945;
six: both lines, "Free: Runner 6", ₱6,985; Add Another Runner stops at six).
There, 🐦 EARLY BIRD RATES EXTENDED and 5+1 FREE are left combinable. The
marketing table's "Combines with other promotions" line and the form's switch
were seen on `local-dev` (toggled, not saved; `promoTermsFromInput` was checked
by script). **Not walked**: saving a promotion with it, a placed order, and the
receipt email.

**Client subdomains, Batch 4 and the site icon (2026-10-14, on `dev`, not
released; `CLIENT_SUBDOMAIN_PLAN.md`, deleted 2026-10-14, all five batches
landed).** Pre-deploy QA passed on 2026-10-13: build, a review of
`origin/main..dev`, and the plan's whole checklist on `local-dev` (root
redirect; filtering on both lists, results-only races on `/results` only;
cross-host moves on every event and result page, `[bib]` included, query
kept; main cards opening on the subdomain; `/admin`, login, reset, invite,
two-factor and forgot-password sent to the main host; unknown labels to main;
a forged `x-rao-site` ignored; no horizontal scroll at 375px). **A no-client
event moving to main was never walked**: every `local-dev` event has a
client (`ON_HOLD.md` §13). The review's fixes: in production a new subdomain
is refused on save until `https://<label>.runasone.ph/` answers with the
proxy's 307 (so a subdomain saved before its DNS cannot take a client's races
offline); an unknown or archived label keeps its path and query on the way to
main; `/pay/[token]` calls `ensureEventHost`, so it wears its own order's
branding. **Site icon** (owner, 2026-10-14, after the logo stretched as a
favicon): migration `20261014014104_client_site_icon` adds
`Client.faviconUrl`, a square upload (Site & branding refuses a non-square
picture before uploading) used as a client site's tab and Apple icon; null
keeps Run As One's mark, and the logo is never used. To make that possible
`icon.svg`, `favicon.ico` and `apple-icon.png` moved from `app/` to `public/`
and are declared by the root layout's `generateMetadata` (§9). CRC's site
icon is the "CRC" letters cropped from its own logo. The Hero Image field
spans the panel's full width. Release and DNS steps: `ON_HOLD.md`, top.

The plan's decisions (owner, 2026-10-06), which code and docs cite by number:

| # | Decision |
| --- | --- |
| D1 | No home page of its own: a subdomain's `/` redirects to its `/events`, filtered to the client. |
| D2 | Same navbar (Events, Results); the logo is the client's and links to `/events`. |
| D3 | Registration and payment stay on the subdomain: register, pay, confirmation. |
| D4 | A client event opened on `runasone.ph` goes to the client's subdomain; a no-client event stays on main. |
| D5 | Results likewise: the subdomain's `/results` lists only the client's; a client's `runasone.ph/results/[slug]` redirects to its subdomain; main `/results` lists everything. |
| D6 | Wrong host goes where it belongs: another client's event to that client, a no-client event to main, `/admin/**` to main, an unknown or archived subdomain to main. `/privacy`, `/terms`, `/feedback` and `/pay/[token]` work on a subdomain. |
| D7 | Branding is edited by staff only (`platform:manage`) on `/admin/clients`. |
| D8 | Phase 1 branding: logo, a square site icon (added 2026-10-14), footer contacts and socials, and a hero (image, headline, tagline) on the subdomain's `/events`; `/results` gets a plain heading. |
| D9 | Subdomain footer: client logo, name, email/phone, socials; Run As One stays the contact for payment concerns; Privacy/Terms and "Powered by Run As One"; no Organizers column. |
| D10 | A client event's email links point to the client's subdomain; sender and design stay Run As One's. |
| D11 | `runasone.ph` DNS is at an outside registrar: no wildcard, each subdomain added by hand. |

How it works (the plan's §2) is in §6 "Hosts", §7 (security: the host is a
lens, never a permission) and the `site-host.ts` / `site-client.ts` rows of §5.

**Client subdomains, Batch 3 (2026-10-13, on `dev`, not released;
`CLIENT_SUBDOMAIN_PLAN.md`), payment and links on the event's site.**
`api/checkout`'s return URLs, `api/pay/[token]`'s success and cancel URLs and
the staff payment link (`issuePaymentLink`, now given the request URL rather
than an origin) are built on `eventOrigin(event, request.url)`, so a client's
runner pays and comes back on the client's subdomain. The payment-link email
is the only registration email with a link. Checked: `eventOrigin` for main,
client, other-client, no-client, archived, preview and production hosts; and
on `local-dev` (owner's go-ahead): a bank transfer on `crc` and a PayMongo
test order on `racecore` both returned to their subdomain with the
`orderRef`, PayMongo's cancel came back there too, the staff link and the
email's *Finish Payment* asked for on `localhost` pointed at `racecore`, and
that link opened on `crc` still opened a page returning to `racecore`.
Batch 4: the entry above.

**Client subdomains, Batch 2 (2026-10-13, on `dev`, not released;
`CLIENT_SUBDOMAIN_PLAN.md`), the subdomain site.** A client's subdomain now
wears its branding and lists only its races (§6, "Hosts"): the root layout
reads `getSiteClient()` and passes it to `Navbar` (client logo → `/events`)
and `Footer`, which renders `ClientSiteFooter.tsx` there (D9); `Footer` was
split into `FooterParts.tsx` first. `/events` filters by client under
`ClientSiteHero.tsx` (D8); `/results` filters by client, results-only races
included. The five event and result pages call `ensureEventHost` and set
`alternates.canonical` on the event's own site; main-site cards link client
races straight to their subdomain. Layout metadata is host-aware (client
name in the title, `metadataBase` on the client's origin). On `local-dev`,
CRC is `crc` and RaceCore `racecore`. Next: Batch 3 (checkout return URLs,
pay links and emails on `eventOrigin`).

**Client subdomains, Batch 1 (2026-10-13, on `dev`, not released;
`CLIENT_SUBDOMAIN_PLAN.md`), data and plumbing, no public change.**
Migration `20261013090000_client_site_branding` adds `Client.subdomain`
(unique) and the site's branding columns (§4) — **production needs it before
this ships**. New modules `site-host.ts` (which host is which, the subdomain
rule, `eventOrigin`), `site-client.ts` (`getSiteClient`, `ensureEventHost`,
not yet called by any page) and `client-branding.ts` (§5). `src/proxy.ts` now
runs on every page: it forwards `x-rao-site` / `x-rao-url` (stripping the
browser's), sends a subdomain's `/` to `/events` and its `/admin/**` to the
main host before the session check; the admin check itself is unchanged (§7).
`/admin/clients`' panel gained **Site & branding** (subdomain with the live
link and the DNS note, logo and hero uploads through `/api/upload`
`folder: clients`, headline, tagline, public email / phone, socials), saved by
`PATCH /api/admin/clients/[id]` `{ branding }` and audit-logged as
`client.branding.changed`. `ClientsClient.tsx` gave its invite / reset /
archive handlers to `useClientActions.ts` first. Next: Batch 2, the
subdomain site itself.

**Service inquiry, Batch 4 (2026-10-13, on `dev`, not released;
`SERVICE_INQUIRY_PLAN.md`), the staff side.** `clients/ApplicationPanel.tsx`
was split first with no behavior change (`application-rows.ts`,
`useApplicationDialog.ts`, `SignInsSection.tsx`, `ApplicationAnswers.tsx`,
`ApplicationSection.tsx`), and `ClientsClient.tsx` gave its moves to
`client-actions.tsx`. **The services read in their groups**, an Online line
and a Race day line (`servicesByGroup`, §5). The panel's footer says **No
sign-in needed** beside Send invite when the application did not choose
Online Registration (`signInComing`, the thank-you panel's rule; Send invite
still works), and offers **Add Results** for a Results application, opening
`/admin/results/new?client=<id>` on Results only with the client linked and
its first event's name, location and (if today or past, R6) date filled in.
The page honours `?client=` only for `platform:manage` and a live client;
otherwise it opens as before. Verified on `local-dev` with the owner signed
in, including 375px; the refusal for an actor without `platform:manage` was
not exercised (no such account there), nor was Save. Test row
`batch4-results@example.test` left in `local-dev`. With this, every batch of
the plan has landed.

**Service inquiry, Batch 3 (2026-10-13, on `dev`, not released;
`SERVICE_INQUIRY_PLAN.md`).** The form is titled **"Inquire About Our
Services"** (heading and metadata title: `register/page.tsx` is now a server
half over `RegisterClient.tsx`), and the Footer and sign-in links read **"Our
Services"**; the URL is unchanged. The subtitle, step blurbs, services
question, event label, consent line and two refusal messages read as an
inquiry for any service, with no price or date promised. **The thank-you panel
follows the services** (`signInComing` in `lib/organizer-application.ts`):
with Online Registration its third step is the sign-in, described as a view
of the race's registrations and results that our team runs; without it, "No
sign-in needed". **A duplicate address** is refused under Email with
`ALREADY_APPLIED_MESSAGE` (route and form share it) and the form draws
`ReachUs.tsx` under it: the saved contact email and any saved social links.
**`POST /api/auth/register` is throttled**: `APPLICATION_RULE`, 5 every 10
minutes per address, 429 with a plain `error` the form shows in its banner.
Checked on `local-dev` (by hand through the form): a registration
application's panel and a results-and-timing one's; the duplicate refusal
returning to step 2 with the email link (no social links are saved on
`local-dev`, so that branch was not seen rendered); the new labels in the
Footer and on login; a burst of posts refused on the sixth with the banner
shown, after hand submissions went through; the form at 375px with no
horizontal scroll (the thank-you panel was not re-checked at 375px, since the
throttle was then closed). Build clean; lint adds nothing. Test rows
`batch3-registration@example.test` and `batch3-timing@example.test` were left
in `local-dev`. No migration. `/admin/clients` does not read `signInComing`
yet: that is Batch 4.

**Service inquiry, Batch 2 (2026-10-13, on `dev`, not released;
`SERVICE_INQUIRY_PLAN.md`).** The services question offers every service Run
As One sells, in three groups. **Online**: Online Registration (`REGISTRATION`,
relabelled from "Registration System") and Results and E-Certificates.
**Race day**, fulfilled through suppliers: Race Timing, Race Bib Production,
Race Kit Fulfilment (`TIMING`, `BIB_PRODUCTION`, `KIT_FULFILLMENT`). Not Sure
Yet still clears the others. **Coming soon**: Custom Website, Kit Claiming
System, Email Blast, Chip Check (`COMING_SOON_SERVICES`; Chip Check is a scan
station where runners see their details from their bib chip, moved here by the
owner until it is offered),
shown greyed with a tag and not tickable; `servicesOf` drops them like any
unknown code, so the route never stores one. Old codes are unchanged, so
stored applications read as before. The page title, subtitle, step blurb and
thank-you panel were left to Batch 3 (above). **Custom Website** (`WEBSITE`)
went on offer on 2026-10-14 by the owner's call: it moved out of
`COMING_SOON_SERVICES` into `ORGANIZER_SERVICES` under **Online**, after
Results, so it is now tickable and stored.
Checked on `local-dev`: Timing + Bibs (by hand and posted) stored as those two
codes, Not Sure Yet plus others stored as `NOT_SURE`, Coming soon and unknown
codes dropped (Coming soon alone is refused as "choose at least one"), 375px
with no horizontal scroll. `/admin/clients` was not opened (no staff sign-in
in the browser); its `organizerServiceLabel` was checked directly. Test rows
`batch2-*@example.test` were left in `local-dev`. No migration.

**Service inquiry, Batch 1 (2026-10-13, on `dev`, not released;
`SERVICE_INQUIRY_PLAN.md`).** A split with no behavior change, so Batches 2–4
land in small files. `/admin/register` is now a frame (`page.tsx`) over
`apply-steps.ts` (the steps, their fields, the form's shape),
`useApplicationForm.ts` (the per-step checks and the post), one component per
step (`OrganizationStep`, `ContactStep`, `EventStep`), `ServicesQuestion` and
`ThankYouPanel`. The four vocabularies, their copy, `servicesOf` and the label
helpers moved from `lib/organizer-application.ts` to
`lib/organizer-vocabulary.ts`; the limits and `readOrganizerApplication` stayed.
Checked on `local-dev`: the same application sent before and after the split
gave the same request body and the same `Client` row, and each step's markup
was unchanged. No migration.

**Checkout return URLs (2026-10-13, on `dev`, not released;
`CLIENT_SUBDOMAIN_PLAN.md` Batch 0).** `POST /api/checkout` builds PayMongo's
success and cancel URLs itself, from the request origin and the event's slug,
and ignores any `successUrl`/`cancelUrl` in the body. Before, a free order
returned the posted `successUrl` as its `checkout_url`: an open redirect (§7).
No migration.

**Login convenience, Batch 1 (2026-10-11, on `dev`, not released;
`LOGIN_UX_PLAN.md`).** The sign-in page has a reveal button (the shared
`admin/PasswordField.tsx`), password-manager autocomplete, the new wording
("Sign in", for staff and client organizations), and returns to the page that
sent the person there (`?next=`, `lib/next-path.ts`); a signed-in person who
opens it goes on to the dashboard. `/api/auth/login` is throttled per address
and per email and answers in even time (§7). No migration.

**Login convenience, Batch 2 — forgot password (2026-10-11, on `dev`, not
released; `LOGIN_UX_PLAN.md`).** *Forgot password?* on the sign-in page leads
to `/admin/forgot-password`; the owner, staff and client viewers get a link
(60 minutes, once) at `/admin/reset-password/[token]`, choose a new password,
every session ends, and they sign in again under a "Password updated" banner;
a "password changed" email follows. Every address gets the same answer
(§7). Migration `20261011083751_password_reset` (one small table), applied to
`local-dev` only.

**Login convenience, Batch 3 — Google sign-in (2026-10-11, on `dev`, not
released; `LOGIN_UX_PLAN.md`).** *Continue with Google* on the sign-in page
signs in staff and client viewers whose account already exists, linking the
Google account on first use (`StaffAccount.googleSub`); the owner keeps
password-only sign-in (D5). Settings › Security shows the link and *Unlink
Google*. Both doors share `lib/sign-in.ts`. **The owner asked for this on
2026-10-11**, reversing the "no SSO" call of `STAFF_ACCESS_PLAN.md`. The
button stays hidden until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
set (they are, in the local `.env`, as of 2026-10-12); the round trip through
Google was checked on localhost with a real client viewer's Gmail.
Migration `20261011120000_staff_google_sub` (one nullable column), applied to
`local-dev` only.

**Login convenience, Batch 4 — "Keep me signed in" (2026-10-12, on `dev`, not
released; `LOGIN_UX_PLAN.md`).** An opt-in box on the sign-in page makes the
session 30 days instead of one, for the password form and the Google button
alike; a profile edit or password change keeps the length chosen. Revocation
is unchanged, since `getActor()` checks every request (§7). Built before 2FA
by the owner's call. No migration.

**Two-step sign-in, all 4 batches (2026-10-12, on `dev`, not released;
`TWO_FACTOR_PLAN.md`).** Batch 1 laid the ground: migration
`20261012025827_two_factor` (applied to `local-dev` only), `secret-box.ts`,
`totp.ts`, `two-factor.ts`, `qrcode`. Batch 2: Settings › Security has a
**Two-step Sign-in** panel for everyone — turn on with an authenticator app
(QR or typed key, then a code), ten recovery codes shown once, new recovery
codes, and turn off with password and code (which emails the person). Turning
it on or off signs out every other device. Batch 3: **sign-in asks for the
code** — after the password and after Google (D2), on `/admin/two-factor`,
with a recovery code as the fallback; the account is checked again when the
code arrives, five wrong codes send the person back to sign in, and the
sign-in row records `twoFactor`. Batch 4: an owner or admin **resets
someone's two-step sign-in** for a lost phone — a team member from the Team
page's row menu, a client viewer from the client's Sign-ins — which signs the
person out everywhere and emails them; a *Two-step on* chip shows who has it.
Nobody resets the owner's in the app (runbook in `ON_HOLD.md` §2). Making it
required (D7) stays on hold. Needs `TOTP_ENCRYPTION_KEY` in Vercel (Production + Preview); without it
the panel stays hidden.

**Bank transfers expire, failed orders keep no slip (2026-10-13, on `dev`, not
released; owner's rulings on Strix vuln-0003 of run a8b3 and vuln-0001 of run
fca9).** An unverified bank transfer now stops holding its slot after
`BANK_TRANSFER_EXPIRY_DAYS` (7) — before, a script could fill a capped race
with junk slips through `/api/checkout/manual` for good. It stays on the
registrants screen as `EXPIRED`, with no email to anyone; the detail modal
gives a pending transfer's *verify by* date, and **Validate Payment is still
offered on an expired transfer**, taking a slot back only if the race has room
(the status route now runs `reserveSlots` on any move into PAID or PENDING
from a status that holds no slot — `EXPIRED`, `CANCELLED` or `REFUNDED`, online
orders included; Strix vuln-0001 of run 9cda found CANCELLED/REFUNDED → PAID
skipping the count). The promo is not spent again on such a reinstate. And a slip
whose order then fails to save (slots ran out, promo used up, results only, a
database error) is **deleted on a Vercel deployment and kept, logged, on a
developer's machine**, because the private store is production's. No
migration.

**`LOGIN_UX_PLAN.md` and `TWO_FACTOR_PLAN.md` are deleted** (2026-10-12, every
batch landed). Both were gitignored and never committed, so neither can be
read back from git. What they left undone is in `ON_HOLD.md` §2 and §12. The
code and the other guide files still cite their decisions by number; this is
what each number settled:

- **`LOGIN_UX_PLAN.md`.** D1: the page reads "Sign in", for staff and client
  organizations, with the apply link in its footer. D2: a reset link lasts 60
  minutes, works once, and a newer request kills older ones. D3: a reset
  signs nobody in; the person signs in again under a banner. D4: an invited
  account that never chose a password gets no link and the same answer as
  everyone. D5: **no Google sign-in for the owner**, so `Organizer` has no
  `googleSub`. D6: Google on the invite page was left out (on hold). D7: Google
  can be unlinked from Settings › Security, with the password. D8: "Keep me
  signed in" is opt-in and lasts 30 days; the default stays one day.
- **`TWO_FACTOR_PLAN.md`.** D1: optional, per account, for everyone. D2: both
  doors (password and Google) ask the code. D3: ten one-use `xxxx-xxxx`
  recovery codes, stored as bcrypt hashes, shown once. D4: owners and admins
  (`team:manage`) reset a member's or a client viewer's; **nobody resets the
  owner's in the app** (the runbook is in `ON_HOLD.md` §2). D5: no "remember
  this device". D6: turning it off needs the password and a code. D7: making it
  required waits a race season (on hold). D8: the `qrcode` package for the QR,
  the TOTP maths on Node's `crypto`. D9: turning it on or off ends every other
  session. D10: an email only when it is turned off or reset by an admin. D11:
  the screens say "Two-step sign-in", never "2FA".

**`SERVICE_INQUIRY_PLAN.md` is deleted** (2026-10-13, all four batches
landed, entries above). It was gitignored and never committed. Nothing was
left undone, so nothing went to `ON_HOLD.md`. The code and guide cite it by
batch and by number; this is what each number settled:

- **S1.** The services offered, modelled on myrunti.me/services plus what the
  app does. **Online:** Online Registration (`REGISTRATION`), Results and
  E-Certificates (`RESULTS`). **Race day:** Race Timing (`TIMING`), Race Bib
  Production (`BIB_PRODUCTION`), Race Kit Fulfilment (`KIT_FULFILLMENT`).
  **Coming soon:** Custom Website (`WEBSITE`), Kit Claiming System
  (`KIT_CLAIMING`), Email Blast (`EMAIL_BLAST`). **Not Sure Yet**
  (`NOT_SURE`) clears the others. Existing codes kept their values, so stored
  applications read the same; `Client.services` is a `String[]`, so no
  migration. **Chip Check** (`CHIP_CHECK`) was first offered under Race day
  and moved to Coming soon after Batch 2 by the owner's call: it is a scan
  station (a runner scans their bib chip and their details show on a screen,
  a photo moment and a check that each bib went to the right runner), not a
  U-turn mat, and it does not depend on Race Timing. **Custom Website**
  (`WEBSITE`) went the other way on 2026-10-14, by the owner's call: out of
  Coming soon and on offer under Online, after Results.
- **S2.** Race-day services are fulfilled through suppliers, so the form is an
  inquiry, not an order: it promises a reply, never a price or a date.
- **S3.** One application per email stays. The refusal sends the applicant to
  Run As One's contact email and social links from the settings, never a
  hard-coded address.
- **S4.** The same three steps (Organization → Contact → Your event); only the
  services question and the copy changed.
- **S5.** No sign-in for a client who did not choose Online Registration. The
  thank-you panel says so, and `/admin/clients` shows *No sign-in needed*
  beside Send invite. **Send invite stays available and keeps its primary
  tone** (the owner confirmed this after Batch 4, rather than hiding or
  demoting it), because a client may later want registration.
- **O1.** A Coming soon service cannot be ticked: greyed, with a "Coming soon"
  tag.
- **O2.** The form is titled **"Inquire About Our Services"**; the Footer and
  sign-in links read **"Our Services"**; the URL stays `/admin/register`.
  "Work with Run As One" was rejected because a client **hires** Run As One and
  only views its dashboard (*Client Viewer*), so every line reads as an
  inquiry for a service, never a partnership or a self-serve tool.
- **Batch 4's link is named "Add Results"**, after the page it opens, not the
  plan's "Create Results".

**Results row actions, all 5 batches (2026-10-11, on `dev`, not released;
`RESULTS_ROW_ACTIONS_PLAN.md`).** Batch 1 (`9d842c3`) split the workspace's
results table and moved the ranking into `results-ranking.ts`. **Batch 2
(`01d2b1e`): pacer tags.** On a
results-only race, staff with `results:manage` mark a finisher as a pacer from
their row (*Mark as pacer*, optional pace group), change the group, or remove
the tag; a tag is a `ResultPacer` keyed by bib (migration
`20261011062955_result_pacer`, applied to `local-dev` only), so it holds
through a re-upload, and every page that prints a rank follows through
`pacerLookupForEvent`. A pacer from a code reads *Pacer · from Events* with no
tag item. Pacer setup under Events is unchanged. **Batch 3 (uncommitted):
*Edit details*.** Every runner's row, on any race under Results, opens a form
for name, bib, gender, category, status and chip / gun time
(`PATCH results/[resultId]`); the whole race is re-ranked in the same
transaction, a tag follows a changed bib, and the row is marked `editedAt`
(migration `20261011064837_result_edited_at`, `local-dev` only), wears
*Edited*, and is counted in the re-upload's warning. **Status (owner's Q1):**
a DNF, DNS or DQ row keeps its row and time, reads "-", and the finishers
behind move up (`rankResults` now counts finishers only); its public page
shows the status instead of FINISHER and has no certificate. **Batch 4
(uncommitted): *Add runner*.** Beside *Upload results*, staff with
`results:manage` add one finisher the sheet left out (`POST results`), with
the same form and checks as *Edit details*; the race is re-ranked, and the row
is stamped `editedAt` (equal to its `createdAt`), so it wears *Added*
(*Edited* once corrected) and the re-upload warns it will be replaced. No migration. **Batch 5 (uncommitted): delete.** Every row's menu
ends with *Delete result*, and the table's checkboxes delete in bulk (*Delete
Selected* from `lg` up, the bulk bar below), through `DELETE results`; asks
first, removes any pacer tag on those bibs, re-ranks the race, and names each
runner on the trail. No migration.

**Results menu, all 4 batches (2026-10-09, on `dev`, not released).** The
sidebar has **Results** under Races, and `/admin/results` lists every
results-only event and every normal event with results, with a *Registered
here* / *Results only* badge, finishers, certificate (Custom/Default) and
client; its row menu opens the results, the public page, the edit form, and
deletes a results-only race. **Batch 2:** one race's results live at
`/admin/results/[id]` (the old `/admin/events/[id]/results` 308-redirects; the
upload API stayed). With no results it is a three-step create layout —
read-only Details, Upload, E-Certificate — and with results it is Details, the
table and re-upload, and E-Certificate. **The certificate has one home**: it
is saved from the workspace through the new `PUT
/api/admin/events/[id]/certificate` (`event:edit`), the edit form shows a
line linking there and no longer sends the certificate fields, and the full
event PUT now keeps them when they are absent. Manage Results on the Events
row menu opens the workspace either way. **Batch 3:** *Add Results*
(`event:create`) opens `/admin/results/new`, which asks first whether the race
is already in the system, then shows the whole job on one page — 1. pick a
finished race without results, or fill a results-only race's short form;
2. its results file and 3. its e-certificate, both optional — saved by one
Save that names what it will save, then opens the race's workspace. The
Events table no longer lists results-only events, the create form lost its
Results only switch, and the edit form's switch now reads **Move to Results**
/ **Move back to Events** (still locked once anyone registered) and lands the
save where the race now lives — which is how the owner moves the 3 existing
races over after release (R5; the step is in `ON_HOLD.md`'s release steps).
**Batch 4:** the Events table's results-only row code went (`isResultsOnlyRow`
and its branches in the row menu, the Registrants cell and the card), since no
such row reaches it; the `EXTERNAL` state and its badge stay for the server
gates. `CertificateSettingsPanel` moved to `admin/results/[id]/`, beside its
only users. No behavior change, and no migration for the whole plan.

**Results-only events, all 6 batches (2026-10-08, on `dev`, not released).**
Batch 6: on a results-only event the uploader's Target Category offers
*Create category from sheet name* (distance guessed from the name or typed),
and the upload route creates those categories in the same transaction as the
results, refusing it on any other event; so the flow is create the event
(title, date, poster), upload the Excel, done. The route now also refuses a
row pointing at another event's category. Batch 5 split
`ResultsUploaderClient.tsx` (573 lines → modal, `results-sheet.ts`,
`SheetMappingPanel`, `TargetCategoryPicker`) with no behavior change.
Batch 4 split `EventsTableClient.tsx` (972 lines → table, `event-columns`,
`EventRowCells`, `DeleteEventModal`, `useEventRowActions`) and gave a
results-only row a menu of only Manage Results, Edit Event and Delete, a muted
"—" for Registrants and no Registrants chip on its card (removed again by
`RESULTS_NAV_PLAN.md` Batch 4, once those rows left the table). Batch 3 put a *Results only* switch at the top of the create and edit forms
(`ResultsOnlyPanel`): on, they keep only client, title, date, location,
province, an optional cover and each category's name and distance, and hide
every panel about selling an entry; on edit it is disabled once the event has
registrations. `/results` cards already fell back to a default image for an
empty cover (`EventImage`). With Batch 3 in, `dev` may be promoted; after
release, run the migration and turn the switch on for the 3 existing
results-only events (the plan's owner steps). Batch 2 split the two event forms with no
behavior change: both now build on shared panels in `admin/events/`
(`BasicInfoPanel`, `RegistrationFeesPanel`, `EventFormResultModals`,
`useEventImageUpload`, the `EventFormDraft` type in `event-form-draft.ts`),
and the edit form's API-to-draft mapping is `[id]/edit/event-edit-draft.ts`.
Batch 1: `Event.resultsOnly` (migration
`event_results_only`) marks a race whose client runs registration elsewhere:
`registrationState` answers `EXTERNAL` (badge *Results only*), both checkout
routes refuse it (400), `/` and `/events` leave it out, `/events/[slug]` is a
404 until results exist and then redirects to `/results/[slug]`, `/register`
renders no wizard, and `/admin/remittances` and client summaries skip it. The
admin API accepts the flag (PUT refuses to flip it once anyone has
registered). The working plan is `docs/plans/RESULTS_ONLY_EVENT_PLAN.md`.

**What is still open lives in `ON_HOLD.md`** at the repo root: the clean-up of
the retired test accounts and the features
the owner put on hold. Every `*_PLAN.md` cited below is finished and was deleted
on 2026-10-01 (read one with `git show 3126357:docs/archive/<NAME>_PLAN.md`). Where an entry below says "Read the plan's
Status table" or describes a batch as still to come, `ON_HOLD.md` has the
current answer.

**Every runner gives a home address on Step 1** (2026-10-01,
`RUNNER_ADDRESS_PLAN.md`, all three batches **live on production** since
2026-10-01, `main` at `e64266e`, both migrations applied): four parts per
runner in both wizards, Runner 2 onward defaulting to "Same address as Runner
1", validated and stored on each `Runner` row by both checkout routes (§5
`runner-address.ts`; migration `runner_home_address`). **Batch 2**: Step 2 delivers to Runner 1's home address with
*Change*, and a group whose addresses differ may ship each kit to its runner's
own address at one fee per distinct address (§5 `delivery-split.ts`); both
wizards' delivery state moved into `useDeliveryPlan.ts` / `DeliveryStep.tsx`.
Migration `delivery_split` (`Registration.deliverySplit`). **Batch 3**: the registrants screen shows the address (Province
column and filter, detail modal), staff edit it in the edit modal (now
`RunnerEditModal.tsx`), the CSV exports *Home Address* and *Province*, and a
split order shows each runner's own parcel and the order's parcel list (§6). No
migration. The plan's "manual entry at `/admin/register`" was not built: that
route is the organizer application, and no screen adds a runner by hand.

**A client viewer has a page per race** (2026-10-07, on `dev`, not released,
`CLIENT_RACE_PAGE_PLAN.md` — Batches 1–4): `/admin/your-events/[id]`,
opened by pressing its Overview card (**View race details and report →**) — slots per category
with *Almost full* / *Full*, registrations over time (a bar per day, per week
past 62 days, with the last 7 days and the busiest day), shirt sizes per
category, and race kits by pickup or delivery, plus **Save as PDF** of the
whole page (2026-10-08). Counts only (§5 `client-race-report.ts`); no
migration. The print portal is now shared: `admin/PrintableCopy.tsx` and
`admin/print-copy.css` serve both this page and the e-certificate guide.
**Batch 3 (2026-10-08)**: a **Payout Summary** at the foot of the page, screen
only — collected, Run As One fees, payment processing fees, paid out, still
owed, and the payouts as
day, method and amount — behind a new viewer permission `event:view-payout`
(§5 `client-payout.ts`, §7); no migration. Seen as Super Admin on local data
with no payouts recorded, so the list's rows and the *Overpaid* wording have
not been seen on screen. **Batch 4 (2026-10-08)**: a **Runners** list after
the payouts, screen only, for releasing and shipping kits — name, ref,
category, shirt size, *Paid* / *Awaiting verification*, pickup or delivery,
phone, email, home and ship-to address (no birthdate, emergency contact or
medical notes) — with search, Filters, mark / unmark and an audited **Export
to CSV**, behind a new viewer permission `event:view-runners` (§5
`client-runners.ts`, §7); no migration. The owner first ruled the list should
carry no contact details, then reversed it the same day because the client
releases and ships the kits. The Privacy page's *Who sees your data* says what
a client organization sees and that it can download it, and the legal date
(shared with the Terms) moved to October 8, 2026. Still not seen
signed in as a real client viewer (no seeded viewer account).
**Shirt sizes count garments, not runners** (2026-10-08, on `dev`, not
released, `SHIRT_COUNT_PLAN.md`): the Shirt Sizes panel, on screen and in the
PDF, lists one block per singlet or shirt named in the categories' *What's
Included*, with its pieces per size and the categories it comes with, under a
totals line by type. The per-category runner breakdown the panel used to
show is gone (owner, 2026-10-08): kits are packed from the Runners list. The
registration form is unchanged (§5 `shirt-size.ts` `wearableItems`,
`client-race-report.ts` `garments`). Staff reach the page from the Events row
menu as **Race Report**, with an *Events* breadcrumb. No migration. Seen as
Super Admin on local data; 32KM Beyond 21 has registrants in the 21K only, so
its singlet-only 5K has not been seen with runners.

**The e-certificate template guide is a dashboard page** (2026-10-07, on
`dev`, not released, `ECERT_GUIDE_PAGE_PLAN.md`): `/admin/certificate-guide`,
for everyone signed in including client viewers, with **Save as PDF** for a
designer who has no account (§6). It replaces the private claude.ai artifact,
which the owner can now delete. No migration, no API route.

**One order carries at most 20 runners** (2026-10-06, on `dev`, not released): both checkout routes refuse a longer list with a 400 and both wizards stop adding runners at 20 (§5 `order-size.ts`), so one throttled request can no longer hold a whole category. No migration.

**The Overview answers the morning question** (2026-09-23, `OVERVIEW_PLAN.md`
Batch 1, on `dev`, uncommitted): pending bank transfers as an oldest-first
queue with their age, one row per live race with its fill, the tiles and
recent orders all links, every figure counted by the database instead of in
JavaScript, and Manila dates. No migration. See §6 `/admin`.

**`FEATURES_CHECKLIST.md` and `IMPROVEMENTS_PLAN.md` are deleted.** Both were
finished — every major section of the roadmap ticked through the results and
e-certificate module, and all fourteen improvements across `IMPROVEMENTS_PLAN`'s
seven batches landed — and the decisions each recorded are settled, not open
questions a future session needs to re-derive from the file. This guide is
where that reasoning now lives (§9 and this section); the plan files themselves
added nothing once their queue was empty.

**`PROMOTIONS_PLAN.md` is finished.** All three batches have landed; like
`IMPROVEMENTS_PLAN.md` it is now kept only for the reasoning behind each and for
the decisions it records as not to be relitigated. It is no longer a queue, and
the file itself says it may be deleted.

**`MARKETING_DISCOUNTS_PLAN.md` and `PACER_DISCOUNT_PLAN.md` are open queues**
(both written 2026-09-19 from the owner's decisions). The first brings
**percentage and fixed-amount** codes back to `/admin/marketing`, with an
optional per-code category restriction (`PromoCategory`) and shared-code
limits **counted in runners**; a voucher covers one runner, the most expensive
entry. **Both batches are in (2026-09-19)**: both kinds are fully operational, including checkout runner counting, expiry restocks, and partial application messages on the wizards. Releasing it needs `npx prisma migrate deploy` against production. The second, which runs only after the first, adds
**pacer codes**: one free entry per named pacer, one category, solo orders
only, managed at `/admin/events/[id]/pacers`, and never listed in Marketing.
Staff send each code themselves, so the screen reminds them which pacers have
not been sent theirs (`codeSentAt`). A
Super-Admin-only admin-fee waiver makes such an order ₱0, and it completes as
`COMPLIMENTARY` without reaching PayMongo.
**Batches 1 and 2 of the pacer plan are in (2026-09-22)**. Batch 1: migration
`20260922100000_pacer_codes`, the `PACER` kind, the `promo:waive-fee` verb, the
`pacer.ts` / `pacer-store.ts` rules, both routes, the Pacers screen and its
*Pacers* item on the events row menu, and pacer codes excluded from
`/admin/marketing` and from `spendByCode`. **Batch 2 makes a pacer code
spendable**: `discountAmountFor` now takes off the whole entry line,
`promoCodeError` refuses a group and a wrong category by name, a pacer code
wins `bestDiscount` outright, `platformFeeAfterDiscount` applies the waiver in
all four places, and `lib/free-checkout.ts` is the ₱0 path — both wizards drop
their payment half and both checkout routes write `PAID`/`COMPLIMENTARY` at ₱0
and send the receipt instead of the acknowledgement, never touching PayMongo.
Two defects found while verifying were fixed with it: a `COMPLIMENTARY` order
would have sat in the unsent-email backlog for good (`outstandingEmail` now
knows about it), and both wizards' success screens read the stored total with
`||`, which threw a free order's ₱0 away. **Batch 3 finishes the dashboard side (2026-09-22)**: the
registrants list marks each row `isPacer` from the order's own `discountType`
snapshot and wears a blue *Pacer* chip under the status — where it explains a
PAID row with nothing collected — with a **Type → Pacers** option in the one
Filters sheet and a **Pacer** column in the CSV; the detail modal repeats the
chip, prints *Complimentary: pacer entry* under the payment method, and no
longer claims PayMongo settled a free order (`statusProvenance` now takes
`{ isBankTransfer, isComplimentary }`). A complimentary order cannot reach the
*Needs Validation* queue or the bell, which both ask for PENDING **and** bank
transfer. `settlement.ts` needed no arithmetic — a ₱0 order adds nothing to
collected and nothing to Run As One's share — and now says so in its header,
naming the breakdown's *Discounts* line as where a pacer shows. The Pacers
screen gained **"N of M pacers registered"**. **The registrants screen was split
in the same change**, from 2,571 lines to 2,017: `RegistrantDetailModal.tsx`,
`registrant-display.tsx` and `registrant-csv.ts` beside it. `dev` may be
promoted whenever the owner says. Releasing it still needs
`npx prisma migrate deploy` against production for Batch 1's migration. Each file holds its decisions,
batches and open questions; the behaviour described in §4–§7 is unchanged
until a batch lands.

**`DASHBOARD_SHELL_PLAN.md` Batch 2 is in (2026-09-23).** The dashboard's quick
jump now reaches a race by name: `GET /api/admin/search` (§6) matches event
titles behind `reachableEvents(actor, 'registration:view')` and
`DashboardQuickJump` merges the hits under an **Event registrants** heading
below the menu's own rows, each row carrying the race's day so two similar
titles are told apart. Typing "pink" and pressing Enter lands on Pink Run
2026's registrants. Verified signed in on `localhost:3000` and at 360px, where
the list has no horizontal overflow and long titles ellipsise against the date.
The palette's Batch 1 behaviour is untouched when the search is short, slow or
failing, which is the point — see §9 for the three rules that hold that, and
copy them into any other search-as-you-type screen. **Batch 3 has landed too:**
every page draws its header with `DashboardHeader`, the bell and account menu
ride in its row through context, `--dash-accessory-w` and its `ResizeObserver`
are gone, and the back arrows on the eight deep pages are breadcrumb trails
(`Events › Pink Run 2026 › Registrants`). The plan is finished.

**`GUARDIAN_CONSENT_PLAN.md` is finished — all four batches have landed**, and
the file is kept only for the owner's decisions and the reasoning behind them.
A birthdate can no longer be in the future anywhere it is written:
both wizards pick it with the custom `BirthdatePicker` (§9; Batch 2), which
cannot select a day after today in Manila, step 1 validation gives the specific message from
`lib/minor-consent.ts` and highlights the field, both checkout routes refuse it
with `participantBirthdateError`, and the admin runner edit refuses it (its
modal now picks it with `AdminDatePicker`, capped at today). **Batch 3**
asks for guardian consent: a runner 12 or under on race day gets a
*Parent/Guardian Consent* panel in their card (`register/GuardianConsent.tsx`:
name, `SelectField` relationship, a tick naming the child), step 1 validation
owes all three, both checkout routes refuse an order missing them
(`participantGuardianError`) and write `Runner.guardianName` /
`guardianRelationship` / `guardianConsentAt` through `storedGuardianConsent`.
Migration `20260919120000_runner_guardian_consent` adds the three nullable
columns — **run `npx prisma migrate deploy` against production when this is
promoted to `main`**. **Batch 4** lets organizers see it (§6, registrants):
a *Minor* chip, the Parent/Guardian Consent block in the detail modal (amber
*No guardian consent on file* for a minor without it), the printable sheet at
`/admin/events/[id]/registrants/[runnerId]/consent`, three CSV columns, an
*Age → Minors* filter, guardian fields in the runner edit (warns, never
blocks; audited as sensitive), and the guardian in both registration emails.

**The dashboard has a Dark Mode switch and a complete light theme**
(2026-09-18, on `dev`, uncommitted). The account menu's switch works and
persists (`dash_theme`, §6), and **all three batches of `LIGHT_THEME_PLAN.md`
have landed**: the palette is tokens (§9); `Admin.css`, the shared table
primitives, modals, bell and toasts read them; and every dashboard page's TSX
has been swept onto them, with brand-coloured words on the new
`--accent-*-ink` pair and status words on `--status-*`. The plan file is now
kept only for its reasoning and its list of deliberate literals. `--bg-dark` is
finally defined (the collapse knob's ring is back), the duplicate
`.action-dropdown-item` rules are merged, and the date pickers and chevrons
follow the theme. `Auth.css`'s field rules are scoped to `.auth-container`:
the dashboard loads that file through `admin/loading.tsx`, and its unscoped
`.form-input` was stripping the border off dashboard fields (it read an
undefined `--color-border`) and painting them grey on the light theme. **A
stylesheet imported anywhere under `/admin` reaches every dashboard page**, so
its generic class names must be scoped to the page they belong to. The
sign-in, register and invite pages stay dark by decision. No schema change.

**Settings is grouped into four pages** (2026-09-18, on `dev`, uncommitted):
Profile, Security, Site Settings and Your Access, listed in the account menu in
place of its single Settings row (§6). No schema change.

**Settings got its panels** (2026-09-18, on `dev`, uncommitted): profile
photo, phone for staff, email change behind the current password, sign-in
activity and the read-only role panels (§6). **Carries a migration,
`20260918100000_account_avatar`** (`avatarUrl` on Organizer and StaffAccount) —
applied to `local-dev`; **releasing it needs `npx prisma migrate deploy` against
production**, and a running `next dev` must be restarted after `prisma generate`
or every dashboard page fails on the unknown field. **What is left is tracked
in `SETTINGS_PLAN.md`**; all four batches have landed, and only 2FA
(on hold) remains.

**Social links are a setting** (2026-09-18, Settings Batch 2, on `dev`,
uncommitted): the Social Links panel on `/admin/settings`, four nullable columns
on `SiteSettings`, and a footer that shows only the channels with a saved link
(none saved → the whole "Follow the community" block is hidden). **Carries a
migration, `20260918110000_site_social_links`; releasing it needs
`npx prisma migrate deploy` against production.**
**Two-factor sign-in** was on hold then; it was built in `TWO_FACTOR_PLAN.md`
(2026-10-12).

**Everyone can sign out their other devices** (2026-09-18, Settings Batch 3, on
`dev`, uncommitted): Sign-in Activity on `/admin/settings` now shows for the
owner too, with a **Sign out other devices** button (`admin/profile/sessions`);
the owner's sessions are checked against `Organizer.sessionsValidFrom`, the
owner's sign-in is recorded (`lastLoginAt`, also on the Team table), and an
owner password change ends the owner's other sessions like a staff one does.
**Carries a migration, `20260918120000_organizer_sessions`; releasing it needs
`npx prisma migrate deploy` against production** — without it every owner
request fails on the unknown column and Run As One is locked out of its own
dashboard, so run the migration *before* promoting `dev` to `main`.

**The default platform fee is a setting** (2026-09-18, Settings Batch 4, on
`dev`, uncommitted): the Super Admin's Default Platform Fee panel on
`/admin/settings` writes `Organizer.adminFee` (no longer a dead column) through
`admin/platform-fee`, and the create-event form starts from it. It only affects
new events. **No migration.**

**The dashboard has notifications** (2026-09-18, on `dev`, uncommitted): the
header bell and its modal (§6), fed by `notification-store.ts` (§5) through
`admin/notifications` — derived from existing rows, no schema change, no
migration. Read state is per browser. Not yet a notification: remittances owed
on a finished race (it has no instant of its own to be "new" at), and no
screen deep-links to one client, club or feedback message yet, so those three
open their list.

**The account lives in the header** (2026-09-18, on `dev`, uncommitted): the
sidebar's user block and its Settings and Log Out rows moved into
`AccountMenu` beside the bell (§6), so the sidebar is the pages alone.

**Every admin table filters through one Filters chip** (2026-09-17, on `dev`,
uncommitted): `FiltersMenu` was lifted out of the events list and now carries
the filters of registrants (its `sm`-up per-column chips are gone), results (its
private `FilterOptions` copy is gone), clients, feedback and remittances (their
`FilterChip` rows, and the component, are gone) and activity (its four
`AdminSelect` pickers became sheet groups, and Person / Event / Activity became
many-valued in `lib/activity.ts` and `activity-store.ts`). Screens with no
filter (marketing, team, communities, a race's settlement) were left as they
are. No migration.

**`ADMIN_MERGE_PLAN.md` is the active queue — Batches 1–5 have landed on `dev` (2026-09-17); nothing is released to production yet.**
The owner decided there is no super admin any more: one dashboard at `/admin`,
run by Run As One staff, who create every event and validate every payment;
runners' money goes to Run As One, which remits to the organizer. An organizer
becomes a **Viewer** that sees only its events and registrant counts. The
application form stays (password removed) and feeds a submissions list with a
**Send invite** instead of approve/reject. The organizer owner account that
signs in today **is Run As One's own account**, so its row stays the one tenant
and a new `Client` record is added. Six batches, the last being remittance
tracking. **Read the plan's Status table before touching `/admin`,
`actor.ts`, `permissions.ts` or the `Organizer` model**, and
tick it as work lands. **Batch 1:** the production
audit confirmed Run As One's row is `seed-crc-organizer` ("Cresendo Running
Community", `cresendorunningcommunity@gmail.com`, owner of all four events,
every promotion and both staff memberships), and the owner confirmed that
"System Owner" (the `SUPER_ADMIN` row), "Super Admin Test" and "Test" are test
accounts; the `Client` model, `Event.clientId`, `StaffMembership.clientId`,
the `VIEWER` membership role, `lib/client.ts` and the viewer scoping in
`actor.ts` are in, verified on localhost (plan's Batch 1 notes). Migration
`20260917120000_clients_and_viewer_role` is on `local-dev`; **run `npx prisma
migrate deploy` against production when this is released** — until then a
production build of this code fails every staff sign-in, because `getActor()`
selects the new column. Nothing a
viewer sees exists yet. **Batch 2 (one shell):** `/superadmin` is gone — its
Organizers, Communities and Feedback screens are `/admin/organizers`,
`/admin/communities` and `/admin/feedback` behind the new `platform:manage`
permission (owner and admin), their routes moved to `/api/admin/*` behind
`platformActor()`, its Activity merged into `/admin/activity` (an *Organizer
decisions* shelf; the scope split is gone), and its dashboard became the
Overview's *Platform Fees Collected* tile — the owner's two calls. Every old
`/superadmin` URL is a permanent redirect (`next.config.ts`), `proxy.ts` sends
nobody to a second dashboard, and `SuperAdminShell`, `OrganizerSwitcher` and
`api/auth/switch-organizer` are deleted (the audit showed one tenant). No
migration. Verified on localhost at 360 / 767 / 820 / 1280 with throwaway
`local-dev` accounts (plan's Batch 2 notes). **Batch 3 (submissions and Send
invite):** the application form has no password and writes a `Client`
submission; `/admin/organizers` became `/admin/clients` (chips, the application
panel with a Sign-ins section, Send / Resend invite, Archive / Restore) and
redirects there; Send invite makes a `VIEWER` membership through the team
invite machinery with its own email and accept-page wording, and acceptance
makes the client ACTIVE; the event forms gained a Client picker for
`platform:manage`; `RejectDialog` and the approve / reject / suspend UI are
deleted, and so is `SUPERADMIN_APPLICATIONS_PLAN.md`. No migration. Verified on
localhost with throwaway `local-dev` rows (plan's Batch 3 notes). **Then, at the owner's word, on `local-dev` only:**
Run As One's row signs in as `runasoneph@gmail.com`, named "Run As One" and
labelled **Super Admin**; Cresendo Running Community
(`cresendorunningcommunity@gmail.com`) is a client with all four events linked
and an invite sent — **production needs the same at release** (plan's notes).
**Batch 4 (the Viewer dashboard):** a viewer's `/admin` is *Your Events* —
count tiles and one card per race with its total, paid vs pending (since
UNPAID_ORDERS_PLAN Batch 1: paid, awaiting verification and unpaid apart) and
per-category counts, no money (`client-summary.ts`, `ViewerDashboard.tsx`); its
sidebar is Dashboard and Settings; every team screen answers it with the
designed *Not Part of Your View* page through `requireTeamActor()` /
`forbidden()` (`experimental.authInterrupts` turned on); an archived client's
viewer gets client wording at sign-in. No migration. Verified on localhost with
throwaway `local-dev` rows (plan's Batch 4 notes). **Batch 5 (link, retire,
clean up):** the `SUPER_ADMIN` session kind, `SUPER_ADMIN_REACH`, every super
admin branch, the `admin/organizers` routes, the decision emails, the approval
parts of `organizer-status.ts` and the `seed.ts` / `seed-superadmin.ts` scripts
are gone; **owner sign-in is pinned to Run As One's row**
(`RUN_AS_ONE_ORGANIZER_ID`) at login, in `jwt.ts` and in `getActor()`, because
production's "Super Admin Test" row was `APPROVED` and would otherwise have
become a Super Admin. Migration `20260917180000_retire_super_admin` deletes the
two test rows by id and drops the Organizer application and decision columns.
**Production is four migrations behind `dev`** (Batch 1's three and Batch 5's);
the release order — `migrate deploy` first, then the in-app data steps, then
`main` — is the checklist in the plan's Batch 5 notes. **Batch 6 (remittance
tracking) is built on `dev`, ahead of that release at the owner's request:**
`/admin/remittances` and its per-race settlement page, the `Remittance` model
(migration `20260917200000_remittances`, additive — production then needs
**five** migrations), `settlement.ts` / `settlement-store.ts`, the
`remittance:manage` permission, three API routes, three trail verbs on a
*Remittances* Activity shelf, and an event DELETE that refuses a race with
remittances. The owner's calls: Run As One keeps the platform fee, the
transaction fee is PayMongo's (deducted from the organizer's side but shown as
*payment processing fees*, never as Run As One's — owner's correction,
2026-10-08), the organizer absorbs discounts, per event, a refund makes the balance
go negative, and a viewer sees no settlement. See the plan's Batch 6 notes for
what was verified.

**`STAFF_ACCESS_PLAN.md` is an open queue, with Batches 1–3 landed.** Five batches
for giving an organizer's personnel their own accounts instead of sharing the
organizer's one login. **Batch 1 is in:** the `StaffAccount` /
`StaffMembership` / `EventAssignment` / `AuditLog` models and the soft-removal
columns (§4), `actor.ts` / `permissions.ts` / `audit.ts` (§5), typed session
claims with `orgId`, every admin page and `/api/admin/**` route rewired onto
`getActor()` / `requireActor()` and `can()`, and every existing admin action
written to the trail. **Batch 2 is in too:** `/admin/team` (invite by email,
Admin or Staff with per-event roles, edit access, suspend / reinstate, resend
or revoke an invitation, remove), the public `/admin/invite/[token]` accept
page, per-membership suspension (migration
`20260913180000_staff_membership_suspension`), the organizer switcher for staff
who work for several organizers, and a sidebar and events table that only offer
what the role allows. **Batch 3 is in too:** `/admin/activity` (the trail with
Person, Event, Activity and Dates filters, server-paged and pinned so it never
shifts under a reader), a *Validated by* line and an activity link in the
registrant detail modal, and a registrants screen that offers each role only
the buttons its routes allow. No migration. Its Batch 4 (TOTP) was later built as
`TWO_FACTOR_PLAN.md` (2026-10-12); of its optional extras only the retention
sweep is left (`ON_HOLD.md` §3). **Read the plan before touching admin auth, the `Organizer`
model, or any `/api/admin/**` route's ownership check** — its "Batch 1" notes
record the calls made in the batch, and the file records which decisions are
closed (no unified account table; "no SSO" was reversed by the owner on
2026-10-11 — Google sign-in landed in `LOGIN_UX_PLAN.md` Batch 3).

**`SUPERADMIN_APPLICATIONS_PLAN.md` is deleted** (`ADMIN_MERGE_PLAN.md` Batch
3). Its four landed batches built the application panel, the `REJECTED` status
with its reason (`statusNote`, `statusChangedAt` — migration
`20260916120000_organizer_status_decision`, which production needs at release),
the decision emails and the `organizer.*` trail rows; its optional Batches 5–6
extended the approval screen that Batch 3 replaced with `/admin/clients`. The
panel lives on there; the columns, routes and emails were removed in
`ADMIN_MERGE_PLAN.md` Batch 5 (the `organizer.*` verbs stay for old rows).

**`MOBILE_RESPONSIVE_PLAN/` is finished, and the folder is deleted.** All six
batches landed and the convention itself lives in §9, which needs nothing from
the plan; what follows is the summary kept here instead. Batch 1
added `DashboardShell` (the frame both dashboards share: one collapsible
sidebar menu at every width, a rail that opens over the page on a phone), `AdminCardList`, the `.dash-desktop-only` /
`.dash-mobile-only` switch, and the toolbar, header, metrics, popover and
modal-frame rules in `Admin.css`, all on the public site's breakpoints (§9,
"One responsive dashboard"). The Dashboard's Recent Registrations is cards
below `lg`. **Batch 2 is in too.** `/admin/events` and `/admin/team` are cards
below `lg`, on the new shared `AdminTablePager`, `MobileSortMenu` and
`placeRowMenu`. The event schedule and delete modals and the team invite form
wear `.admin-modal-panel`. Below `lg`, the team's permission matrix is a
`RolePicker`: one role at a time, on a sliding-tabs control. **Batch 3 is in
too.** `/admin/events/[id]/registrants` is cards below `lg`, with a Filters
sheet below `sm`, a bulk bar at the foot of the screen, a full-height detail
sheet, all five modals on `.admin-modal-panel`, the row menu on
`placeRowMenu`, and the proof lightbox's tools in a bar under the image on a
phone. **Batch 4 is in too.** `/admin/marketing` and
`/admin/events/[id]/results` are cards below `lg`, on the shared pager, Sort
chip and `.toolbar-popover`s. A voucher batch opens inside its card through a
"Show N codes" accordion (`.t-acc`). The promotion form, the Redemptions panel
and the results uploader wear `.admin-modal-panel`, the uploader's column
mapping is `AdminSelect`, `PromoActionsMenu` is on `placeRowMenu`, and the edit
screen's Promotions panel stacks on a phone. **Batch 5 is in too.**
`/superadmin/organizers`, `/communities` and `/feedback` are cards below `lg`.
The club rename opens as a full-width `AdminCardEdit` block on
the card (the admin fee's went with the fee editor), a feedback card opens its message through a "Read message" accordion
(`.t-acc`), the dashboard's tile icons sit in their `.metric-icon` box, and
Approve / Suspend / Remove wear the `.is-success` / `.is-danger` chip tones.
**Batch 6 is in too.** The create and edit forms keep Save in a bar at the
foot of a phone's screen and their dialogs wear `.admin-modal-panel`; uploads,
settings and the three sign-in pages fit 360px. `<body>` clips its overflow-x
instead of hiding it, so sticky boxes stick. `AdminSelect` flips above its
trigger when it must, every route's wait draws its page's phone shape
(`route-loading-shape.ts`), the organizers list has status chips in place of a
dead Filter button, Add a club sits on one row from `sm` up, and the results
and registrants screens answer a missing event with `AdminNotFound`. The batch
file carries the route × width sweep. The six batches, one file each, made
`/admin/**` and `/superadmin/**` fully manageable on a phone with no
horizontal scroll:
1. the shared shell, menu and card component;
2. Events and Team;
3. Registrants;
4. Marketing and Results;
5. Superadmin;
6. forms, sign-in pages and a full sweep.

The README records the closed decisions — breakpoints that follow the
public site's Tailwind scale (the menu opens over the page below `md`, cards
below `lg`), cards reading the same TanStack rows as the table, a CSS switch
rather than a `matchMedia` hook, and one collapsible sidebar at every width
rather than a phone-only drawer or bottom bar. Don't relitigate them.

**Releasing Batch 1 needs a migration-history fix on production first.**
Production's `_prisma_migrations` stops at `20260911120000_category_sort_order`
although its schema already holds what `20260912044340_registration_opens_at`
and `20260912055118_feedback_inbox` create, so a bare `migrate deploy` fails
with P3018. The exact three commands are in the plan's Batch 1 notes.

Known open threads:

- The **admin email and the social links are settings** (`/admin/settings`,
  `SiteSettings`). Until somebody saves a link, the footer shows **no** social
  icons. **Releasing them needs `npx prisma migrate deploy` against
  production** for `20260918090000_site_settings` and
  `20260918110000_site_social_links`.
- **Owner sessions can be ended** (`SETTINGS_PLAN.md` Batch 3). **Releasing it
  needs `npx prisma migrate deploy` against production** for
  `20260918120000_organizer_sessions`, before the code reaches `main`.
- PayMongo runs in **test mode**.
- Registration emails send via **Resend** from the admin email when it is on
  `@runasone.ph`, else from
  `info@runasone.ph` (Resend only handles outbound sending, not the inbox;
  the domain moved from `cresendorunningcommunity.com` in October 2026, and
  `runasone.ph` must be verified in Resend before `EMAIL_SENDING_DOMAIN`
  names it, or every email stops) — a "received" email at submission
  plus a "receipt" email once PAID (see `email.ts`). No results-ready or
  reminder emails yet. The app stays on Resend's **free tier in production** —
  100 recipients a day, and it stops rather than bills — which is a decision,
  not an oversight. Dropping the bcc archive brought a registration back to two
  recipients, so the ceiling is roughly 50 registrations a day. That ceiling is
  now **visible rather than silent** (Batch F): every send is recorded on the
  registration, a row whose email never went out is marked in the registrants
  table and listed by the *Unsent Email* filter, and a staff member sends the
  missing email themselves from the manual-send modal — copying the formatted
  email for Gmail, or opening their own mail app through a `mailto:` — then
  marks it sent.
- **Discounts are live end to end** (Batch G, extended). An organizer scopes a
  promotion to one event or to all of theirs, picks **a discounted category
  price or buy-X-get-Y**, gives it an optional date window, and chooses how it
  is claimed: one shared code, a batch of
  single-use vouchers, or **automatically, with no code at all**. A runner types
  a code in step 3 of either wizard — **and the box is only there when the
  event has a code that could be typed right now** (`acceptsPromoCodes`), so a
  race running only automatic promotions, or none, never shows registrants a
  box that makes them think they are missing a discount; an automatic promotion is on their order
  from the first render and named on the event page before they start. Both
  checkout routes recompute whichever applies, and only one discount is
  given — unless two are combinable (see the 2026-10-15 entry at the top).
- **A promotion can reprice a race's own options** (Category Prices). The
  organizer picks the event, and the form lists its categories with each one's
  own price beside a box for the promotion's — blank leaves that option alone,
  so an early bird on the 10K need not invent a number for the 5K. What a
  runner then sees is the old price struck through and the new one beside it,
  in both places a price per option appears: the event page's category
  list and the picker in the registration wizard, all through
  `components/CategoryPrice.tsx`. The "What's Included" headings deliberately
  carry no price — costs are compared in the sidebar, and repeating them beside
  every inclusions list only added noise. **In the
  order summary and on the receipt it stops being a discount and becomes the
  price**: the runner's line says ₱900, there is no credit row under it, and
  the promotion is named with the saving stated as a fact rather than
  subtracted a second time. A typed code is the opposite and unchanged — the
  goods stay at list and the code shows what it took off. The stored row is
  the same in both cases (list `subtotal`, `discountAmount`, `promoCode`,
  `discountType`), so the organizer's *Given* column, the *Given Away* card
  and the revenue tile all keep counting the same money.
- **A repricing promotion can be capped per category, in runners** (Category
  Prices, extended). The form carries a second box
  beside each price — 50 at ₱900 on the 10K, 30 at ₱600 on the 5K — and it
  counts runners rather than orders, so a group of three takes three. The event
  page and the picker carry an **"N left at this price" chip** once a category
  is within `LAST_CALL` (20, matching `LAST_CALL_SLOTS`), and a filled category
  simply returns to its own price rather than showing a sale nobody can get.
  Seats are claimed inside the checkout transaction by `redeemPromoCode` under
  the same `FOR UPDATE` lock and id ordering `reserveSlots` uses, and handed
  back by the abandoned-checkout sweep — which counts `Runner.promoPrice` rather
  than recomputing from the promotion, so an order that took two of the last
  three seats gives back two. An edit cannot cap a category below what it has
  already sold. `scripts/check-category-price-math.ts` guards the invariant that
  the summary's line items reconcile with its total. This kind is
  **automatic only and always scoped to one race** — categories belong to an
  event, and a struck-through price is the most public thing a promotion can
  be. `PERCENTAGE`, `FIXED` and `FREE_DELIVERY` were removed in the same change
  and their rows deleted (the first two came back per runner in 2026-09 — see
  `MARKETING_DISCOUNTS_PLAN.md` above); receipts are unaffected, because `promoCode` and
  `discountAmount` on a registration are snapshots.
  A promotion can be edited, paused or deleted from the row menu on
  `/admin/marketing`, and its Status column names all five states rather than
  calling an expired code "Active". **What a promotion cost is now on the same
  screen** (Promotions Batch A): a **Given** column of pesos beside Used, a
  *Given Away* metric card totalling it, and a *View redemptions* panel listing
  the orders that spent it, each linking through to that event's registrants
  with the order reference already in the search box. Money is counted on paid
  orders only and redemptions on placement, and the Used column reads
  `12 redeemed · 9 paid` whenever the two disagree rather than letting the gap
  look like an arithmetic error — see `promo-redemptions.ts`.
  The organizer dashboard's revenue tile
  subtracts `discountAmount` — it did not until the promotions work landed,
  and was reporting money that had been given away. An abandoned online
  checkout no longer keeps its redemption or its slot for ever: the daily sweep
  in `pending-expiry.ts` releases both after 24 hours, and its trigger is
  `POST/GET /api/cron/expire-pending`. The four smaller gaps are closed too
  (Promotions Batch C). The public code-lookup route is **throttled** — 20 tries
  a minute per address, answering a throttled caller exactly as it answers a
  code we do not have (`lib/rate-limit.ts`, honest in its own comment about
  stopping the naive script and not a distributed one). A promotion can be
  **duplicated** from the row menu, which is the create form prefilled from the
  row rather than a route of its own. An event's edit screen ends with a
  **read-only panel of the promotions running on that race**, so a price is
  never set with the discounts against it out of sight. And a promotion in its
  last three days says so in amber under its Active badge (`promoEndingSoon`),
  rather than letting EXPIRED be the first an organizer hears of it — in-app
  only, for the same free-tier reason as the sweep.
- **Abandoned online checkouts are swept daily** (Promotions Batch B). An
  unpaid online order older than 24 hours becomes `EXPIRED`, gets an
  `expiredAt` stamp, gives its promo redemption back and — by the act of
  leaving `PENDING` — its category slot too. A **bank transfer gets seven
  days** for a person to look at the proof (it was never swept until
  2026-10-13; see the entry at the top). The
  rule is `lib/pending-expiry.ts`, the trigger is `/api/cron/expire-pending`
  behind `CRON_SECRET`, and the schedule is the single entry in `vercel.json`.
  The runner is not emailed; the organizer sees the neutral `EXPIRED` badge on
  the registrants screen, and the detail modal says when it happened and what
  went back.
- **One meaning of "registrant" on every screen** (`UNPAID_ORDERS_PLAN.md`
  Batch 1, 2026-10-05). A client read four registrants on the overview and the
  events table where the registrants screen listed one: the counts took every
  PENDING runner, the list hid unpaid online checkouts. A registrant is now a
  runner on a PAID order or a bank transfer awaiting verification; an unpaid
  online checkout is shown beside the count ("+N unpaid", "Unpaid Checkouts"),
  never in it. The events table, the overview's live rows and the client
  viewer all count through `heldPlacesByCategory` in `pending-expiry.ts`, and
  the overview's awaiting-verification queue skips an order with no live
  runner. Slot capacity is unchanged.
- **Unpaid checkouts tab** on the registrants screen (`UNPAID_ORDERS_PLAN.md`
  Batch 3, 2026-10-05): the online orders never paid, one row per order, with
  the contact to copy and when each expires, for staff on every event role to
  follow up by hand. "+N unpaid" on the events table and the overview link to
  it (`?tab=unpaid`). **Check payment** (Batch 4) on each row asks PayMongo
  whether the order was in fact paid, and a missed webhook is recovered by it:
  the order goes PAID through the webhook's own path (`lib/online-payment.ts`)
  with its receipt and a trail row. Tested against PayMongo test mode for both
  stored shapes (`cs_` checkout session, `pi_` GCash intent).
  **Row menu and follow-up log** (`UNPAID_FOLLOWUP_PLAN.md` Batch 1,
  2026-10-05): the row's buttons became a ⋮ menu — Check payment, Call, Text
  (SMS), Email, Copy contact, Log follow-up… — and each logged follow-up is an
  audit row (`registration.followed_up`) shown in a Follow-up column and
  filter, open to every event role. **Cancel order…** (Batch 2,
  2026-10-05) closes a pending order with a required reason through the
  status route, freeing the slot and handing the promo back at once; the
  order stays on the tab under Filters → Status → Cancelled until race day
  and never becomes a registrant. **The resume-payment link** (Batch 3,
  2026-10-05): *Copy payment link* hands staff a signed `/pay/[token]` link
  (`lib/resume-payment.ts`) that lets the runner finish paying the same order
  without registering again; the public page shows no name, email or phone,
  and *Pay now* closes the order's earlier PayMongo page before opening a new
  one with the same reference, so the order cannot be paid twice. The first
  link moves the hold 24 hours from that moment (`Registration.holdUntil`,
  never past race day), and the sweep leaves the order alone until then. An
  expired order gets *Copy registration link* instead. **Sending it** (Batch
  4, 2026-10-05): *Send payment link* emails it through Resend (one of the 100
  a day, confirmed first), *Send by hand…* prepares the same email to send
  from staff's own mailbox at no quota, and both log the follow-up *Link
  sent*; marked rows can be sent in bulk behind a confirm naming the count. A
  send Resend refuses opens the by-hand path with the reason. Walked end to
  end in PayMongo test mode (QRPh) on 2026-10-05/06, the whole flow again on
  2026-10-06 at desktop and 360px (Batch 5). **Carries migration
  `registration_hold_until`**, still to run on production (`ON_HOLD.md`'s
  release steps). Not done, by choice: reinstating an expired order,
  reminder emails on a timer, SMS from the app (`ON_HOLD.md` §9).
- **No more empty orders** (`UNPAID_ORDERS_PLAN.md` Batch 5, 2026-10-05).
  Removing the last live runner of a PENDING order — one at a time or in bulk —
  cancels the order in the same transaction and hands its promo back
  (`cancelEmptiedOrders` in `pending-expiry.ts`), with a trail row for the
  runner and one for the order; the delete confirmation says so first. A PAID
  order is never cancelled this way: the confirmation tells the admin to
  settle any refund separately. Cancelling a PENDING order on the status route
  now hands its promo back too, through the sweep's own `releaseRedemption`.
- A **Prisma schema change needs the dev server restarted** before it takes
  effect: `next dev` bundles the generated client, so a running server keeps
  the pre-migration data model and rejects a write to a brand-new column with
  a 500 even though the column exists. `npx prisma generate` alone is not
  enough, and Next 16 refuses to start a second `next dev` on the same
  directory, so there is no way around restarting the one that is running.
- **`/` and `/events` are prerendered at build time** (they take no dynamic
  API), so on Vercel their cards — including the FULL, PAUSED and `Opens …`
  badges — are a snapshot of the last deploy rather than live. This predates
  the badges and applies equally to a newly published event; the event page,
  the register page and both checkout routes are dynamic and always current, so
  nothing can be *registered* against a stale listing. Making those two pages
  dynamic is a decision that has not been taken yet.

  **A scheduled opening makes this sharper than the other badges do**, because
  it is the one closure that lifts on a clock rather than on someone pressing
  something: after the opening passes, those two listings keep showing
  `Opens Oct 5` and a *View Event* button until the next deploy, while the
  event page beside them is already open and taking sign-ups. Nobody is
  wrongly charged or wrongly turned away — the dynamic pages and both checkout
  routes decide for themselves — but the card under-sells a race that is live.
  The fix is either `export const revalidate = <seconds>` on the two listings
  or making them dynamic, and it is the owner's call because both spend Vercel
  invocations the current build does not.

