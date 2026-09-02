#!/usr/bin/env python3
"""
Backup path for producing data/reptile/species.json + orders.json, for use
if fetch_reptile_amphibian_data.py's live API approach keeps getting killed
by flaky networking.

Same 12-group taxonomy, same family-to-group mapping -- this script imports
those directly from fetch_reptile_amphibian_data.py rather than duplicating
them, so the two approaches can never quietly drift apart. The only thing
that changes is the data source: instead of ~22,000 small live calls to
api.gbif.org, this reads two flat files extracted from GBIF's bulk backbone
archive (see download_gbif_backbone.sh) and does zero network calls.

Usage:
    bash scripts/download_gbif_backbone.sh      # one-time, resumable download
    python3 scripts/build_reptile_amphibian_from_backbone.py

Expects gbif_backbone/Taxon.tsv and gbif_backbone/VernacularName.tsv next to
the repo root (override with --taxon / --vernacular if you put them
elsewhere). Both are plain tab-separated files from GBIF's Darwin Core
Archive export -- this script reads the header row to find the columns it
needs by name rather than assuming column positions, since it's never
actually been run against a real download yet. If it can't find an expected
column, or ends up with zero matching species, it prints what it *did* see
so a naming mismatch can get fixed from real evidence instead of a guess.

Known gap vs. the live-API script: fetch_species_under() filters out
species GBIF flags as extinct, using a per-record "extinct" field the live
species/search API returns. The bulk backbone export doesn't carry that
flag at all, so this script cannot apply the same filter -- expect slightly
higher counts here (Testudines in particular, per a docstring note in
fetch_reptile_amphibian_data.py: live filtering cut ~1,136 "accepted"
species down to the commonly-cited ~360 living ones). If this path is ever
actually used for real, compare its counts against a completed live run
before trusting them.
"""

import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from fetch_reptile_amphibian_data import (  # noqa: E402
    GROUPS,
    SQUAMATA_FAMILY_TO_GROUP,
    ANURA_FAMILY_TO_GROUP,
    G_ALL_OTHER_FROGS,
    OUT_DIR,
    write_output,
)

SIMPLE_ORDER_TO_GROUP = {
    "Testudines": 0,
    "Crocodylia": 1,
    "Caudata": 10,
    "Gymnophiona": 11,
}
BUCKETED_ORDERS = {"Squamata", "Anura"}
WANTED_ORDERS = set(SIMPLE_ORDER_TO_GROUP) | BUCKETED_ORDERS

DEFAULT_DIR = os.path.join(os.path.dirname(__file__), "..", "gbif_backbone")


def open_tsv(path):
    f = open(path, "r", encoding="utf-8", newline="")
    reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
    header = next(reader)
    col = {name: i for i, name in enumerate(header)}
    return f, reader, col


def require_columns(col, names, path):
    missing = [n for n in names if n not in col]
    if missing:
        print(f"!! {path} is missing expected column(s): {missing}", file=sys.stderr)
        print(f"!! Columns actually present: {sorted(col)}", file=sys.stderr)
        print("!! Fix the column-name constants at the top of this script's functions", file=sys.stderr)
        print("!! to match, then re-run.", file=sys.stderr)
        sys.exit(1)


def split_epithet(genus, full_name):
    if not genus or not full_name:
        return None
    if full_name.startswith(genus + " "):
        return full_name[len(genus) + 1:].strip() or None
    parts = full_name.split(" ", 1)
    return parts[1].strip() if len(parts) > 1 else None


