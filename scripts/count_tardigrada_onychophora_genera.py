#!/usr/bin/env python3
"""
One-off diagnostic, not a build script: answers "how many genera are in
Tardigrada + Onychophora, and what would genus-level look like for this one
group?" before deciding whether to special-case it in
build_animal_families_from_backbone.py. Reads the same Taxon.tsv already
downloaded for that script -- no new download needed.

Reports, for phylum in {Tardigrada, Onychophora}, among accepted Animalia
rows:
  - genus count (what group 5 would have if it switched to genus rank)
  - species count (for comparison against the genus count, and because the
    common-name "borrow from species" trick needs a genus's own species,
    the same way the family-level trick needs a family's own species)
  - how many of those genera are monotypic (exactly one accepted species) --
    relevant because the existing derive_names_from_species() already has a
    single-species override that would apply to all of them at genus rank
  - the longest genus name found, since the hour/minute letter-sum's % 24
    wrap only matters if some name is long enough to need it

Usage:
    python3 scripts/count_tardigrada_onychophora_genera.py \\
        --gbif-taxon gbif_backbone/Taxon.tsv
"""

import argparse
import sys
from collections import defaultdict

PHYLA = ("Tardigrada", "Onychophora")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--gbif-taxon", required=True)
    args = parser.parse_args()

    genera_by_phylum = defaultdict(list)          # phylum -> [genus name, ...]
    species_count_by_genus = defaultdict(int)      # genus name -> accepted species count
    longest = ("", 0)

    print(f"Reading {args.gbif_taxon} (this is a ~2GB file -- may take a minute) ...", file=sys.stderr)

    with open(args.gbif_taxon, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}
        required = ("canonicalName", "genericName", "taxonRank", "taxonomicStatus", "kingdom", "phylum")
        for r in required:
            if r not in col:
                print(f"!! Expected column '{r}' not found. Columns present: {header}", file=sys.stderr)
                sys.exit(1)

        i_name, i_generic, i_rank = col["canonicalName"], col["genericName"], col["taxonRank"]
        i_status, i_kingdom, i_phylum = col["taxonomicStatus"], col["kingdom"], col["phylum"]
        max_col = max(i_name, i_generic, i_rank, i_status, i_kingdom, i_phylum)

        rows = 0
        for line in f:
            rows += 1
            fields = line.rstrip("\n").split("\t")
            if len(fields) <= max_col:
                continue
            if fields[i_kingdom] != "Animalia" or fields[i_status] != "accepted":
                continue
            phylum = fields[i_phylum]
            if phylum not in PHYLA:
                continue

            rank = fields[i_rank]
            if rank == "genus":
                name = fields[i_name]
                if not name:
                    continue
                genera_by_phylum[phylum].append(name)
                if len(name) > longest[1]:
                    longest = (name, len(name))
            elif rank == "species":
                generic = fields[i_generic]
                if generic:
                    species_count_by_genus[generic] += 1

    print(f"  {rows} total rows scanned", file=sys.stderr)

    total_genera = 0
    total_species = 0
    total_monotypic = 0
    for phylum in PHYLA:
        genera = genera_by_phylum[phylum]
        species_here = sum(species_count_by_genus[g] for g in genera)
        monotypic = sum(1 for g in genera if species_count_by_genus[g] == 1)
        print(f"\n{phylum}: {len(genera)} accepted genera, {species_here} accepted species, "
              f"{monotypic} monotypic genera", file=sys.stderr)
        total_genera += len(genera)
        total_species += species_here
        total_monotypic += monotypic

    print(f"\nCombined: {total_genera} genera, {total_species} species, {total_monotypic} monotypic genera "
          f"(vs. 40 families at family rank)", file=sys.stderr)
    print(f"Longest genus name: {longest[0]!r} ({longest[1]} letters)", file=sys.stderr)


if __name__ == "__main__":
    main()
