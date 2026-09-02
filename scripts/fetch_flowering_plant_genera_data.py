#!/usr/bin/env python3
"""
Fetch flowering plant (angiosperm) genera from Kew's World Checklist of
Vascular Plants (WCVP) and sort them into the 12 groups decided for a
future flowering-plant-genera calendar, following the same verified
pipeline as wcvp_family_classes_diagnostic.py and
wcvp_group_mapping_diagnostic.py (run those first if the class/order
mapping ever needs re-checking -- this script imports its group scheme
directly from the latter so the two can't drift apart).

Two data sources combined:
  1. WCVP's bulk Darwin Core Archive (download_wcvp -- see
     wcvp_data/wcvp_dwca.zip) for the actual list of accepted genera and
     their family. WCVP has no live API worth scripting against (POWO's
     website API is Cloudflare-blocked; confirmed live) but does publish
     this as a plain, unauthenticated, resumable download.
  2. GBIF, for two things WCVP's file doesn't carry: each family's real
     taxonomic order (needed to sort into the 12 groups -- see
     wcvp_group_mapping_diagnostic.py for how that mapping was derived
     and verified against real data) and English common names, which
     WCVP has no field for at all. Genus-level vernacular names are
     fetched the same way species-level ones were for the reptile app:
     resolve a GBIF usageKey by name, then query vernacularNames.

Unlike the mammal/bird/reptile apps, there's no species epithet here --
these are genus-level records -- so species.json's usual
[common, Genus, species, groupIndex] shape becomes
[common, Genus, groupIndex] in genera.json. Whatever app consumes this
will need its own letter-math entry point operating on just the genus
name.

Requires only the standard library, a local wcvp_data/wcvp_dwca.zip
(see download_wcvp.sh), and outgoing internet access to api.gbif.org:

    python3 scripts/fetch_flowering_plant_genera_data.py --wcvp-zip wcvp_data/wcvp_dwca.zip

Writes:
    data/plants/genera.json   [[commonName, Genus, groupIndex], ...]
    data/plants/orders.json   [{name, formal, count, month: null}, ...]

Common names: expect a lot of fallback-to-scientific-name here too --
genera are an even less common target for common-name curation than
species are, and ~13,900 English GBIF lookups will turn up plenty of
gaps.
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(__file__))
from wcvp_family_classes_diagnostic import load_genus_rows, TAXON_MEMBER  # noqa: E402
from wcvp_group_mapping_diagnostic import (  # noqa: E402
    get_json,
    resolve_family,
    GROUPS,
    ORDER_TO_GROUP,
    ANGIOSPERM_CLASSES,
    ORCHID_FAMILY,
    G_ORCHIDS,
)

import csv
import io
import zipfile

API = "https://api.gbif.org/v1"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "plants")

FETCH_COMMON_NAMES = True
COMMON_NAME_WORKERS = 16
FAMILY_RESOLVE_WORKERS = 8


def load_genera(wcvp_zip_path):
    """Returns a list of {"genus", "family"} for every WCVP row with
    taxonrank=Genus and taxonomicstatus=Accepted -- same filter as
    load_genus_rows, but keeping the individual genus names rather than
    just a per-family count."""
    with zipfile.ZipFile(wcvp_zip_path) as zf:
        with zf.open(TAXON_MEMBER) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
            reader = csv.reader(text, delimiter="|")
            header = next(reader)
            col = {name: i for i, name in enumerate(header)}
            for required in ("family", "genus", "taxonrank", "taxonomicstatus"):
                if required not in col:
                    print(f"!! Expected column '{required}' not found. Columns present: {sorted(col)}", file=sys.stderr)
                    sys.exit(1)

            out = []
            for row in reader:
                try:
                    rank = row[col["taxonrank"]]
                    status = row[col["taxonomicstatus"]]
                except IndexError:
                    continue
                if rank != "Genus" or status != "Accepted":
                    continue
                genus = row[col["genus"]]
                family = row[col["family"]]
                if not genus or not family:
                    continue
                out.append({"genus": genus, "family": family})
            return out


def resolve_families(unique_families):
    """Returns {family: (class, order)}."""
    resolved = {}
    done = 0
    with ThreadPoolExecutor(max_workers=FAMILY_RESOLVE_WORKERS) as pool:
        futures = {pool.submit(resolve_family, fam): fam for fam in unique_families}
        for fut in as_completed(futures):
            fam = futures[fut]
            done += 1
            if done % 50 == 0:
                print(f"  ... {done}/{len(unique_families)}", file=sys.stderr)
            cls, order, note = fut.result()
            resolved[fam] = (cls, order)
    return resolved


def fetch_genus_common_name(genus_name):
    """Resolve a genus name to a GBIF usageKey, then look up its English
    vernacular name. Two live calls per genus (WCVP doesn't carry a GBIF
    key directly) -- unlike the reptile script, which got a usageKey for
    free from GBIF's own species/search response."""
    try:
        match = get_json(f"{API}/species/match", {"name": genus_name, "rank": "genus", "strict": "true"})
    except Exception:
        return None
    if match.get("matchType") != "EXACT" or "usageKey" not in match:
        return None
    try:
        data = get_json(f"{API}/species/{match['usageKey']}/vernacularNames")
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


