#!/usr/bin/env python3
"""
Second diagnostic step for the flowering-plant-genera app (first was
wcvp_family_classes_diagnostic.py, which established Magnoliopsida +
Liliopsida as the two angiosperm classes). This one resolves each WCVP
family's real `order` from GBIF -- same species/match call already
proven, just reading one more field off the same response -- and applies
the 12-group scheme agreed for this app (see GROUPS/ORDER_TO_GROUP
below), printing real per-group genus counts.

Any order that doesn't map to one of the 12 groups shows up in an
"unmapped" report rather than silently dropping genera -- same discipline
as the reptile/amphibian script's "unmapped families" report, and the
reason this is a separate diagnostic run before the final fetch script
gets written: better to catch a mapping gap here than after building the
whole common-name-fetching pipeline on top of it.

Orchidaceae is a special case: it's a family within order Asparagales,
not its own order, but gets its own group (Orchids) per the agreed
scheme -- checked by family name before falling back to the order map.

Usage:
    python3 scripts/wcvp_group_mapping_diagnostic.py --wcvp-zip wcvp_data/wcvp_dwca.zip
"""

import argparse
import sys
import time
import urllib.parse
import urllib.request
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from wcvp_family_classes_diagnostic import load_genus_rows  # noqa: E402

API = "https://api.gbif.org/v1"
ANGIOSPERM_CLASSES = {"Magnoliopsida", "Liliopsida"}
ORCHID_FAMILY = "Orchidaceae"

GROUPS = [
    "Campanulids",
    "Lamiales",
    "All other Lamiids",
    "All other Superasterids",
    "Malvids",
    "Fabales",
    "Rosales",
    "All other Fabids + earlier-branching Eudicots",
    "Poales",
    "Orchids",
    "All other Monocots",
    "Magnoliids + ANA",
]
G_CAMPANULIDS, G_LAMIALES, G_OTHER_LAMIIDS, G_OTHER_SUPERASTERIDS = 0, 1, 2, 3
G_MALVIDS, G_FABALES, G_ROSALES, G_OTHER_FABIDS = 4, 5, 6, 7
G_POALES, G_ORCHIDS, G_OTHER_MONOCOTS, G_MAGNOLIIDS_ANA = 8, 9, 10, 11

ORDER_TO_GROUP = {}
for o in ["Aquifoliales", "Escalloniales", "Bruniales", "Paracryphiales", "Apiales", "Dipsacales", "Asterales"]:
    ORDER_TO_GROUP[o] = G_CAMPANULIDS
ORDER_TO_GROUP["Lamiales"] = G_LAMIALES
for o in ["Icacinales", "Metteniusales", "Garryales", "Gentianales", "Boraginales", "Vahliales", "Solanales"]:
    ORDER_TO_GROUP[o] = G_OTHER_LAMIIDS
for o in ["Berberidopsidales", "Santalales", "Caryophyllales", "Cornales", "Ericales"]:
    ORDER_TO_GROUP[o] = G_OTHER_SUPERASTERIDS
for o in ["Geraniales", "Myrtales", "Crossosomatales", "Picramniales", "Sapindales", "Huerteales", "Malvales", "Brassicales"]:
    ORDER_TO_GROUP[o] = G_MALVIDS
ORDER_TO_GROUP["Fabales"] = G_FABALES
ORDER_TO_GROUP["Rosales"] = G_ROSALES
for o in ["Zygophyllales", "Celastrales", "Oxalidales", "Malpighiales", "Cucurbitales", "Fagales",
          "Ranunculales", "Proteales", "Trochodendrales", "Buxales", "Gunnerales", "Saxifragales",
          "Vitales", "Dilleniales"]:
    ORDER_TO_GROUP[o] = G_OTHER_FABIDS
