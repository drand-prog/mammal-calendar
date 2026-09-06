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
    orders.json                    the 51 groups' month assignments (45 orders + 6 Passeriformes clades) — bird-admin edits this
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

  animals/                        animal family data, shared between apps/animals-public and apps/animals-admin
    families.json                   all 13,030 non-chordate family entries (public reads only)
    orders.json                     the 12 groups' month assignments — animals-admin edits this
    faqs.json                       FAQ list — animals-admin edits this
    content.json                    site text — animals-admin edits this

apps/animals-public/, apps/animals-admin/   mirror apps/public and apps/admin,
                                       reading/writing data/animals/*.json
                                       instead, at FAMILY rank rather than
                                       species — see "The Animal Family
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

**Known quirk — rapid admin saves can stall auto-deploy.** A burst of many
admin-panel saves in quick succession (each one its own commit + push) has
twice left a public project's Production deployment silently pinned several
commits behind `main`, with no error shown anywhere — Vercel just stops
picking up the webhook events partway through the burst. If a public site
looks stale after a flurry of admin edits, check the project's Deployments
tab: if the top "Production" row's commit hash is older than `main`'s tip,
that's this. The fix is any new push (even an unrelated one, to any of the
four apps) — it builds off the *current* tip of `main`, so it catches up
every skipped commit at once, not just the newest one.

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
and done. Birds split into 46 taxonomic orders — there's no natural 1-to-1
mapping onto 12 months — and `Passeriformes` (songbirds and other perching
birds) alone accounts for 61% of all 10,928 species, so a plain per-order
split would still dump three out of every five birds into whatever month
got Passeriformes.

`data/bird/orders.json` fixes that by not treating Passeriformes as one
group: it's split into its six deepest evolutionary lineages (Tyranni,
the basal Australasian radiation, Corvides, Muscicapida, Sylviida, and
Passerida — see [Oliveros et al. 2019](https://doi.org/10.1073/pnas.1813206116)),
each assignable to its own month like any other order. That makes **51
groups** in total (45 remaining orders + 6 Passeriformes clades), every one
starting with `month` set to `null`. **A species doesn't appear anywhere on
the public calendar — search excepted — until its group has been assigned
one**, in `apps/bird-admin`'s "Order months" section. Assign a few,
redeploy, and those species' days start filling in; the calendar fills in
gradually as more groups get placed, rather than needing all 51 decided up
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

## The Animal Family Ephemeris

Search any non-chordate animal family by common or scientific name to find
the day, hour, and minute it's assigned — month by group, date and time by
the letters of its own name. Built the same way as the mammal and bird
calendars above, at a different taxonomic rank: **family**, not species.

### Why family rank, and why 12 phylum/class groups

Mammals and birds are covered by their own separate calendars already, so
this one deliberately excludes Chordata entirely and covers everything
else in Kingdom Animalia — sponges, jellyfish, insects, crustaceans,
mollusks, worms of every unrelated phylum, sea stars, and dozens of much
obscurer groups. At **species** rank that's millions of rows spanning wildly
uneven research coverage; **family** rank keeps it to a tractable, complete
13,030 entries pulled straight from GBIF's backbone taxonomy, with no
species epithet in the letter math the way mammal/bird/reptile have — day,
hour, and minute all run on the family name itself.

Non-chordate animal families don't split into a natural 12-month scheme
any more cleanly than birds' 46 orders did, so `data/animals/orders.json`
defines its own 12 groups by phylum and class, sized to keep any one group
from dominating the calendar the way Passeriformes dominates birds:

| Group | Families |
|---|---:|
| Porifera + Ctenophora + Placozoa | 573 |
| Cnidaria | 810 |
| Insecta | 2,774 |
| Crustacea | 1,612 |
| All other Arthropoda | 1,801 |
| Tardigrada + Onychophora | 40 |
| Cycloneuralia | 341 |
| Mollusca | 2,287 |
| Annelida | 221 |
| Platyhelminthes | 518 |
| Xenacoelomorpha + Echinodermata + Hemichordata | 903 |
| All other Spiralia | 1,150 |

See `PHYLUM_TO_GROUP` in `scripts/build_animal_families_from_backbone.py`
for exactly how each family was resolved to a group, including the
real-data fixes found after the first live run (Tantulocarida folded into
Crustacea; Sipuncula into Annelida; Dicyemida and Orthonectida into "All
other Spiralia"). Every group starts with `month` set to `null` — same
gradual-fill-in model as the bird calendar's "Order months" — so a family
doesn't appear on the public calendar until its group is assigned a month
in `apps/animals-admin`.

### How it works

- **Month** comes from the family's group, once assigned (animals-admin →
  Group months).
- **Day** comes from the family name's first letter (A = 1st … Z = 26th),
  unless the name contains one of nine rarer letter patterns anywhere in
  it — a bare Q/X/Y/Z, or a doubled N/O/P/R/S — in which case that pattern
  wins outright, reaching days a single starting letter can't. Same rule as
  the reptile/amphibian calendar.
- **Hour** and **minute** both come from adding up the letter values
  (A=1…Z=26) of every letter after the first, then splitting that sum's
  digits — the last digit is the minute, whatever's left is the hour, wrapped
  with `% 24` since family names run long enough (up to 25 letters, e.g.
  *Parallelepipedorhynchidae*) to occasionally overflow a 24-hour clock
  otherwise.
- Common names are derived, not hand-curated: for families with no common
  name of their own, the build script looks at the common names of the
  family's member species (when GBIF's vernacular-names data has any) and
  "borrows" the most frequent last word across them — the same trick the
  flowering-plant-genera calendar uses to derive genus-level common names
  from species names. A family with no derivable common name at all falls
  back to displaying its scientific name for both.
- Family and species data comes from [GBIF's backbone
  taxonomy](https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c)
  — see `scripts/build_animal_families_from_backbone.py` for exactly how
  the 13,030 families and their common names were built; see
  `data/animals/families.json`.
