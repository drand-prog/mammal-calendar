# The Ephemeris repo

This repo holds **two products, each shipped as its own public/admin pair
of Vercel projects (four projects total)**, sharing one repo and one
deploy-on-push-to-`main` workflow:

- **The Mammal Ephemeris** (`apps/public` + `apps/admin`, data in
  `data/*.json`) — described below.
- **The Bird Ephemeris** (`apps/bird-public` + `apps/bird-admin`, data in
  `data/bird/*.json`) — described in [its own
  section](#the-bird-ephemeris) further down.

Within each product, the public/admin split is the same:

- **`apps/public`** (or `bird-public`) — the site itself. Ships zero admin
  code: no login form, no password logic, no GitHub API calls. Anyone who
  reads its bundle finds nothing to attack.
- **`apps/admin`** (or `bird-admin`) — a small back-office tool. Log in,
  edit the site's text and FAQs, hit save. Nothing else lives here.

They're two different apps at two different URLs on purpose — someone
browsing a public site never downloads a byte of admin code, and an admin
tool never ships any of the species dataset it doesn't need.

## The Mammal Ephemeris

Search any mammal by common or scientific name to find the day, hour, and
minute a twelve-clade wheel assigns it — month by clade, date and time by the
letters of its own name.

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
data/                          mammal data, shared between apps/public and apps/admin
  species.json                   all ~6,760 species entries (public reads only)
  faqs.json                      FAQ list — admin edits this
  content.json                   site text (title, subtitle, etc.) — admin edits this
  bird/                          bird data, shared between apps/bird-public and apps/bird-admin
    species.json                   all 10,928 species entries (public reads only)
    orders.json                    the 46 orders' month assignments — bird-admin edits this
    faqs.json                      FAQ list — bird-admin edits this
    content.json                   site text — bird-admin edits this

apps/public/                   the mammal public site — no admin code at all
  app/page.tsx                   Server Component: reads content.json, renders the page
  components/MammalCalendarApp.tsx  fills BODY_HTML's text tokens, mounts the script
  lib/bodyMarkup.ts              the page's HTML, as a string, with __TOKEN__ placeholders
  lib/appScript.js               the wheel/search/browse/FAQ-display logic

apps/admin/                    the mammal admin tool — no wheel/species code at all
  app/page.tsx                   Server Component: reads content.json + faqs.json
  components/AdminEditor.tsx     login form + the two edit forms (client component)
  app/api/admin/
    login, logout, session/       auth endpoints
    content/route.ts               validates + commits data/content.json
    faqs/route.ts                  validates + commits data/faqs.json
  lib/auth.ts                    session-cookie scheme (HMAC of ADMIN_PASSWORD)
  lib/github.ts                  commits a data/*.json file via the GitHub REST API

apps/bird-public/, apps/bird-admin/   mirror the two above, reading/writing
                                       data/bird/*.json instead — see "The Bird
                                       Ephemeris" section below for what differs
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

## Deploying — four Vercel projects, one repo

Each of the four apps (`apps/public`, `apps/admin`, `apps/bird-public`,
`apps/bird-admin`) is its own Vercel project pointed at this same repo,
distinguished only by **Root Directory**:

1. **Push this repo to GitHub** (already done if you're reading this there).
2. **Create the mammal public project**: [vercel.com/new](https://vercel.com/new)
   → import `drand-prog/mammal-calendar` → set **Root Directory** to
   `apps/public`. No environment variables needed. Deploy.
3. **Create the mammal admin project**: import the **same repo again** as a
   *second* Vercel project → set **Root Directory** to `apps/admin` → give
   it a distinct name (e.g. `mammal-calendar-admin`). Set environment
   variables:
   - `ADMIN_PASSWORD` — pick a real passphrase, share it only with people
     you want editing.
   - `GITHUB_TOKEN` — a [fine-grained personal access
     token](https://github.com/settings/tokens?type=beta) scoped to
     **only** this repo, with **Contents: Read and write** permission and
     nothing else. (The same token works for both admin projects — it's
     scoped to the repo, not to a folder within it.)
   - `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_REPO_BRANCH` — only
     needed if you fork this elsewhere; default to `drand-prog` /
     `mammal-calendar` / `main`.
   Deploy.
4. **Create the bird public project**: import the repo a *third* time →
   Root Directory `apps/bird-public` → no environment variables. Deploy.
5. **Create the bird admin project**: import the repo a *fourth* time →
   Root Directory `apps/bird-admin` → give it a distinct name (e.g.
   `bird-calendar-admin`) → same three environment variables as step 3
   (a separate `ADMIN_PASSWORD` if you want mammal and bird editors to be
   different people, or the same one). Deploy.
6. Every push to `main` — including one either admin tool makes on your
   behalf when you hit "Save" — rebuilds **all four** projects
   automatically. (Vercel only serves a project's own Root Directory build
   output, so a bird-admin save doesn't redeploy anything mammal-related in
   any way a visitor would notice — it just costs an extra few seconds of
   Vercel build time across the other three.)

Optionally, on either admin project, turn on Vercel's Deployment Protection
(Settings → Deployment Protection) for a second layer in front of the
password screen — not required, since the real gate is the server-side
password check, but cheap extra friction against anyone just poking at the
URL.

## Local development

Each app is independent — install and run them separately:

```bash
cd apps/public      && npm install && npm run dev     # http://localhost:3000
cd apps/admin       && npm install && cp .env.example .env.local && npm run dev  # a different port
cd apps/bird-public && npm install && npm run dev
cd apps/bird-admin  && npm install && cp .env.example .env.local && npm run dev
```

Fill in `ADMIN_PASSWORD` (and `GITHUB_TOKEN` if you want saves to actually
commit) in `apps/admin/.env.local` or `apps/bird-admin/.env.local` to test
an admin tool locally. Both public apps need no environment variables at
all.

## The Bird Ephemeris

Search any bird by common or scientific name to find the day, hour, and
minute it's assigned — month by taxonomic order, date and time by the
letters of its own name. Built the same way as the mammal calendar above,
for a taxon that doesn't split as neatly into twelve.

### Why this one needs an admin step the mammal calendar didn't

Mammals split cleanly into 12 major clades, one per month, hard-coded once
and done. Birds split into **46 taxonomic orders** — there's no natural
1-to-1 mapping onto 12 months, and `Passeriformes` (songbirds and other
perching birds) alone accounts for 61% of all 10,928 species, so however
the 46 get grouped, it won't be an even split either.

Rather than guess at a grouping, `data/bird/orders.json` starts with every
order's `month` set to `null`, and **a species doesn't appear anywhere on
the public calendar — search excepted — until its order has been assigned
one**, in `apps/bird-admin`'s "Order months" section. Assign a few,
redeploy, and those species' days start filling in; the calendar fills in
gradually as more orders get placed, rather than needing all 46 decided up
front.

### How it works

- **Month** comes from the bird's order, once assigned (bird-admin → Order
  months).
- **Day** is the first letter of the species name (A = 1st … Z = 26th). A
  handful of names starting "AA" through "AE" read that pair as an overflow
  code reaching the 27th–31st, for months long enough to have those days —
  same rule as the mammal calendar.
- **Hour** and **minute** both come from adding up the letter values
  (A=1…Z=26) of the rest of the species name and splitting that sum's
  digits — the last digit is the minute, whatever's left is the hour.
- Species data comes from [AviList: The Global Avian
  Checklist](https://www.avilist.org/), v2025b (June 2025) — the taxonomy
  the IOC World Bird List, Clements/eBird, and BirdLife/HBW jointly adopted
  to replace their three separate lists. Covers the 10,928 currently-
  recognized extant species; see `data/bird/species.json`. (AviList also
  tracks 146 recently extinct species, not currently included — could be
  added as a memorial set the way the mammal calendar keeps two.)

### How the "Order months" save works

Same session/commit scheme as the rest of the admin tools (see "How admin
auth actually works" above), with one added safeguard: the save request
only ever sends *which month each order maps to* (by index) — never an
order's name, formal name, or species count. The server loads its own copy
of `data/bird/orders.json`, overwrites just the `month` field per order,
and commits that — so a tampered request can change what month an order is
assigned to and nothing else.
