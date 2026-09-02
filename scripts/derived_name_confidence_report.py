#!/usr/bin/env python3
"""
One-off diagnostic: how confident are the species-derived genus common
names build_flowering_plant_genera_from_backbone.py produces? Reports
the vote-count distribution behind each derived name (how many species
agreed on the winning last word) and samples the shakiest ones --
single-species derivations, like Philydrum -> "Mouth" (from a single
"Frog's Mouth" entry, with no second species to catch the oddity) --
so we can decide with real evidence whether a minimum-vote threshold is
worth adding, rather than guessing how common/bad this actually is.

Reuses the exact same loading/deriving logic as the real build script,
just reports on it instead of writing final output.

Usage:
    python3 scripts/derived_name_confidence_report.py \\
        --wcvp-zip wcvp_data/wcvp_dwca.zip \\
        --gbif-taxon gbif_backbone/Taxon.tsv \\
        --gbif-vernacular gbif_backbone/VernacularName.tsv
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from fetch_flowering_plant_genera_data import load_genera  # noqa: E402
from build_flowering_plant_genera_from_backbone import (  # noqa: E402
    load_gbif_plant_genera,
    load_common_names,
)


def vote_breakdown(species_ids_by_genus, common_names):
    """Same logic as derive_names_from_species, but returns the full vote
    tally per genus instead of just the winner."""
    breakdown = {}  # genus -> {word: count}
    for genus, taxon_ids in species_ids_by_genus.items():
        votes = {}
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
            votes[word] = votes.get(word, 0) + 1
        if votes:
            breakdown[genus] = votes
    return breakdown


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wcvp-zip", required=True)
    parser.add_argument("--gbif-taxon", required=True)
    parser.add_argument("--gbif-vernacular", required=True)
    parser.add_argument("--sample-size", type=int, default=200)
    args = parser.parse_args()

    print(f"Reading {args.wcvp_zip} ...", file=sys.stderr)
    wcvp_genera = load_genera(args.wcvp_zip)
    wanted_genus_names = {g["genus"] for g in wcvp_genera}

    print(f"Reading {args.gbif_taxon} ...", file=sys.stderr)
    gbif_genus_info, _family_to_order, species_ids_by_genus = load_gbif_plant_genera(args.gbif_taxon, wanted_genus_names)

    genus_taxon_ids = {info["taxonID"] for info in gbif_genus_info.values()}
    wanted_ids = set(genus_taxon_ids)
    for ids in species_ids_by_genus.values():
        wanted_ids.update(ids)

    print(f"Reading {args.gbif_vernacular} ...", file=sys.stderr)
    common_names = load_common_names(args.gbif_vernacular, wanted_ids)

    breakdown = vote_breakdown(species_ids_by_genus, common_names)

    # Only look at genera that would actually USE a derived name -- i.e.
    # ones with no direct genus-level English name of their own.
    genus_has_direct = {}
    for genus, info in gbif_genus_info.items():
        genus_has_direct[genus] = info["taxonID"] in common_names

    winner_vote_counts = []  # winning vote count, for genera that used a derived name
    single_vote_examples = []  # (genus, derived_word, source_name)

    for genus, votes in breakdown.items():
        if genus_has_direct.get(genus):
            continue  # direct name wins, derived one is never used
        best_word = max(votes, key=votes.get)
        best_count = votes[best_word]
        winner_vote_counts.append(best_count)
        if best_count == 1:
            # Find one example source name for this single vote.
            for taxon_id in species_ids_by_genus[genus]:
                name = common_names.get(taxon_id)
                if name and name.split()[-1].strip(".,;:'\"()").lower() == best_word:
                    single_vote_examples.append((genus, best_word[:1].upper() + best_word[1:], name))
                    break

    from collections import Counter
    dist = Counter(winner_vote_counts)
    total_derived = len(winner_vote_counts)
    print(f"\n{total_derived} genera would get a derived name (no direct name of their own)", file=sys.stderr)
    print("Winning-vote-count distribution:", file=sys.stderr)
    for count in sorted(dist, reverse=True)[:10]:
        print(f"  {count} species agreed: {dist[count]} genera", file=sys.stderr)
    single = dist.get(1, 0)
    print(f"\n{single} of {total_derived} ({100*single/total_derived:.1f}%) derived names come from just ONE species "
          f"with no corroboration", file=sys.stderr)

    n = args.sample_size
    print(f"\n=== {min(n, len(single_vote_examples))} random single-vote examples (genus -> derived name, from this source name) ===", file=sys.stderr)
    import random
    random.seed(1)
    sample = random.sample(single_vote_examples, min(n, len(single_vote_examples)))
    sample.sort(key=lambda t: t[1])  # group by derived word -- easier to spot patterns
    for genus, word, source in sample:
        print(f"  {genus} -> \"{word}\"  (from: \"{source}\")", file=sys.stderr)


if __name__ == "__main__":
    main()
