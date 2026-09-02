#!/usr/bin/env python3
"""
Builds data/plants/genera.json + orders.json entirely from local bulk
downloads -- zero live API calls. Replaces fetch_flowering_plant_genera_data.py
after api.gbif.org started blocking this Codespace mid-run: confirmed live
that even a single isolated request with zero concurrency times out,
regardless of User-Agent -- not something dialing back concurrency or
changing headers can fix, so this sidesteps the live API entirely.

Two local files combined:
  1. WCVP's wcvp_taxon.csv (see download_wcvp.sh) for the definitive list
     of accepted genera and their family.
  2. GBIF's own bulk backbone Taxon.tsv + VernacularName.tsv (see
     download_gbif_backbone.sh -- a DIFFERENT host, hosted-datasets.gbif.org,
     confirmed live to still work fine while api.gbif.org itself is
     blocked) for each genus's real order/class and English common names.
     Matched by exact genus name against GBIF's own Plantae/genus-rank
     rows, which conveniently carry order/family/class denormalized on
     the same row -- so unlike the live-API version, this needs no
     separate family-resolution step at all.

Confirmed live column details that differ across all three files this
pipeline touches (worth remembering if this ever needs debugging again):
  - WCVP's wcvp_taxon.csv: pipe-delimited, Title Case values ("Genus",
    "Accepted").
  - GBIF's live API: uppercase values ("SPECIES", "ACCEPTED"), 3-letter
    language codes ("eng").
  - GBIF's bulk Taxon.tsv/VernacularName.tsv: tab-delimited, LOWERCASE
    values ("genus", "accepted"), 2-letter language codes ("en"), and no
    "preferred" flag on vernacular names at all -- confirmed live against
    a real genus (Rosa, taxonID 8395064) and a real taxonID's vernacular
    rows.

Usage:
    python3 scripts/build_flowering_plant_genera_from_backbone.py \\
        --wcvp-zip wcvp_data/wcvp_dwca.zip \\
        --gbif-taxon gbif_backbone/Taxon.tsv \\
        --gbif-vernacular gbif_backbone/VernacularName.tsv

Writes:
    data/plants/genera.json   [[commonName, Genus, groupIndex], ...]
    data/plants/orders.json   [{name, formal, count, month: null}, ...]
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from fetch_flowering_plant_genera_data import load_genera, write_output, OUT_DIR  # noqa: E402
from wcvp_group_mapping_diagnostic import (  # noqa: E402
    GROUPS,
    ORDER_TO_GROUP,
    ANGIOSPERM_CLASSES,
    ORCHID_FAMILY,
    G_ORCHIDS,
)


def load_gbif_plant_genera(taxon_tsv_path):
    """Streams GBIF's bulk Taxon.tsv once. Returns
    (genus_name -> {taxonID, order, family, class}, family -> most-common order)
    for every kingdom=Plantae, taxonRank=genus, taxonomicStatus=accepted row."""
    genus_info = {}
    family_order_votes = {}  # family -> {order: count}

    with open(taxon_tsv_path, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}
        for required in ("taxonID", "canonicalName", "taxonRank", "taxonomicStatus", "kingdom", "class", "order", "family"):
            if required not in col:
                print(f"!! Expected column '{required}' not found. Columns present: {header}", file=sys.stderr)
                sys.exit(1)

        i_id, i_name, i_rank, i_status = col["taxonID"], col["canonicalName"], col["taxonRank"], col["taxonomicStatus"]
        i_kingdom, i_class, i_order, i_family = col["kingdom"], col["class"], col["order"], col["family"]
        max_col = max(i_id, i_name, i_rank, i_status, i_kingdom, i_class, i_order, i_family)

        rows = 0
        for line in f:
            rows += 1
            fields = line.rstrip("\n").split("\t")
            if len(fields) <= max_col:
                continue
            if fields[i_kingdom] != "Plantae" or fields[i_rank] != "genus" or fields[i_status] != "accepted":
                continue
            name = fields[i_name]
            if not name:
                continue
            entry = {"taxonID": fields[i_id], "order": fields[i_order], "family": fields[i_family], "class": fields[i_class]}
            genus_info[name] = entry
            fam, order = entry["family"], entry["order"]
            if fam and order:
                family_order_votes.setdefault(fam, {})
                family_order_votes[fam][order] = family_order_votes[fam].get(order, 0) + 1

        print(f"  {rows} total rows scanned, {len(genus_info)} are Plantae/genus/accepted", file=sys.stderr)

    family_to_order = {fam: max(votes, key=votes.get) for fam, votes in family_order_votes.items()}
    return genus_info, family_to_order


def load_common_names(vernacular_tsv_path, wanted_taxon_ids):
    """Streams GBIF's bulk VernacularName.tsv once. Returns
    {taxonID: firstEnglishNameFound} for whichever of wanted_taxon_ids
    have one. No "preferred" column exists in this file (unlike the live
    API), so this just keeps the first English row encountered per
    taxonID."""
    out = {}
    with open(vernacular_tsv_path, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}
        for required in ("taxonID", "vernacularName", "language"):
            if required not in col:
                print(f"!! Expected column '{required}' not found. Columns present: {header}", file=sys.stderr)
                sys.exit(1)
        i_id, i_name, i_lang = col["taxonID"], col["vernacularName"], col["language"]
        max_col = max(i_id, i_name, i_lang)

        rows = 0
        for line in f:
            rows += 1
            fields = line.rstrip("\n").split("\t")
            if len(fields) <= max_col:
                continue
            taxon_id = fields[i_id]
            if taxon_id not in wanted_taxon_ids or taxon_id in out:
                continue
            if fields[i_lang] != "en":
                continue
            out[taxon_id] = fields[i_name]

        print(f"  {rows} total vernacular rows scanned, {len(out)} English names matched", file=sys.stderr)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wcvp-zip", required=True)
    parser.add_argument("--gbif-taxon", required=True)
    parser.add_argument("--gbif-vernacular", required=True)
    args = parser.parse_args()

    print(f"Reading {args.wcvp_zip} ...", file=sys.stderr)
    wcvp_genera = load_genera(args.wcvp_zip)
    print(f"  {len(wcvp_genera)} accepted genera across all vascular plant families", file=sys.stderr)

    print(f"Reading {args.gbif_taxon} (this is a ~2GB file -- may take a minute) ...", file=sys.stderr)
    gbif_genus_info, family_to_order = load_gbif_plant_genera(args.gbif_taxon)

    counts = [0] * len(GROUPS)
    bucketed = [[] for _ in GROUPS]
    unmapped_orders = {}   # (family, order) -> genus count
    unresolved = 0         # genera with neither a GBIF name match nor a family fallback
    taxon_id_by_genus = {}  # genus -> taxonID, for whichever ones matched GBIF

    for g in wcvp_genera:
        info = gbif_genus_info.get(g["genus"])
        if info is not None:
            cls, order = info["class"], info["order"]
            taxon_id_by_genus[g["genus"]] = info["taxonID"]
        else:
            # No exact-name match in GBIF's Plantae/genus rows -- fall back
            # to the order most genera in this WCVP family resolved to.
            cls, order = None, family_to_order.get(g["family"])

        if cls is not None and cls not in ANGIOSPERM_CLASSES:
            continue
        if cls is None and order is None:
            unresolved += 1
            continue

        group_idx = G_ORCHIDS if g["family"] == ORCHID_FAMILY else ORDER_TO_GROUP.get(order)
        if group_idx is None:
            key = (g["family"], order)
            unmapped_orders[key] = unmapped_orders.get(key, 0) + 1
            continue
        bucketed[group_idx].append(g)

    print(f"\n{len(taxon_id_by_genus)} of {len(wcvp_genera)} genera matched a GBIF taxonID by exact name "
          f"(rest used a family->order fallback or were dropped)", file=sys.stderr)
    if unresolved:
        print(f"{unresolved} genera had no GBIF name match AND no family fallback available -- dropped", file=sys.stderr)

    print(f"\nReading {args.gbif_vernacular} (~99 MB) ...", file=sys.stderr)
    wanted_ids = set(taxon_id_by_genus.values())
    common_names = load_common_names(args.gbif_vernacular, wanted_ids)

    for group_idx, name in enumerate(GROUPS):
        for g in bucketed[group_idx]:
            taxon_id = taxon_id_by_genus.get(g["genus"])
            g["common"] = common_names.get(taxon_id, g["genus"]) if taxon_id else g["genus"]
        counts[group_idx] = len(bucketed[group_idx])
        print(f"  -> {name}: {counts[group_idx]} genera", file=sys.stderr)

    os.makedirs(OUT_DIR, exist_ok=True)
    unmapped_list = [(fam, order, n) for (fam, order), n in unmapped_orders.items()]
    write_output(bucketed, counts, unmapped_list, complete=True)


if __name__ == "__main__":
    main()
