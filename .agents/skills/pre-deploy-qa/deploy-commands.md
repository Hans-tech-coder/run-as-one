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

```powershell
$env:DIRECT_URL = "<production direct connection string>"
npx prisma migrate status
```

`migrate status` names the host it connected to. It must say `ep-still-pine-b3n210bs`
and list the new migration as not yet applied. Then:

```powershell
npx prisma migrate deploy
Remove-Item Env:DIRECT_URL
```

Migrate **before** pushing `main`: the new code expects the new columns, and the old
code still running meanwhile ignores extra ones. If a migration drops or renames
something, the QA report says so and gives a different order.

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
- Open `https://run-as-one.cresendorunningcommunity.com`: home, one event page, and its
  register page load. Do not finish a registration there; it would be a real order.
- Tell Claude "na-deploy na" (and whether the migration ran).