def load_taxa(path):
    """Returns {taxonID: {"genus", "species", "family", "order"}} for every
    accepted, species-rank Animalia taxon under one of our six orders."""
    f, reader, col = open_tsv(path)
    try:
        require_columns(col, ["taxonID", "kingdom", "taxonRank", "taxonomicStatus", "order"], path)
        # Prefer the atomic name-part columns; fall back to deriving the
        # epithet from the full scientific/canonical name the same way
        # fetch_reptile_amphibian_data.py's live API path does, in case a
        # row has these columns present but blank.
        has_generic = "genericName" in col
        has_epithet = "specificEpithet" in col
        has_genus_col = "genus" in col
        name_col = "canonicalName" if "canonicalName" in col else ("scientificName" if "scientificName" in col else None)
        has_family = "family" in col

        result = {}
        seen_kingdoms = {}
        seen_orders = {}
        rows = 0
        for row in reader:
            rows += 1
            try:
                kingdom = row[col["kingdom"]]
                rank = row[col["taxonRank"]]
                status = row[col["taxonomicStatus"]]
                order = row[col["order"]]
            except IndexError:
                continue
            seen_kingdoms[kingdom] = seen_kingdoms.get(kingdom, 0) + 1
            if kingdom != "Animalia" or rank.upper() != "SPECIES" or status.upper() != "ACCEPTED":
                continue
            seen_orders[order] = seen_orders.get(order, 0) + 1
            if order not in WANTED_ORDERS:
                continue

            taxon_id = row[col["taxonID"]]
            genus = row[col["genericName"]] if has_generic else None
            if not genus and has_genus_col:
                genus = row[col["genus"]]
            epithet = row[col["specificEpithet"]] if has_epithet else None
            full_name = row[col[name_col]] if name_col else None
            if not genus or not full_name:
                continue
            if not epithet:
                epithet = split_epithet(genus, full_name)
            if not epithet:
                continue
            family = row[col["family"]] if has_family else None

            result[taxon_id] = {"genus": genus, "species": epithet, "family": family, "order": order}

        if not result:
            print(f"\n!! Parsed {rows} rows from {path} but matched zero target species.", file=sys.stderr)
            print(f"!! Kingdoms seen (top 10): {sorted(seen_kingdoms.items(), key=lambda kv: -kv[1])[:10]}", file=sys.stderr)
            print(f"!! Orders seen (top 20): {sorted(seen_orders.items(), key=lambda kv: -kv[1])[:20]}", file=sys.stderr)
            print("!! Paste this output back so the column/value assumptions can be fixed.", file=sys.stderr)
            sys.exit(1)

        return result
    finally:
        f.close()


def load_common_names(path, wanted_taxon_ids):
    """Returns {taxonID: englishCommonName} for whichever of wanted_taxon_ids
    have an English vernacular name in the backbone export."""
    f, reader, col = open_tsv(path)
    try:
        require_columns(col, ["taxonID", "vernacularName", "language"], path)
        out = {}
        for row in reader:
            try:
                taxon_id = row[col["taxonID"]]
            except IndexError:
                continue
            if taxon_id not in wanted_taxon_ids or taxon_id in out:
                continue
            try:
                lang = row[col["language"]]
                name = row[col["vernacularName"]]
            except IndexError:
                continue
            if lang not in ("eng", "en"):
                continue
            out[taxon_id] = name
        return out
    finally:
        f.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--taxon", default=os.path.join(DEFAULT_DIR, "Taxon.tsv"))
    parser.add_argument("--vernacular", default=os.path.join(DEFAULT_DIR, "VernacularName.tsv"))
    args = parser.parse_args()

    if not os.path.exists(args.taxon):
        print(f"!! {args.taxon} not found -- run download_gbif_backbone.sh first (or pass --taxon).", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(args.vernacular):
        print(f"!! {args.vernacular} not found -- run download_gbif_backbone.sh first (or pass --vernacular).", file=sys.stderr)
        sys.exit(1)

    print(f"Reading {args.taxon} ...", file=sys.stderr)
    taxa = load_taxa(args.taxon)
    print(f"  {len(taxa)} candidate species across all 6 target orders", file=sys.stderr)

    print(f"Reading {args.vernacular} for English common names ...", file=sys.stderr)
    common_names = load_common_names(args.vernacular, set(taxa))
    print(f"  {len(common_names)} of those have an English vernacular name", file=sys.stderr)

    counts = [0] * len(GROUPS)
    bucketed = [[] for _ in GROUPS]
    unmapped_families = {}

    for taxon_id, sp in taxa.items():
        order = sp["order"]
        if order in SIMPLE_ORDER_TO_GROUP:
            group_idx = SIMPLE_ORDER_TO_GROUP[order]
        elif order == "Squamata":
            group_idx = SQUAMATA_FAMILY_TO_GROUP.get(sp["family"])
            if group_idx is None:
                unmapped_families.setdefault(sp["family"], 0)
                unmapped_families[sp["family"]] += 1
                continue
        else:  # Anura
            group_idx = ANURA_FAMILY_TO_GROUP.get(sp["family"], G_ALL_OTHER_FROGS)

        entry = {"genus": sp["genus"], "species": sp["species"]}
        entry["common"] = common_names.get(taxon_id, f"{sp['genus']} {sp['species']}")
        bucketed[group_idx].append(entry)

    for group_idx, (name, _formal) in enumerate(GROUPS):
        counts[group_idx] = len(bucketed[group_idx])
        print(f"  -> {name}: {counts[group_idx]} species", file=sys.stderr)

    os.makedirs(OUT_DIR, exist_ok=True)
    write_output(bucketed, counts, unmapped_families, complete=True)


if __name__ == "__main__":
    main()