ORDER_TO_GROUP["Poales"] = G_POALES
# G_ORCHIDS (group 9) is handled by family name, not order -- see main().
for o in ["Acorales", "Alismatales", "Petrosaviales", "Dioscoreales", "Pandanales", "Liliales",
          "Asparagales", "Arecales", "Commelinales", "Zingiberales"]:
    ORDER_TO_GROUP[o] = G_OTHER_MONOCOTS
for o in ["Amborellales", "Nymphaeales", "Austrobaileyales", "Canellales", "Piperales", "Laurales",
          "Magnoliales", "Chloranthales", "Ceratophyllales"]:
    ORDER_TO_GROUP[o] = G_MAGNOLIIDS_ANA


def get_json(url, params=None, retries=8):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mammal-calendar-fetch-script/1.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt == retries - 1:
                raise
            delay = min(30, 2 ** (attempt + 1))
            print(f"  [retry] {e!r} -- retrying in {delay}s (attempt {attempt + 1}/{retries})", file=sys.stderr)
            time.sleep(delay)


def resolve_family(family_name):
    """Returns (class, order, note)."""
    try:
        data = get_json(f"{API}/species/match", {"name": family_name, "rank": "family", "strict": "true"})
    except Exception as e:
        return None, None, f"error: {e!r}"
    if data.get("matchType") != "EXACT":
        return None, None, f"matchType={data.get('matchType')} note={data.get('note')}"
    return data.get("class"), data.get("order"), None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wcvp-zip", required=True)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    print(f"Reading {args.wcvp_zip} ...", file=sys.stderr)
    family_genus_counts = load_genus_rows(args.wcvp_zip)

    print(f"Resolving {len(family_genus_counts)} unique families against GBIF (class + order) ...", file=sys.stderr)
    families = sorted(family_genus_counts)
    resolved = {}  # family -> (class, order)
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(resolve_family, fam): fam for fam in families}
        for fut in as_completed(futures):
            fam = futures[fut]
            done += 1
            if done % 50 == 0:
                print(f"  ... {done}/{len(families)}", file=sys.stderr)
            cls, order, note = fut.result()
            resolved[fam] = (cls, order, note)

    group_family_counts = [0] * len(GROUPS)
    group_genus_counts = [0] * len(GROUPS)
    unmapped = []          # (family, order, genus_count) -- angiosperm family, order not in map
    not_angiosperm = 0     # families correctly excluded (non-flowering-plant)
    unresolved = []        # (family, note) -- GBIF couldn't resolve the family at all

    for fam, genus_count in family_genus_counts.items():
        cls, order, note = resolved[fam]
        if cls is None:
            unresolved.append((fam, note))
            continue
        if cls not in ANGIOSPERM_CLASSES:
            not_angiosperm += 1
            continue
        group_idx = G_ORCHIDS if fam == ORCHID_FAMILY else ORDER_TO_GROUP.get(order)
        if group_idx is None:
            unmapped.append((fam, order, genus_count))
            continue
        group_family_counts[group_idx] += 1
        group_genus_counts[group_idx] += genus_count

    print("\n=== per-group family count -> genus count ===", file=sys.stderr)
    total_genera = 0
    for i, name in enumerate(GROUPS):
        print(f"  {name}: {group_family_counts[i]} families, {group_genus_counts[i]} genera", file=sys.stderr)
        total_genera += group_genus_counts[i]
    print(f"  TOTAL: {total_genera} genera", file=sys.stderr)

    if unmapped:
        print(f"\n=== {len(unmapped)} angiosperm families had an order with no group mapping ===", file=sys.stderr)
        for fam, order, genus_count in sorted(unmapped, key=lambda t: -t[2]):
            print(f"  {fam} (order: {order}): {genus_count} genera", file=sys.stderr)

    if unresolved:
        print(f"\n=== {len(unresolved)} families could not be resolved by GBIF at all ===", file=sys.stderr)
        for fam, note in unresolved[:30]:
            print(f"  {fam}: {note}", file=sys.stderr)

    print(f"\n({not_angiosperm} non-angiosperm families correctly excluded)", file=sys.stderr)


if __name__ == "__main__":
    main()
