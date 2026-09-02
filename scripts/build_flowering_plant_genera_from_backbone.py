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


def load_gbif_plant_genera(taxon_tsv_path, wanted_genus_names):
    """Streams GBIF's bulk Taxon.tsv once. Returns:
      - genus_name -> {taxonID, order, family, class}, for every
        kingdom=Plantae, taxonRank=genus, taxonomicStatus=accepted row
      - family -> most-common order among those genus rows
      - genus_name -> [taxonID, ...] of every kingdom=Plantae,
        taxonRank=species row whose genericName is in wanted_genus_names
        (species common names are far more often curated than genus-level
        ones -- collected here, in the same pass, so a genus lacking its
        own direct vernacular entry can still derive one from its
        species' names; restricted to wanted_genus_names to keep this
        from holding every plant species on Earth in memory)"""
    genus_info = {}
    family_order_votes = {}  # family -> {order: count}
    species_ids_by_genus = {}  # genus -> [taxonID, ...]

    with open(taxon_tsv_path, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}
        for required in ("taxonID", "canonicalName", "genericName", "taxonRank", "taxonomicStatus", "kingdom", "class", "order", "family"):
            if required not in col:
                print(f"!! Expected column '{required}' not found. Columns present: {header}", file=sys.stderr)
                sys.exit(1)

        i_id, i_name, i_generic = col["taxonID"], col["canonicalName"], col["genericName"]
        i_rank, i_status, i_kingdom = col["taxonRank"], col["taxonomicStatus"], col["kingdom"]
        i_class, i_order, i_family = col["class"], col["order"], col["family"]
        max_col = max(i_id, i_name, i_generic, i_rank, i_status, i_kingdom, i_class, i_order, i_family)

        rows = 0
        species_rows = 0
        for line in f:
            rows += 1
            fields = line.rstrip("\n").split("\t")
            if len(fields) <= max_col:
                continue
            if fields[i_kingdom] != "Plantae" or fields[i_status] != "accepted":
                continue

            if fields[i_rank] == "genus":
                name = fields[i_name]
                if not name:
                    continue
                entry = {"taxonID": fields[i_id], "order": fields[i_order], "family": fields[i_family], "class": fields[i_class]}
                genus_info[name] = entry
                fam, order = entry["family"], entry["order"]
                if fam and order:
                    family_order_votes.setdefault(fam, {})
                    family_order_votes[fam][order] = family_order_votes[fam].get(order, 0) + 1
            elif fields[i_rank] == "species":
                generic = fields[i_generic]
                if generic in wanted_genus_names:
                    species_rows += 1
                    species_ids_by_genus.setdefault(generic, []).append(fields[i_id])

        print(f"  {rows} total rows scanned, {len(genus_info)} are Plantae/genus/accepted, "
              f"{species_rows} are Plantae/species/accepted under a wanted genus", file=sys.stderr)

    family_to_order = {fam: max(votes, key=votes.get) for fam, votes in family_order_votes.items()}
    return genus_info, family_to_order, species_ids_by_genus


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


# Top-level plant-category words that carry no distinguishing information
# on their own -- e.g. Eucommia deriving "Plant" from "Woody plant", or
# Heteropyxis deriving "Tree" from "Lavender Tree". Confirmed live against
# a 200-example real sample: these were the only REPEATABLE failure
# pattern found (a handful of true one-off oddities like "Bagasse" or
# "Afternoon" also turned up, but those aren't part of any detectable
# pattern a stoplist could catch without also blocking legitimate words,
# so they're accepted as residual noise rather than chased further).
GENERIC_STOPLIST = {"plant", "tree", "bush", "shrub", "herb", "vine", "flower", "species"}


def derive_names_from_species(species_ids_by_genus, common_names):
    """For a genus with no direct genus-level vernacular name, infers one
    from its species' common names: English common names usually follow a
    "modifier + head noun" pattern ("Dog rose", "Rugosa rose", "California
    poppy"), so the most frequent LAST WORD across a genus's species names
    is a reasonable stand-in for the genus's own common name -- skipping
    any word in GENERIC_STOPLIST in favor of the next-most-frequent one,
    since a category word like "Plant" adds nothing a reader doesn't
    already know. Returns {genus: derivedName}, Title Cased, for every
    genus with at least one non-generic word among its species' names."""
    derived = {}
    for genus, taxon_ids in species_ids_by_genus.items():
        last_word_votes = {}
        for taxon_id in taxon_ids:
            name = common_names.get(taxon_id)
            if not name:
                continue
            words = name.split()
            if not words:
                continue
            word = words[-1].strip(".,;:'\"()").lower()
            if not word:
                continue
            last_word_votes[word] = last_word_votes.get(word, 0) + 1
        candidates = [w for w in sorted(last_word_votes, key=last_word_votes.get, reverse=True) if w not in GENERIC_STOPLIST]
        if candidates:
            best = candidates[0]
            derived[genus] = best[:1].upper() + best[1:]
    return derived


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
    wanted_genus_names = {g["genus"] for g in wcvp_genera}
    gbif_genus_info, family_to_order, species_ids_by_genus = load_gbif_plant_genera(args.gbif_taxon, wanted_genus_names)

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
    # Both genus-level taxonIDs (direct common names) and species-level
    # ones (for the last-word-derived fallback) are needed from the same
    # file -- one pass covers both.
    wanted_ids = set(taxon_id_by_genus.values())
    for ids in species_ids_by_genus.values():
        wanted_ids.update(ids)
    common_names = load_common_names(args.gbif_vernacular, wanted_ids)

    derived_names = derive_names_from_species(species_ids_by_genus, common_names)
    print(f"{len(derived_names)} additional genera got a name derived from their species' common names", file=sys.stderr)

    direct_hits = 0
    derived_hits = 0
    for group_idx, name in enumerate(GROUPS):
        for g in bucketed[group_idx]:
            taxon_id = taxon_id_by_genus.get(g["genus"])
            direct = common_names.get(taxon_id) if taxon_id else None
            if direct:
                g["common"] = direct
                direct_hits += 1
            elif g["genus"] in derived_names:
                g["common"] = derived_names[g["genus"]]
                derived_hits += 1
            else:
                g["common"] = g["genus"]
        counts[group_idx] = len(bucketed[group_idx])
        print(f"  -> {name}: {counts[group_idx]} genera", file=sys.stderr)

    print(f"\n{direct_hits} genera got a direct genus-level common name, "
          f"{derived_hits} got one derived from their species, "
          f"{sum(counts) - direct_hits - derived_hits} fell back to their scientific name", file=sys.stderr)

    os.makedirs(OUT_DIR, exist_ok=True)
    unmapped_list = [(fam, order, n) for (fam, order), n in unmapped_orders.items()]
    write_output(bucketed, counts, unmapped_list, complete=True)


if __name__ == "__main__":
    main()
