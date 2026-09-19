# Guardian Consent Plan: the Birthdate field and runners aged 12 and under

This file tracks the change to the registration wizard's **Birthdate** field
that the owner agreed to on 2026-09-19. **One batch per session.** When a batch
lands, tick its box, add a line under *Where it stands*, and update
`PROJECT_GUIDE.md` in the same change.

## What the owner decided

| Question | Decision |
|---|---|
| Which birthdates can be picked | **Today or earlier.** Future days are disabled in the calendar and refused by the server. |
| When a waiver is needed | When the runner is **12 or younger (≤ 12)**. |
| Age as of which day | **The race day** (`Event.date`), not the day they register. A runner who is 12 today but 13 by the race does not need it. |
| Per event or everywhere | **Every event, same rule.** No per-event setting and no new `Event` column. |
| Minimum age | **None for now.** Do not add one. |
| Guardian's phone | **Not asked.** The runner's existing Emergency Contact covers it. |
| Birthdate control | Replace the native `<input type="date">` with a **custom date picker** that matches the app. |

## The approach: consent inside the form, with no download or upload

We are not using a printable waiver that the parent downloads, signs, scans and
uploads. That is the step where a parent on a phone gives up on the order. The
guardian consent works the same way as the order's existing waiver
(`ConsentWaiver.tsx`: tick the box, then type a name):

- When a runner's birthdate makes them ≤ 12 on race day, a **Parent/Guardian
  Consent** panel appears **inside that runner's card**, right under Birthdate.
- It asks three things:
  1. **Parent/guardian's full name.** Stored uppercase like every other
     registrant name (`text-case.ts`), with an uppercase sample placeholder.
  2. **Relationship**, either *Parent* or *Legal Guardian*. Use the app's
     `SelectField`, not a browser select.
  3. **A tick box** that names the child: "I am the parent or legal guardian of
     JUAN DELA CRUZ and I consent to their participation…"
- There is no file, no printer and no scanner. It adds about 15 seconds.
- If an organizer ever wants ink, they can print the consent from the
  registrant detail and have it signed at kit claiming. The parent is present
  there anyway, and none of this affects the registration funnel.

The panel disappears if the birthdate is changed to an age above 12, and the
guardian fields are cleared so nothing stale is submitted.

## Where things live today (checked 2026-09-19)

- The Birthdate input is a native `type="date"` with no `max`, in **both**
  wizards: `src/app/events/[slug]/register/RegistrationWizardClient.tsx`
  (~line 1338) and `BankTransferWizardClient.tsx` (~line 1192).
- Client validation is `src/app/events/[slug]/register/validation.ts`. It has a
  `RunnerField` union, a field order list, labels, and messages.
  `birthdate` currently only checks that the field is not blank.
- The server has two checkout routes, `src/app/api/checkout/route.ts` and
  `src/app/api/checkout/manual/route.ts`. Both parse a `participants` JSON and
  run shared validators from `src/lib` (e.g. `participantEmailError` in
  `email-address.ts`) before writing `Runner` rows (~line 315/324).
- `Runner.birthdate` is a `String` (`YYYY-MM-DD`). `Event.date` is also a
  `YYYY-MM-DD` string.
- `src/lib/event-schedule.ts` already has `today()`, which returns **today in
  Manila** as `YYYY-MM-DD`, and `isCalendarDay()`. Reuse both. Do not use
  `new Date().toISOString()`: that is UTC, so every Manila morning before 8 AM
  it gives yesterday.
- Birthdate is also shown or edited in the admin registrants page and table
  (`src/app/admin/events/[id]/registrants/`, including CSV export and the
  runner edit modal), in `src/app/api/admin/runners/[id]/route.ts`,
  `src/lib/audit.ts` (the sensitive-field list), and the confirmation email
  (`src/lib/email.ts`, ~line 695).

---

## Batch 1: the rule, and no future dates

The logic comes first, with no schema change. After this batch nobody can
submit a future birthdate, and the "is this runner a minor?" rule exists in one
place.

- [x] **New `src/lib/minor-consent.ts`**, free of Prisma so both wizards can
      import it:
      - `GUARDIAN_CONSENT_MAX_AGE = 12`
      - `ageOn(birthdate: string, day: string): number | null` gives whole
        years on `day`. It works on the `YYYY-MM-DD` strings directly (year
        difference, minus one if the month/day has not come yet), so no
        timezone is involved. A Feb 29 birthday counts as Mar 1 in non-leap
        years. Returns `null` for a malformed date.
      - `needsGuardianConsent(birthdate, raceDay): boolean` is `ageOn(...) <= 12`.
      - `birthdateError(value, today): string | undefined` returns
        "Enter a birthdate", "Enter a valid birthdate" or
        "Birthdate can't be in the future".
      - The header comment records the owner's decisions above: race-day age,
        ≤ 12, every event, no minimum age.
