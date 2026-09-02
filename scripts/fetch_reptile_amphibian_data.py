#!/usr/bin/env python3
"""
Fetch reptile + amphibian species from GBIF's backbone taxonomy and sort
them into the 12 groups decided for The Reptile & Amphibian Ephemeris:

  Tortoises/turtles   -> Testudines
  Crocodilians        -> Crocodylia
  Snakes              -> Serpentes
  Geckos & skinks     -> Dibamia + Gekkota + Scincoidea
  Tejus & monitors    -> Lacertoidea + Anguimorpha
  Iguanas             -> Iguania minus Chamaeleonidae
  Chameleons          -> Chamaeleonidae
  Old World frogs     -> Ranoidea
  New World frogs     -> Hyloidea
  All other frogs     -> Anura minus (Ranoidea union Hyloidea)
  Salamanders         -> Caudata
  Caecilians          -> Gymnophiona

NOT covered by any group above: the tuatara (Rhynchocephalia, 1 species) --
see the app's own tracked reminder to give it special (Leap Day) treatment
rather than a group of its own.

Requires only the `requests` library and outgoing internet access to
api.gbif.org (no API key, no signup). Run it from anywhere that has both,
then hand the two output files back -- or if this environment also has
push access to the repo, just commit and push them directly:

    pip install requests
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

# Set to False for a fast first pass with no common names (all fall back to
# the scientific binomial) -- useful to sanity-check group counts before
# committing to the slow per-species vernacular-name lookup below.
FETCH_COMMON_NAMES = True
COMMON_NAME_WORKERS = 16


def get_json(url, params=None, retries=3):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def resolve_taxon_key(name, rank):
    """Find the GBIF backbone usageKey for an exact, accepted name at a given rank."""
    data = get_json(f"{API}/species/search", {"q": name, "rank": rank, "limit": 20})
    for r in data.get("results", []):
        if (
            r.get("canonicalName", "").lower() == name.lower()
            and r.get("taxonomicStatus") == "ACCEPTED"
        ):
            return r["key"]
    raise RuntimeError(f"Could not resolve {rank} '{name}' in GBIF backbone")


def fetch_species_under(taxon_key):
    """All accepted, species-rank taxa under a given backbone key. Returns
    a dict keyed by usageKey (so unions/subtractions across groups are easy)."""
    out = {}
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
            genus = r.get("genus")
            epithet = r.get("specificEpithet")
            if not genus or not epithet:
                continue
            out[r["key"]] = {"genus": genus, "species": epithet}
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


# ---------- Group definitions ----------
# (group display name, formal label, [(clade name, GBIF rank), ...] to union,
#  [(clade name, GBIF rank), ...] to subtract)
GROUPS = [
    ("Tortoises/turtles", "Testudines", [("Testudines", "ORDER")], []),
    ("Crocodilians", "Crocodylia", [("Crocodylia", "ORDER")], []),
    ("Snakes", "Serpentes", [("Serpentes", "SUBORDER")], []),
    (
        "Geckos & skinks",
        "Dibamia + Gekkota + Scincoidea",
        [("Dibamia", "INFRAORDER"), ("Gekkota", "INFRAORDER"), ("Scincoidea", "SUPERFAMILY")],
        [],
    ),
    (
        "Tejus & monitors",
        "Lacertoidea + Anguimorpha",
        [("Lacertoidea", "SUPERFAMILY"), ("Anguimorpha", "INFRAORDER")],
        [],
    ),
    (
        "Iguanas",
        "Iguania (minus Chamaeleonidae)",
        [("Iguania", "INFRAORDER")],
        [("Chamaeleonidae", "FAMILY")],
    ),
    ("Chameleons", "Chamaeleonidae", [("Chamaeleonidae", "FAMILY")], []),
    ("Old World frogs", "Ranoidea", [("Ranoidea", "SUPERFAMILY")], []),
    ("New World frogs", "Hyloidea", [("Hyloidea", "SUPERFAMILY")], []),
    (
        "All other frogs",
        "Anura (minus Ranoidea, Hyloidea)",
        [("Anura", "ORDER")],
        [("Ranoidea", "SUPERFAMILY"), ("Hyloidea", "SUPERFAMILY")],
    ),
    ("Salamanders", "Caudata", [("Caudata", "ORDER")], []),
    ("Caecilians", "Gymnophiona", [("Gymnophiona", "ORDER")], []),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    all_species = []  # [commonName, Genus, species, groupIndex]
    orders = []
    key_cache = {}

    def resolve(name, rank):
        if (name, rank) not in key_cache:
            key_cache[(name, rank)] = resolve_taxon_key(name, rank)
        return key_cache[(name, rank)]

    for group_idx, (display_name, formal, include, exclude) in enumerate(GROUPS):
        print(f"=== {display_name} ({formal}) ===", file=sys.stderr)
        merged = {}
        for name, rank in include:
            key = resolve(name, rank)
            species_map = fetch_species_under(key)
            print(f"  + {name} ({rank}): {len(species_map)} species", file=sys.stderr)
            merged.update(species_map)
        for name, rank in exclude:
            key = resolve(name, rank)
            species_map = fetch_species_under(key)
            print(f"  - {name} ({rank}): {len(species_map)} species", file=sys.stderr)
            for k in species_map:
                merged.pop(k, None)

        print(f"  = {len(merged)} species in this group", file=sys.stderr)
        orders.append({"name": display_name, "formal": formal, "count": len(merged), "month": None})

        common_names = {}
        if FETCH_COMMON_NAMES and merged:
            with ThreadPoolExecutor(max_workers=COMMON_NAME_WORKERS) as pool:
                futures = {pool.submit(fetch_common_name, k): k for k in merged}
                for fut in as_completed(futures):
                    k = futures[fut]
                    try:
                        common_names[k] = fut.result()
                    except Exception:
                        common_names[k] = None

        for k, sp in merged.items():
            common = common_names.get(k) or f"{sp['genus']} {sp['species']}"
            all_species.append([common, sp["genus"], sp["species"], group_idx])

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
