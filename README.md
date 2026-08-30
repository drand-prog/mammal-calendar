# The Mammal Ephemeris

Search any mammal by common or scientific name to find the day, hour, and
minute a twelve-clade wheel assigns it — month by clade, date and time by the
letters of its own name.

This repo holds **two separate apps, deployed as two separate Vercel
projects**:

- **`apps/public`** — the site itself. Ships zero admin code: no login form,
  no password logic, no GitHub API calls. Anyone who reads its bundle finds
  nothing to attack.
- **`apps/admin`** — a small back-office tool. Log in, edit the site's text
  and FAQs, hit save. Nothing else lives here.

They're two different apps at two different URLs on purpose — someone
browsing the public site never downloads a byte of admin code, and the admin
tool never ships any of the ~6,760-species dataset it doesn't need.

## How it works

- **Month** comes from the mammal's clade (Primates → January, Rodentia →
  February, and so on through all twelve).
- **Day** is the first letter of the species name (A = 1st … Z = 26th).
- **Hour** is the first letter of the genus name (A = 0:00 … W = 22:00,
  X/Y/Z = 24:00).
- **Minute** is the last letter of the species name (A = :01 … Z = :26).
- Two dates are hard-coded on top of the letter rule: Groundhog Day
  (Alaska Marmot, Feb 2) and Mole Day (Large Japanese Mole, Oct 23, 6:02).
- Species data comes from the [Mammal Diversity
  Database](https://www.mammaldiversity.org/) (ASM, v2.4) — see
  `data/species.json`.

## Project layout

```
data/                          shared between both apps
  species.json                   all ~6,760 species entries (public reads only)
  faqs.json                      FAQ list — admin edits this
  content.json                   site text (title, subtitle, etc.) — admin edits this

apps/public/                   the public site — no admin code at all
  app/page.tsx                   Server Component: reads content.json, renders the page
  components/MammalCalendarApp.tsx  fills BODY_HTML's text tokens, mounts the script
  lib/bodyMarkup.ts              the page's HTML, as a string, with __TOKEN__ placeholders
  lib/appScript.js               the wheel/search/browse/FAQ-display logic

apps/admin/                    the admin tool — no wheel/species code at all
  app/page.tsx                   Server Component: reads content.json + faqs.json
  components/AdminEditor.tsx     login form + the two edit forms (client component)
  app/api/admin/
    login, logout, session/       auth endpoints
    content/route.ts               validates + commits data/content.json
    faqs/route.ts                  validates + commits data/faqs.json
  lib/auth.ts                    session-cookie scheme (HMAC of ADMIN_PASSWORD)
  lib/github.ts                  commits a data/*.json file via the GitHub REST API
```

The calendar-grid/search/browse/heatmap logic in `apps/public/lib/appScript.js` is
intentionally close to a straight port of the code's original form as a
single-file Claude Artifact — it was already built and tested there, so
later migrations changed where data comes from and how admin auth works,
not the interactive logic itself.

## How admin auth actually works

1. You set `ADMIN_PASSWORD` as an environment variable **on the admin
   project only**. It is never sent to the browser — the login form posts a
   candidate password to `/api/admin/login`, server-only code, and compares
   it there.
2. On a match, the server sets an `httpOnly` cookie (JS can't read it, only
   send it automatically). Its value is an HMAC of a fixed string keyed by
   `ADMIN_PASSWORD` — this lets the server verify a session without keeping
   a session table anywhere.
3. Saving (`/api/admin/content` or `/api/admin/faqs`) re-checks that cookie
   server-side before doing anything. A request without a valid session
   gets a 401, no matter what a visitor does in dev tools.
4. A successful save calls the GitHub REST API (using `GITHUB_TOKEN`, also
   server-only) to commit the updated file straight to `main`. Vercel's
   GitHub integration picks up that push and redeploys **both** projects —
   the admin tool refreshes its own copy of the data, and the public site
   picks up the new text/FAQs. This takes about as long as a normal deploy
   (tens of seconds), not instant.

Sharing the passphrase with someone makes them an admin; changing
`ADMIN_PASSWORD` (and telling people the new one) revokes everyone at once,
no per-user accounts to manage. If you outgrow that, the natural next step
is GitHub OAuth restricted to a username allowlist — only
`apps/admin/app/api/admin/login/route.ts` and the login form would need to
change; the public app is untouched either way.

## Deploying — two Vercel projects, one repo

1. **Push this repo to GitHub** (already done if you're reading this there).
2. **Create the public project**: [vercel.com/new](https://vercel.com/new) →
   import `drand-prog/mammal-calendar` → before deploying, expand
   **"Root Directory"** and set it to `apps/public`. No environment
   variables needed. Deploy.
3. **Create the admin project**: import the **same repo again** as a
   *second* Vercel project → set **Root Directory** to `apps/admin` → give
   it a distinct name (so it gets its own `*.vercel.app` URL, e.g.
   `mammal-calendar-admin`). Set environment variables:
   - `ADMIN_PASSWORD` — pick a real passphrase, share it only with people
     you want editing.
   - `GITHUB_TOKEN` — a [fine-grained personal access
     token](https://github.com/settings/tokens?type=beta) scoped to
     **only** this repo, with **Contents: Read and write** permission and
     nothing else.
   - `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_REPO_BRANCH` — only
     needed if you fork this elsewhere; default to `drand-prog` /
     `mammal-calendar` / `main`.
   Deploy.
4. Every push to `main` — including one the admin tool makes on your behalf
   when you hit "Save" — rebuilds **both** projects automatically.

Optionally, on the admin project, turn on Vercel's Deployment Protection
(Settings → Deployment Protection) for a second layer in front of the
password screen — not required, since the real gate is the server-side
password check, but cheap extra friction against anyone just poking at the
URL.

## Local development

Each app is independent — install and run them separately:

```bash
cd apps/public && npm install && npm run dev     # http://localhost:3000
cd apps/admin  && npm install && cp .env.example .env.local && npm run dev  # a different port
```

Fill in `ADMIN_PASSWORD` (and `GITHUB_TOKEN` if you want saves to actually
commit) in `apps/admin/.env.local` to test the admin tool locally. The
public app needs no environment variables at all.
