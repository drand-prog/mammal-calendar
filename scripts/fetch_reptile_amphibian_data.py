#!/usr/bin/env python3
"""
Fetch reptile + amphibian species from GBIF's backbone taxonomy and sort
them into the 12 groups decided for The Reptile & Amphibian Ephemeris.

Three real bugs got worked out against live api.gbif.org diagnostics before
landing on this approach (see git history if curious):

  1. species/search's free-text `q=` matching isn't a reliable way to find a
     taxon's backbone usageKey -- it can match names from other checklists
     in GBIF's Checklist Bank, and even with a dataset filter added it can
     still fail to surface an exact match. GBIF has a purpose-built endpoint
     for exactly this, species/match (their name-to-backbone-taxon
     resolver), which is what resolve_backbone_key uses instead.

  2. GBIF's backbone doesn't model "Dibamia", "Scincoidea", "Lacertoidea",
     "Anguimorpha", "Iguania", "Ranoidea", or "Hyloidea" as named taxa of
     their own -- those are cladistic groupings above family rank that
     GBIF's backbone simply doesn't carry for these lineages. Family is the
     lowest rank GBIF is guaranteed to model reliably, so instead of
     resolving each clade by name, this fetches every species under
     Squamata and under Anura just once each and sorts them into a group by
     each species' own `family` field, via the FAMILY_TO_GROUP lookup below.

  3. GBIF's backbone has a real quirk where Testudines and Squamata are
     modeled as CLASS rank rather than ORDER -- its way of avoiding a
     paraphyletic "Reptilia" -- while Anura/Caudata/Gymnophiona are normal
     ORDER rank under Amphibia. resolve_backbone_key doesn't require or
     enforce an expected rank because of this; it trusts whatever rank
     species/match reports back.

  4. Once a genuinely correct backbone usageKey is in hand, adding a
     datasetKey filter to the species-fetch call drops the result count to
     zero anyway -- confirmed live, even for species whose own JSON reports
     that exact datasetKey. fetch_species_under intentionally filters by
     highertaxonKey alone; see its docstring before changing that.

Groups (see FAMILY_TO_GROUP for exactly which families land where):

  Tortoises/turtles   -> Testudines, in full
  Crocodilians        -> Crocodylia, in full
  Snakes              -> Squamata families in SNAKE_FAMILIES
  Geckos & skinks     -> Squamata families in GECKO_SKINK_FAMILIES
  Tejus & monitors    -> Squamata families in TEJU_MONITOR_FAMILIES
                         (includes the amphisbaenian/worm-lizard families --
                         modern phylogenies place Amphisbaenia within
                         Lacertoidea, sister to Lacertidae)
  Iguanas             -> Squamata families in IGUANA_FAMILIES
  Chameleons          -> family Chamaeleonidae
  Old World frogs     -> Anura families in RANOIDEA_FAMILIES
  New World frogs     -> Anura families in HYLOIDEA_FAMILIES
  All other frogs     -> every other Anura family (the catch-all -- no list
                         needed, it's just "didn't match the other two")
  Salamanders         -> order Caudata, in full
  Caecilians          -> order Gymnophiona, in full

Any Squamata or Anura family NOT found in these lists is NOT silently
dropped -- it's reported at the end as "unmapped" so a spelling mismatch or
a genuinely new/renamed family doesn't just vanish from the dataset.

NOT covered by any group above: the tuatara (Rhynchocephalia, 1 species) --
see the app's own tracked reminder to give it special (Leap Day) treatment
rather than a group of its own.

Requires only the `requests`-free standard library and outgoing internet
access to api.gbif.org (no API key, no signup):

    python3 scripts/fetch_reptile_amphibian_data.py

Writes:
    data/reptile/species.json   [[commonName, Genus, species, groupIndex], ...]
    data/reptile/orders.json    [{name, formal, count, month: null}, ...]

Common names: GBIF is a taxonomic database first, not a common-names
registry, and most reptile/amphibian species -- especially amphibians --
simply don't have one anywhere. This script tries GBIF's own vernacular-name
endpoint (English only) and falls back to the scientific binomial when
nothing turns up. Expect a lot of fallbacks; a manual pass afterward (or an
admin-panel bulk edit) is realistic, not a sign something broke.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://api.gbif.org/v1"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "reptile")

# Set to False for a fast first pass with no common names (everything falls
# back to its scientific binomial) -- useful to sanity-check group counts
# before committing to the slow per-species vernacular-name lookup below.
FETCH_COMMON_NAMES = True
COMMON_NAME_WORKERS = 16

# Group indices, for readability in the family tables below.
G_SNAKES, G_GECKO_SKINK, G_TEJU_MONITOR, G_IGUANA, G_CHAMELEON = 2, 3, 4, 5, 6
G_OLD_WORLD_FROG, G_NEW_WORLD_FROG = 7, 8

GROUPS = [
    ("Tortoises/turtles", "Testudines"),
    ("Crocodilians", "Crocodylia"),
    ("Snakes", "Serpentes (Squamata families)"),
    ("Geckos & skinks", "Dibamia + Gekkota + Scincoidea (Squamata families)"),
    ("Tejus & monitors", "Lacertoidea + Anguimorpha (Squamata families)"),
    ("Iguanas", "Iguania minus Chamaeleonidae (Squamata families)"),
    ("Chameleons", "Chamaeleonidae"),
    ("Old World frogs", "Ranoidea (Anura families)"),
    ("New World frogs", "Hyloidea (Anura families)"),
    ("All other frogs", "Anura (all other families)"),
    ("Salamanders", "Caudata"),
    ("Caecilians", "Gymnophiona"),
]

# Family -> group index, for every species fetched under order Squamata.
SNAKE_FAMILIES = {
    "Acrochordidae", "Aniliidae", "Anomochilidae", "Boidae", "Calabariidae",
    "Sanziniidae", "Bolyeriidae", "Colubridae", "Dipsadidae", "Natricidae",
    "Pseudoxenodontidae", "Cylindrophiidae", "Elapidae", "Homalopsidae",
    "Lamprophiidae", "Atractaspididae", "Psammophiidae", "Prosymnidae",
    "Pseudaspididae", "Loxocemidae", "Pareidae", "Pythonidae",
    "Tropidophiidae", "Uropeltidae", "Viperidae", "Crotalidae",
    "Xenodermidae", "Xenopeltidae", "Anomalepididae", "Gerrhopilidae",
    "Leptotyphlopidae", "Typhlopidae", "Xenotyphlopidae",
    # Found live as "unmapped" on the first full run -- all three are real,
    # legitimate snake families the initial list simply missed.
    "Pseudoxyrhophiidae",  # Malagasy snakes
    "Cyclocoridae",        # Philippine snakes, recently split out
    "Xenophidiidae",       # spine-jawed snakes
}
GECKO_SKINK_FAMILIES = {
    "Carphodactylidae", "Dibamidae", "Diplodactylidae", "Eublepharidae",
    "Gekkonidae", "Phyllodactylidae", "Pygopodidae", "Sphaerodactylidae",
    "Cordylidae", "Gerrhosauridae", "Scincidae", "Xantusiidae",
}
TEJU_MONITOR_FAMILIES = {
    "Alopoglossidae", "Gymnophthalmidae", "Lacertidae", "Teiidae",
    "Anguidae", "Anniellidae", "Diploglossidae", "Helodermatidae",
    "Lanthanotidae", "Shinisauridae", "Varanidae", "Xenosauridae",
    # Amphisbaenia -- modern phylogenies place worm lizards within
    # Lacertoidea, sister to Lacertidae.
    "Amphisbaenidae", "Bipedidae", "Blanidae", "Cadeidae", "Rhineuridae",
    "Trogonophidae",
}
IGUANA_FAMILIES = {
    "Agamidae", "Corytophanidae", "Crotaphytidae", "Dactyloidae",
    "Hoplocercidae", "Iguanidae", "Leiocephalidae", "Leiosauridae",
    "Liolaemidae", "Opluridae", "Phrynosomatidae", "Polychrotidae",
    "Tropiduridae",
    # Chamaeleonidae deliberately excluded -- it's its own group below.
}
CHAMELEON_FAMILY = "Chamaeleonidae"

SQUAMATA_FAMILY_TO_GROUP = {}
for fam in SNAKE_FAMILIES:
    SQUAMATA_FAMILY_TO_GROUP[fam] = G_SNAKES
for fam in GECKO_SKINK_FAMILIES:
    SQUAMATA_FAMILY_TO_GROUP[fam] = G_GECKO_SKINK
for fam in TEJU_MONITOR_FAMILIES:
    SQUAMATA_FAMILY_TO_GROUP[fam] = G_TEJU_MONITOR
for fam in IGUANA_FAMILIES:
    SQUAMATA_FAMILY_TO_GROUP[fam] = G_IGUANA
SQUAMATA_FAMILY_TO_GROUP[CHAMELEON_FAMILY] = G_CHAMELEON

# Family -> group index, for every species fetched under order Anura.
RANOIDEA_FAMILIES = {
    "Arthroleptidae", "Brevicipitidae", "Ceratobatrachidae", "Conrauidae",
    "Dicroglossidae", "Hemisotidae", "Hyperoliidae", "Mantellidae",
    "Microhylidae", "Micrixalidae", "Nyctibatrachidae", "Odontobatrachidae",
    "Petropedetidae", "Phrynobatrachidae", "Ptychadenidae", "Pyxicephalidae",
    "Ranidae", "Ranixalidae", "Rhacophoridae",
}
HYLOIDEA_FAMILIES = {
    "Allophrynidae", "Alsodidae", "Batrachylidae", "Bufonidae",
    "Centrolenidae", "Ceratophryidae", "Craugastoridae", "Cycloramphidae",
    "Dendrobatidae", "Eleutherodactylidae", "Hemiphractidae", "Hylidae",
    "Hylodidae", "Leptodactylidae", "Odontophrynidae", "Rhinodermatidae",
    "Telmatobiidae", "Brachycephalidae",
}
ANURA_FAMILY_TO_GROUP = {}
for fam in RANOIDEA_FAMILIES:
    ANURA_FAMILY_TO_GROUP[fam] = G_OLD_WORLD_FROG
for fam in HYLOIDEA_FAMILIES:
    ANURA_FAMILY_TO_GROUP[fam] = G_NEW_WORLD_FROG
G_ALL_OTHER_FROGS = 9


DEBUG_HTTP = os.environ.get("GBIF_DEBUG") == "1"


def get_json(url, params=None, retries=8):
    """GET with real resilience: this run has twice been killed outright by
    a transient Codespace network timeout (confirmed live -- not a GBIF
    outage, since the very next attempt or a plain re-run always worked).
    With ~21,500 species' worth of vernacular-name lookups ahead, a blip
    lasting even a minute or two is inevitable and shouldn't torch the
    whole run: 8 attempts with capped exponential backoff (2/4/8/16/30/30/30s)
    rides out far longer outages than the original 3-attempt/short-backoff
    version did.
    """
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    if DEBUG_HTTP:
        print(f"  [GBIF_DEBUG] GET {url}", file=sys.stderr)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mammal-calendar-fetch-script/2.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                body = resp.read()
                data = json.loads(body)
                if DEBUG_HTTP:
                    preview = body[:500].decode("utf-8", "replace")
                    print(f"  [GBIF_DEBUG] response count={data.get('count')} preview={preview}", file=sys.stderr)
                return data
        except Exception as e:
            if attempt == retries - 1:
                raise
            delay = min(30, 2 ** (attempt + 1))
            print(f"  [retry] {e!r} -- retrying in {delay}s (attempt {attempt + 1}/{retries})", file=sys.stderr)
            time.sleep(delay)


def resolve_backbone_key(name, rank=None):
    """Find the GBIF Backbone Taxonomy usageKey for a name, via GBIF's
    purpose-built name-resolution endpoint rather than free-text search.

    Deliberately does NOT require a specific expected rank by default:
    GBIF's backbone has a real quirk where Testudines and Squamata are
    modeled as CLASS rank rather than ORDER (its way of avoiding a
    paraphyletic "Reptilia"), while Anura/Caudata/Gymnophiona are normal
    ORDER rank under Amphibia. Whatever rank comes back, the usageKey is
    what matters for the highertaxonKey lookup that follows -- so it's
    printed for visibility, not enforced.

    Default query passes kingdom=Animalia as a disambiguating hint: "Anura"
    alone is a homonym (GBIF has multiple unrelated taxa by that name
    across different kingdoms), so species/match returns matchType=NONE
    with a "Multiple equal matches" note without it -- confirmed live.

    BUT for "Anura" specifically, adding kingdom=Animalia overcorrects: it
    comes back as matchType=HIGHERRANK against kingdom Animalia itself
    (usageKey 1) rather than the order -- also confirmed live. The rank=
    override param exists for this one case: passing rank="order" (with
    neither kingdom nor strict) is the exact query shape proven to return
    a clean matchType=EXACT for Anura (usageKey 952) in this script's very
    first live diagnostic. Only pass it where a plain kingdom hint has
    already been shown to fail for that specific name.
    """
    if rank:
        params = {"name": name, "rank": rank}
    else:
        params = {"name": name, "kingdom": "Animalia", "strict": "true"}
    data = get_json(f"{API}/species/match", params)
    if data.get("matchType") != "EXACT" or data.get("status") != "ACCEPTED" or "usageKey" not in data:
        raise RuntimeError(f"Could not confidently resolve '{name}' via GBIF species/match: {data}")
    print(f"  resolved '{name}' -> usageKey {data['usageKey']} (rank: {data.get('rank')})", file=sys.stderr)
    return data["usageKey"]


def fetch_species_under(taxon_key):
    """All accepted, species-rank taxa under a given backbone key. Returns a
    list of dicts: genus, species, family.

    Deliberately does NOT filter by datasetKey, even though taxon_key comes
    from the backbone: confirmed live that adding datasetKey=<backbone key>
    here drops the result count to zero, even for species records that
    themselves report that exact datasetKey in their own JSON. Whatever the
    precise mechanics of GBIF's index are, highertaxonKey alone is what
    actually works -- don't add datasetKey back in without re-verifying
    against a live query first.
    """
    out = []
    offset = 0
    limit = 300
    while True:
        data = get_json(
            f"{API}/species/search",
            {
                "highertaxonKey": taxon_key,
                "rank": "SPECIES",
                "status": "ACCEPTED",
                "limit": limit,
                "offset": offset,
            },
        )
        for r in data["results"]:
            # GBIF's backbone mixes fossil/extinct taxa into ORDER/CLASS
            # counts alongside currently-living ones (confirmed live:
            # Testudines came back with 1,136 "ACCEPTED" species, ~3x the
            # commonly-cited ~360 living turtle species). Every record
            # carries its own extinct flag -- skip anything marked true.
            # Missing/null is treated as extant rather than dropped.
            if r.get("extinct") is True:
                continue
            genus = r.get("genus")
            # GBIF's species/search results have no "specificEpithet" field
            # (confirmed live -- it's simply absent from the JSON, not just
            # empty). The "species" field holds the full "Genus epithet"
            # binomial instead, so the epithet has to be split back out.
            full_name = r.get("species") or r.get("canonicalName")
            family = r.get("family")
            if not genus or not full_name:
                continue
            if full_name.startswith(genus + " "):
                epithet = full_name[len(genus) + 1:].strip()
            else:
                parts = full_name.split(" ", 1)
                epithet = parts[1].strip() if len(parts) > 1 else None
            if not epithet:
                continue
            out.append({"key": r["key"], "genus": genus, "species": epithet, "family": family})
        offset += limit
        if data.get("endOfRecords") or offset >= data.get("count", 0):
            break
    return out


def fetch_common_name(usage_key):
    try:
        data = get_json(f"{API}/species/{usage_key}/vernacularNames")
    except Exception:
        return None
    best = None
    for v in data.get("results", []):
        if v.get("language") != "eng":
            continue
        if v.get("preferred"):
            return v["vernacularName"]
        if best is None:
            best = v["vernacularName"]
    return best


def attach_common_names(species_list):
    """Mutates each dict in species_list, adding a 'common' key."""
    if not FETCH_COMMON_NAMES or not species_list:
        for sp in species_list:
            sp["common"] = f"{sp['genus']} {sp['species']}"
        return
    with ThreadPoolExecutor(max_workers=COMMON_NAME_WORKERS) as pool:
        futures = {pool.submit(fetch_common_name, sp["key"]): sp for sp in species_list}
        for fut in as_completed(futures):
            sp = futures[fut]
            try:
                sp["common"] = fut.result() or f"{sp['genus']} {sp['species']}"
            except Exception:
                sp["common"] = f"{sp['genus']} {sp['species']}"


def write_output(bucketed, counts, unmapped_families, complete):
    """Writes whatever has been fetched so far. Called both on a normal
    finish and (via main's finally block) after any exception, so a crash
    partway through a multi-hour run leaves real, partial data on disk
    instead of nothing at all."""
    if unmapped_families:
        print("\n!! Unmapped Squamata families (species skipped, not silently lost -- fix the", file=sys.stderr)
        print("!! family lists above and re-run):", file=sys.stderr)
        for fam, n in sorted(unmapped_families.items(), key=lambda kv: -kv[1]):
            print(f"    {fam}: {n} species", file=sys.stderr)

    all_species = []
    for group_idx, species_list in enumerate(bucketed):
        for sp in species_list:
            # "common" is only present once attach_common_names has run for
            # that group; a group killed mid-fetch may hold raw dicts still.
            common = sp.get("common", f"{sp['genus']} {sp['species']}")
            all_species.append([common, sp["genus"], sp["species"], group_idx])

    orders = [
        {"name": name, "formal": formal, "count": counts[i], "month": None}
        for i, (name, formal) in enumerate(GROUPS)
    ]

    species_path = os.path.join(OUT_DIR, "species.json")
    orders_path = os.path.join(OUT_DIR, "orders.json")
    with open(species_path, "w") as f:
        json.dump(all_species, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(orders_path, "w") as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)
        f.write("\n")

    status = "Wrote" if complete else "PARTIAL run -- wrote"
    print(f"\n{status} {len(all_species)} species to {species_path}", file=sys.stderr)
    print(f"Wrote {len(orders)} groups (counts only reflect what finished) to {orders_path}", file=sys.stderr)
    missing_common = sum(1 for s in all_species if s[0] == f"{s[1]} {s[2]}")
    print(
        f"{missing_common} of {len(all_species)} species have no common name "
        f"and fell back to their scientific binomial.",
        file=sys.stderr,
    )
    if not complete:
        print("\nRe-run the script to pick up where this left off is NOT automatic --", file=sys.stderr)
        print("it starts over from Testudines. But the data above is real; if the", file=sys.stderr)
        print("failure was a transient network blip, just try again.", file=sys.stderr)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    counts = [0] * len(GROUPS)
    bucketed = [[] for _ in GROUPS]
    unmapped_families = {}

    try:
        # ---- simple order-level groups ----
        for group_idx, order_name in [(0, "Testudines"), (1, "Crocodylia"), (10, "Caudata"), (11, "Gymnophiona")]:
            print(f"=== {GROUPS[group_idx][0]} ({order_name}) ===", file=sys.stderr)
            key = resolve_backbone_key(order_name)
            species_list = fetch_species_under(key)
            print(f"  {len(species_list)} species", file=sys.stderr)
            # Record before attaching common names: if attach_common_names is
            # interrupted partway through, these species (sans real common
            # names for whichever weren't done yet) are still saved rather
            # than lost entirely.
            bucketed[group_idx] = species_list
            counts[group_idx] = len(species_list)
            attach_common_names(species_list)

        # ---- Squamata, bucketed by family ----
        print("=== Squamata (bucketing by family) ===", file=sys.stderr)
        squamata_key = resolve_backbone_key("Squamata")
        squamata = fetch_species_under(squamata_key)
        print(f"  {len(squamata)} total Squamata species", file=sys.stderr)
        for sp in squamata:
            fam = sp["family"]
            group_idx = SQUAMATA_FAMILY_TO_GROUP.get(fam)
            if group_idx is None:
                unmapped_families.setdefault(fam, 0)
                unmapped_families[fam] += 1
                continue
            bucketed[group_idx].append(sp)
        for group_idx in (G_SNAKES, G_GECKO_SKINK, G_TEJU_MONITOR, G_IGUANA, G_CHAMELEON):
            print(f"  -> {GROUPS[group_idx][0]}: {len(bucketed[group_idx])} species", file=sys.stderr)
            attach_common_names(bucketed[group_idx])
            counts[group_idx] = len(bucketed[group_idx])

        # ---- Anura, bucketed by family ----
        print("=== Anura (bucketing by family) ===", file=sys.stderr)
        anura_key = resolve_backbone_key("Anura", rank="order")
        anura = fetch_species_under(anura_key)
        print(f"  {len(anura)} total Anura species", file=sys.stderr)
        for sp in anura:
            fam = sp["family"]
            group_idx = ANURA_FAMILY_TO_GROUP.get(fam, G_ALL_OTHER_FROGS)
            bucketed[group_idx].append(sp)
        for group_idx in (G_OLD_WORLD_FROG, G_NEW_WORLD_FROG, G_ALL_OTHER_FROGS):
            print(f"  -> {GROUPS[group_idx][0]}: {len(bucketed[group_idx])} species", file=sys.stderr)
            attach_common_names(bucketed[group_idx])
            counts[group_idx] = len(bucketed[group_idx])
    except BaseException:
        write_output(bucketed, counts, unmapped_families, complete=False)
        raise
    else:
        write_output(bucketed, counts, unmapped_families, complete=True)


if __name__ == "__main__":
    main()