- [x] **Both wizards:** as a stopgap until Batch 2, set `max={today()}` on the
      native input.
- [x] **`validation.ts`:** the `birthdate` message comes from `birthdateError`,
      so a future date gives a specific message and highlights the field.
- [x] **Both checkout routes:** add a `participantBirthdateError(participants)`
      in `minor-consent.ts`, used the same way as `participantEmailError`. When
      there is more than one runner, it names the runner ("Runner 2: birthdate
      can't be in the future").
- [x] **Admin runner edit** (`api/admin/runners/[id]`) refuses a future
      birthdate too, because a rule enforced at one door can still be written
      past at another.
- [x] `PROJECT_GUIDE.md` §5 gets a row for `minor-consent.ts`, and §10 gets a
      line.

**Done when:** a future date cannot be picked, typed or POSTed, and the message
names the field.

## Batch 2: the custom Birthdate picker

This replaces the native date control in both wizards. Load the
`ui-ux-pro-max` skill before designing it, and `transitions-dev` for the
popover's open and close.

- [x] **New `src/components/ui/BirthdatePicker.tsx`**, or under `register/` if
      nothing else needs it. Before designing, look at `SelectField.tsx` and
      `Combobox.tsx` and copy their trigger, popover, border and focus styles
      so the picker looks like the fields next to it.
      - **Trigger:** a field-styled button that shows the date in words
        ("March 4, 2014"), or a sentence-case instructional placeholder
        ("Select your birthdate"), with a calendar icon.
      - **Popover:** a month grid with a **Month** and a **Year** select in its
        header. A birthdate is years back, and nobody should have to click
        "previous month" 140 times to reach 2014. The year list runs from the
        current Manila year down about 100 years.
      - **Future days are disabled** (greyed, not focusable), and so are future
        months and years. `max` comes from `today()`.
      - **Keyboard:** arrow keys move between days, PageUp and PageDown change
        month, Enter selects, Esc closes and returns focus to the trigger.
        Roles are `dialog` and `grid`, and `aria-invalid` and
        `aria-describedby` are passed through from `fieldAria` so the wizard's
        error wiring keeps working.
      - **Mobile:** it must fit a 375px screen with no horizontal scroll (a
        bottom sheet or a full-width popover is fine), and day cells need a
        tap target of at least 40px.
      - The value in and out stays a `YYYY-MM-DD` string, so the wizards'
        state, validation and the API do not change.
      - The id stays `runnerFieldId(idx, "birthdate")`, so "focus the first
        invalid field" after a failed submit still lands on it.
- [x] Swap it into **both** wizards.
- [x] Verify in the browser at desktop and mobile widths, in the dark theme
      (the public site). Screenshot the proof.
- [x] `PROJECT_GUIDE.md` §8/§9: record the picker as the reusable date control
      for runner-facing forms.

**Out of scope:** the dashboard's other native date inputs (event date, promo
windows, activity filter, remittance). They could adopt the picker later as a
separate task, but not in this plan.

**Done when:** both wizards use the new picker, future days cannot be chosen,
and it works with keyboard, mouse and touch.

## Batch 3: guardian consent, from form to database

This batch carries a **Prisma migration**. When it is promoted to `main`, run
`npx prisma migrate deploy` against production by hand.

- [ ] **Schema:** add three nullable columns to `Runner`, each with a `///`
      doc comment:
      - `guardianName String?` (uppercase)
      - `guardianRelationship String?` (`PARENT` | `LEGAL_GUARDIAN`, a plain
        string guarded by an `asGuardianRelationship()` in `minor-consent.ts`,
        matching how other closed vocabularies are stored)
      - `guardianConsentAt DateTime?` (stamped by the server when the order is
        written, never taken from the client)

      This is small storage on a small share of rows, so it is fine on the
      Neon free tier. Existing rows stay null and are not backfilled.