def attach_common_names(genus_list):
    """Mutates each dict in genus_list, adding a 'common' key."""
    if not FETCH_COMMON_NAMES or not genus_list:
        for g in genus_list:
            g["common"] = g["genus"]
        return
    with ThreadPoolExecutor(max_workers=COMMON_NAME_WORKERS) as pool:
        futures = {pool.submit(fetch_genus_common_name, g["genus"]): g for g in genus_list}
        for fut in as_completed(futures):
            g = futures[fut]
            try:
                g["common"] = fut.result() or g["genus"]
            except Exception:
                g["common"] = g["genus"]


def write_output(bucketed, counts, unmapped_orders, complete):
    if unmapped_orders:
        print("\n!! Families whose order has no group mapping (genera skipped, not silently", file=sys.stderr)
        print("!! lost -- fix ORDER_TO_GROUP in wcvp_group_mapping_diagnostic.py and re-run):", file=sys.stderr)
        for fam, order, n in sorted(unmapped_orders, key=lambda t: -t[2]):
            print(f"    {fam} (order: {order}): {n} genera", file=sys.stderr)

    all_genera = []
    for group_idx, genus_list in enumerate(bucketed):
        for g in genus_list:
            common = g.get("common", g["genus"])
            all_genera.append([common, g["genus"], group_idx])

    orders = [
        {"name": name, "formal": name, "count": counts[i], "month": None}
        for i, name in enumerate(GROUPS)
    ]

    os.makedirs(OUT_DIR, exist_ok=True)
    genera_path = os.path.join(OUT_DIR, "genera.json")
    orders_path = os.path.join(OUT_DIR, "orders.json")
    with open(genera_path, "w") as f:
        json.dump(all_genera, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(orders_path, "w") as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)
        f.write("\n")

    status = "Wrote" if complete else "PARTIAL run -- wrote"
    print(f"\n{status} {len(all_genera)} genera to {genera_path}", file=sys.stderr)
    print(f"Wrote {len(orders)} groups to {orders_path}", file=sys.stderr)
    missing_common = sum(1 for g in all_genera if g[0] == g[1])
    print(f"{missing_common} of {len(all_genera)} genera have no common name and fell back to their genus name.", file=sys.stderr)
    if not complete:
        print("\nRe-run starts over from the beginning (not resumable). The data above is", file=sys.stderr)
        print("real; if the failure was a transient network blip, just try again.", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wcvp-zip", required=True)
    args = parser.parse_args()

    print(f"Reading {args.wcvp_zip} ...", file=sys.stderr)
    genera = load_genera(args.wcvp_zip)
    print(f"  {len(genera)} accepted genera across all vascular plant families", file=sys.stderr)

    unique_families = sorted({g["family"] for g in genera})
    print(f"Resolving {len(unique_families)} unique families against GBIF (class + order) ...", file=sys.stderr)
    family_info = resolve_families(unique_families)

    counts = [0] * len(GROUPS)
    bucketed = [[] for _ in GROUPS]
    unmapped_orders = []

    try:
        for g in genera:
            cls, order = family_info.get(g["family"], (None, None))
            if cls not in ANGIOSPERM_CLASSES:
                continue
            group_idx = G_ORCHIDS if g["family"] == ORCHID_FAMILY else ORDER_TO_GROUP.get(order)
            if group_idx is None:
                unmapped_orders.append((g["family"], order, 1))
                continue
            bucketed[group_idx].append(g)

        print(f"\nFetching common names for {sum(len(b) for b in bucketed)} genera ...", file=sys.stderr)
        for group_idx, name in enumerate(GROUPS):
            print(f"  -> {name}: {len(bucketed[group_idx])} genera", file=sys.stderr)
            attach_common_names(bucketed[group_idx])
            counts[group_idx] = len(bucketed[group_idx])
    except BaseException:
        # Collapse the per-family unmapped_orders tallies into
        # (family, order, count) before writing, matching write_output's
        # expected shape.
        collapsed = {}
        for fam, order, _ in unmapped_orders:
            collapsed[(fam, order)] = collapsed.get((fam, order), 0) + 1
        write_output(bucketed, counts, [(f, o, n) for (f, o), n in collapsed.items()], complete=False)
        raise
    else:
        collapsed = {}
        for fam, order, _ in unmapped_orders:
            collapsed[(fam, order)] = collapsed.get((fam, order), 0) + 1
        write_output(bucketed, counts, [(f, o, n) for (f, o), n in collapsed.items()], complete=True)


if __name__ == "__main__":
    main()
