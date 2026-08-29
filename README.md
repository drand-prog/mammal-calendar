# The Mammal Ephemeris

Search any mammal by common or scientific name to find the day, hour, and
minute a twelve-clade wheel assigns it — month by clade, date and time by the
letters of its own name. Ported from a single-file Claude Artifact into a
real Next.js app so FAQ edits can be gated by a real server-side secret
instead of a passphrase sitting in the page's own JS.

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
app/
  page.tsx                 the whole page (renders <MammalCalendarApp/>)
  layout.tsx                fonts + <html>/<body> shell
  globals.css                all styling (ported ~1:1 from the artifact)
  api/admin/login/route.ts    checks ADMIN_PASSWORD, sets a session cookie
  api/admin/session/route.ts  reports whether the caller is logged in
  api/admin/logout/route.ts   clears the session cookie
  api/admin/faqs/route.ts     validates + commits a new FAQ list to GitHub
components/
  MammalCalendarApp.tsx      mounts the ported markup + script
lib/
  bodyMarkup.ts               the page's HTML, as a string (ported as-is)
  appScript.js                the wheel/search/browse/FAQ logic (ported as-is)
  auth.ts                     session-cookie scheme (HMAC of ADMIN_PASSWORD)
  github.ts                   commits data/faqs.json via the GitHub REST API
data/
  species.json                 all ~6,760 species entries
  faqs.json                    current FAQ list — the admin panel edits THIS file
```

The wheel/search/browse/histogram/FAQ-accordion logic in `lib/appScript.js`
is intentionally close to a straight port of the original artifact's vanilla
JS — it was already built and tested there, so the migration only changed
where the data comes from and how admin auth works, not the interactive
logic itself.

## How admin auth actually works

This is the reason for the migration, so it's worth spelling out precisely:

1. You set `ADMIN_PASSWORD` as a Vercel environment variable. It is **never
   sent to the browser** — the admin form on the page posts a candidate
   password to `/api/admin/login`, which is server-only code, and compares
   it there.
2. On a match, the server sets an `httpOnly` cookie (JS on the page can't
   read it, only send it automatically). Its value is an HMAC of a fixed
   string keyed by `ADMIN_PASSWORD` — this lets the server verify a session
   without keeping a session table anywhere.
3. Saving FAQs (`/api/admin/faqs`) re-checks that cookie server-side before
   doing anything. A visitor who never authenticated gets a 401, no matter
   what they do in the browser's dev tools.
4. A successful save calls the GitHub REST API (using `GITHUB_TOKEN`, also
   server-only) to commit the new `data/faqs.json` straight to `main`.
   Vercel's GitHub integration picks up that push and redeploys — so a save
   takes about as long as a normal deploy (tens of seconds), not instant.

Sharing the passphrase with someone makes them an admin; changing
`ADMIN_PASSWORD` in Vercel (and telling people the new one) revokes everyone
at once, no per-user accounts to manage. If you outgrow that, the natural
next step is GitHub OAuth restricted to a username allowlist — the login
route is the only thing that would need to change.

## Deploying

1. **Push this repo to GitHub** (already done if you're reading this there).
2. **Import it in Vercel**: [vercel.com/new](https://vercel.com/new) → import
   `drand-prog/mammal-calendar` → it auto-detects Next.js, no config needed.
3. **Set environment variables** in the Vercel project (Settings →
   Environment Variables), for Production (and Preview if you want previews
   to have working admin too):
   - `ADMIN_PASSWORD` — pick a real passphrase, share it only with people you
     want editing FAQs.
   - `GITHUB_TOKEN` — a [fine-grained personal access
     token](https://github.com/settings/tokens?type=beta) scoped to **only**
     this repo, with **Contents: Read and write** permission and nothing
     else. This is what lets the admin panel commit FAQ edits.
   - `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_REPO_BRANCH` — only
     needed if you fork this to a different repo; they default to
     `drand-prog` / `mammal-calendar` / `main`.
4. Redeploy (or just push again) so the new env vars take effect.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in ADMIN_PASSWORD + GITHUB_TOKEN to test admin locally
npm run dev
```

Without those two env vars set, the page itself works fully — search,
browse, the wheel, the histogram, the FAQ list. Only the admin save path
needs them.
