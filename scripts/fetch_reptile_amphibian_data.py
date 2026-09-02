#!/usr/bin/env python3
"""
Fetch reptile + amphibian species from GBIF's backbone taxonomy and sort
them into the 12 groups decided for The Reptile & Amphibian Ephemeris.

v2: rewritten after a live diagnostic run against api.gbif.org surfaced two
problems with the original approach (see git history for the v1 script if
curious):

  1. species/search without a datasetKey filter matches names across dozens
     of different checklists in GBIF's Checklist Bank, not just the GBIF
     Backbone Taxonomy -- so resolving e.g. "Testudines" picked a usageKey
     from an unrelated dataset, and highertaxonKey-filtering species search
     against that foreign key legitimately matched zero real records. Every
     query below is now pinned to BACKBONE_DATASET_KEY.

  2. GBIF's backbone simply does not model "Dibamia", "Scincoidea",
     "Lacertoidea", "Anguimorpha", "Iguania", "Ranoidea", or "Hyloidea" as
     named taxa of their own -- those are cladistic groupings above family
     rank, not a rank GBIF's backbone carries for these lineages. Family is
     the lowest rank GBIF is guaranteed to model reliably, so instead of
     resolving each clade by name, this version fetches all of ORDER
     Squamata and all of ORDER Anura just once each (both simple, reliable,
     order-level fetches) and sorts every species into a group by its own
     `family` field, via the FAMILY_TO_GROUP lookup below.

Groups (see FAMILY_TO_GROUP for exactly which families land where):

  Tortoises/turtles   -> order Testudines, in full
  Crocodilians        -> order Crocodylia, in full
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

# The GBIF Backbone Taxonomy's own dataset key -- stable, well-known.
# Pinning every query to it is what fixes the "0 species" bug: without it,
# species/search matches names across unrelated checklists too.
BACKBONE_DATASET_KEY = "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c"

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


def get_json(url, params=None, retries=3):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def resolve_backbone_key(name, rank):
    """Find the GBIF Backbone Taxonomy usageKey for an exact, accepted name."""
    data = get_json(
        f"{API}/species/search",
        {"q": name, "rank": rank, "datasetKey": BACKBONE_DATASET_KEY, "limit": 20},
    )
    for r in data.get("results", []):
        if (
            r.get("canonicalName", "").lower() == name.lower()
            and r.get("taxonomicStatus") == "ACCEPTED"
        ):
            return r["key"]
    raise RuntimeError(f"Could not resolve {rank} '{name}' in the GBIF backbone")


def fetch_species_under(taxon_key):
    """All accepted, species-rank taxa under a given backbone key, within the
    backbone dataset. Returns a list of dicts: genus, species, family."""
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
                "datasetKey": BACKBONE_DATASET_KEY,
                "limit": limit,
                "offset": offset,
            },
        )
        for r in data["results"]:
            genus = r.get("genus")
            epithet = r.get("specificEpithet")
            family = r.get("family")
            if not genus or not epithet:
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


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    counts = [0] * len(GROUPS)
    bucketed = [[] for _ in GROUPS]
    unmapped_families = {}

    # ---- simple order-level groups ----
    for group_idx, order_name in [(0, "Testudines"), (1, "Crocodylia"), (10, "Caudata"), (11, "Gymnophiona")]:
        print(f"=== {GROUPS[group_idx][0]} ({order_name}) ===", file=sys.stderr)
        key = resolve_backbone_key(order_name, "ORDER")
        species_list = fetch_species_under(key)
        print(f"  {len(species_list)} species", file=sys.stderr)
        attach_common_names(species_list)
        bucketed[group_idx] = species_list
        counts[group_idx] = len(species_list)

    # ---- Squamata, bucketed by family ----
    print("=== Squamata (bucketing by family) ===", file=sys.stderr)
    squamata_key = resolve_backbone_key("Squamata", "ORDER")
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
    anura_key = resolve_backbone_key("Anura", "ORDER")
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

    if unmapped_families:
        print("\n!! Unmapped Squamata families (species skipped, not silently lost -- fix the", file=sys.stderr)
        print("!! family lists above and re-run):", file=sys.stderr)
        for fam, n in sorted(unmapped_families.items(), key=lambda kv: -kv[1]):
            print(f"    {fam}: {n} species", file=sys.stderr)

    all_species = []
    for group_idx, species_list in enumerate(bucketed):
        for sp in species_list:
            all_species.append([sp["common"], sp["genus"], sp["species"], group_idx])

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

    print(f"\nWrote {len(all_species)} species to {species_path}", file=sys.stderr)
    print(f"Wrote {len(orders)} groups to {orders_path}", file=sys.stderr)
    missing_common = sum(1 for s in all_species if s[0] == f"{s[1]} {s[2]}")
    print(
        f"{missing_common} of {len(all_species)} species have no common name "
        f"and fell back to their scientific binomial.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