- [ ] Create the migration against the **development** Neon branch only.
- [ ] **`minor-consent.ts`:** add the labels and copy (`GUARDIAN_RELATIONSHIPS`,
      a checkbox sentence that takes the child's name, the placeholder), plus
      `participantGuardianError(participants, raceDay)`, which both routes and
      both wizards use.
- [ ] **New `register/GuardianConsent.tsx`:** the panel described in *The
      approach*. It uses the app's own checkbox look (copy
      `ConsentWaiver.tsx`'s custom box), `SelectField`, and `FieldError`, and
      it reveals with the same transition the wizard already uses.
- [ ] **Both wizards:** the participant state gets `guardianName`,
      `guardianRelationship` and `guardianConsent`. Render `GuardianConsent`
      under Birthdate when `needsGuardianConsent(p.birthdate, event.date)` is
      true, and clear the three fields when it becomes false. Send them in
      `participants`.
- [ ] **`validation.ts`:** add the three fields to `RunnerField`, the field
      order and the labels. Each is required **only** when the runner needs
      consent, and each has its own message ("Enter the parent or guardian's
      full name", "Select a relationship", "The parent or guardian must agree
      for this runner").
- [ ] **Both checkout routes:** run `participantGuardianError` with
      `event.date`, then write the three columns (the name through
      `optionalUpperCaseForStorage`, the timestamp as `new Date()`). Runners
      who do not need consent get nulls even if the client sent something.
- [ ] `PROJECT_GUIDE.md`: §4 (the Runner columns), §5 (expand the
      `minor-consent.ts` row), §10.

**Done when:** a runner ≤ 12 on race day cannot be registered without the
guardian's name, relationship and tick, whether through the wizard or a direct
POST, and the three columns are saved.

## Batch 4: organizers can see it

- [ ] **Registrant detail** (`RegistrantsTable.tsx` detail view): a *Minor* badge
      next to the runner, and a *Parent/Guardian consent* block showing the
      name, relationship and time it was given. A minor with no consent on
      file (a row from before Batch 3, or a birthdate a staff member edited
      later) shows an amber "No guardian consent on file" line rather than
      nothing.
- [ ] **Printable consent:** a *Print guardian consent* action on that block
      (a print-styled view or page, **no PDF library**) with the event, the
      runner, the guardian, the time, the waiver text, and a blank signature
      line for kit claiming. It must be a real page, not a dead link.
- [ ] **CSV export:** add Guardian Name, Guardian Relationship and Guardian
      Consent At columns.
- [ ] **Runner edit modal and `api/admin/runners/[id]`:** staff can edit the
      guardian name and relationship. Add them to the audit field list in
      `audit.ts`. If an edited birthdate makes the runner a minor, **warn but
      do not block**; staff are correcting data, not registering.
- [ ] **Confirmation email** (`email.ts`): under a minor's details, add a
      "Parent/Guardian: NAME (Parent)" line.
- [ ] Optional, only if it stays small: a *Minors* option in the registrants
      table's single Filters chip, following the existing Filters sheet
      pattern rather than a new toggle chip.
- [ ] Verify at desktop and mobile widths in both dashboard themes (light and
      dark).
- [ ] `PROJECT_GUIDE.md` §6 (any new page or route), §10, and mark this plan
      finished.

**Done when:** an organizer can tell which runners are minors, see who
consented for them, export it, and print a sheet for kit claiming.

## Where it stands

- 2026-09-19: plan written. No batch started.
- 2026-09-19: **Batch 1 landed.** `src/lib/minor-consent.ts` holds the rule
  (`ageOn`, `needsGuardianConsent`, `birthdateError`,
  `participantBirthdateError`); both wizards cap the native input at
  `max={today()}` and validate through `birthdateError`; both checkout routes
  and `PUT /api/admin/runners/[id]` refuse a future birthdate (the admin route
  still lets a blank one through for older rows, and its edit modal also got
  the `max`). Next: Batch 2, the custom picker.
- 2026-09-19: **Batch 2 landed.** `register/BirthdatePicker.tsx` replaces the
  native date input in both wizards: SelectField's trigger showing the date in
  words, a Month + Year SelectField header (years back 100 from Manila's
  today), future days disabled, APG keyboard (arrows, Home/End, PageUp/PageDown
  with Shift for a year, Enter, Esc), a `.t-dropdown` popover from `sm` up and a
  portalled bottom sheet with 44px cells below it. `SelectField` gained
  `hideLabel`. Verified at 1280px and 375px on the public (dark) site with
  keyboard, mouse and touch; the card-payment wizard shares the same code but
  both live events use bank transfer, so it was type-checked rather than
  clicked. Next: Batch 3, guardian consent from form to database.
