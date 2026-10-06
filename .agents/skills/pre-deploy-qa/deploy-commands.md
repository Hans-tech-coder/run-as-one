# Deploy to production: commands for the owner (PowerShell)

The owner promotes `dev` to `main` by hand. Claude hands these over after a **GO**,
says whether the release carries a migration, and waits. A push to `main` ships to
production on Vercel with no further step.

Run everything in the main checkout:

```powershell
cd "C:\Users\user\Web Projects\run-as-one"
```

## 1. Check what ships

```powershell
git status
git push origin dev
git fetch origin
git log --oneline origin/main..dev
git diff --name-only origin/main..dev -- prisma/migrations
```

`git status` must be clean. If the last command prints nothing, there is no migration:
skip to step 3.

## 2. Only if there is a migration: migrate production first

Take the **direct** (not pooled) connection string of the production branch from
the Neon console: branch `dev`, endpoint `ep-still-pine-b3n210bs`. It is set for this
terminal only; `.env` is not touched, and a variable set here wins over `.env`.

Use **single quotes** (a `$` in the password is expanded inside double quotes) and
only the `postgresql://…` string itself (Neon's copy button can wrap it in
`psql '…'`, which fails with P1013). Check it before running anything:

```powershell
$env:DIRECT_URL = '<production direct connection string>'
$env:DIRECT_URL -match 'ep-still-pine-b3n210bs\.' -and $env:DIRECT_URL -notmatch '-pooler'
npx prisma migrate status
```

The check must print `True`. `migrate status` names the host it connected to and
lists the migrations not yet applied. Then:

```powershell
npx prisma migrate deploy
Remove-Item Env:DIRECT_URL
```

Migrate **before** pushing `main`: the new code expects the new columns, and the old
code still running meanwhile ignores extra ones.

**If a migration drops or renames a column the live code still reads**, a bare
`migrate deploy` breaks the live site until the new deploy is Ready. Postpone that
one migration (expand, then contract — first used on 2026-09-30 for
`retire_super_admin`):

1. Back up first: a Neon branch from production, auto-delete after 7 days.
2. `npx prisma migrate resolve --applied <destructive_migration>` — recorded, not run.
3. `npx prisma migrate deploy` — applies the others; the live code keeps working.
4. Promote `main` (step 3 below) and check the live site. Instant Rollback still
   works here, since the old columns are still there.
5. Only then: `npx prisma db execute --file prisma/migrations/<destructive_migration>/migration.sql`,
   then `npx prisma migrate status` should report up to date. From here, rolling
   back the code no longer works; the Neon backup is the way back.

## 3. Promote `main`

```powershell
git checkout main
git pull --ff-only origin main
git merge --ff-only dev
git push origin main
git checkout dev
```

If `merge --ff-only` refuses, stop: `main` has a commit `dev` lacks. Tell Claude.
(Promoting from this local checkout also keeps local `main` equal to production, which
the Strix scan clone uses as its diff base.)

## 4. After

- Vercel dashboard → project `run-as-one` → the new Production deployment reaches **Ready**.
- Open `https://runasone.ph`: home, one event page, and its
  register page load. Do not finish a registration there; it would be a real order.
- Tell Claude "na-deploy na" (and whether the migration ran).
