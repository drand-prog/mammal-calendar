#!/usr/bin/env python3
"""
Builds data/animals/families.json + orders.json from GBIF's bulk backbone
download (Taxon.tsv + VernacularName.tsv) -- same files, same host, same
schema quirks already confirmed live for the flowering-plant-genera
pipeline (see build_flowering_plant_genera_from_backbone.py). GBIF's
backbone covers every kingdom, not just Plantae, so this is the exact
Taxon.tsv/VernacularName.tsv pair already downloaded for that build --
no new download needed, just re-run against kingdom=Animalia instead.

This calendar operates at the FAMILY rank (not species), and deliberately
excludes Chordata -- that's already covered by the separate Mammal/Bird/
Reptile-Amphibian calendars. The 12 groups are a mix of phylum-level splits
(most groups) and one rank-level split within a single phylum (Arthropoda
-> Insecta / Crustacea / everything else, by class), the same kind of move
as splitting Passeriformes for birds or Squamata for reptiles.

ONE GROUP IS GENUS RANK, NOT FAMILY: Tardigrada + Onychophora (GROUPS[5])
has only 40 families combined -- confirmed live via
scripts/count_tardigrada_onychophora_genera.py that the same two phyla have
228 accepted genera (159 Tardigrada + 69 Onychophora; 99 of the 228 are
monotypic), a much less sparse spread for a single month's date range. Every
other group stays family rank. Since the day/hour/minute letter math (in
apps/animals-public/lib/appScript.js) runs on whatever scientific-name
string it's given, it doesn't care whether that string is a family or a
genus name -- the only code that needs to know the difference is this
script, via GENUS_RANK_PHYLA below.

Common names: family-level vernacular names are far sparser than
genus-level ones, so this reuses the plant pipeline's exact borrowing
trick -- vote on the most common last word across a family's member
SPECIES' common names, with the same generic-word stoplist and the same
single-named-species-gets-its-full-name override. See
scripts/build_flowering_plant_genera_from_backbone.py for the original
design notes on why that heuristic works the way it does. The same trick
runs one rank down (voting across a GENUS's member species instead) for
Tardigrada + Onychophora.

KNOWN UNVERIFIED SPOTS (flagged as diagnostic output below, not guessed
away). CONFIRMED against a real run of the full backbone on 2026-09-06
(13,390 accepted Animalia/non-Chordata families total, before the
Tardigrada+Onychophora genus-rank change below):
  - The Crustacea class list, and the Xenacoelomorpha/Bryozoa spelling
    questions raised in an earlier draft of this docstring, all came back
    clean except one gap: Tantulocarida (5 families) was a real GBIF
    class missing from CRUSTACEAN_CLASSES, now added.
  - Three real phyla surfaced by that run weren't in the original mapping
    at all: Sipuncula (6 families, now folded into Annelida -- modern
    work nests peanut worms inside it) and Dicyemida + Orthonectida
    (5 families combined, "Mesozoa", now folded into "All other Spiralia"
    -- reduced/parasitic lineages molecular evidence currently points
    into Spiralia). See PHYLUM_TO_GROUP for both.
  - 360 families (2.7% of the total) simply have no phylum in GBIF's own
    data at all (blank field, likely incertae sedis or fossil placeholder
    entries) -- these are dropped for real, not a bug to chase; there's
    no data to assign them a group with.
Any family whose phylum/class isn't recognized is NOT silently dropped
or guessed into a group -- it's counted and printed under "unmapped"
so the real GBIF vocabulary can be checked before it's trusted.

NOT YET CONFIRMED against a real run: the Tardigrada+Onychophora
genus-rank switch above. count_tardigrada_onychophora_genera.py's numbers
came from a real run, but this script's own genus-collection code path
(GENUS_RANK_PHYLA, load_gbif_animal_taxa's genus/species-by-genus
handling) hasn't itself been run against the real backbone yet -- run this
script and sanity-check GROUPS[5]'s printed count (228 genera expected)
before trusting the output.

Usage:
    python3 scripts/build_animal_families_from_backbone.py \\
        --gbif-taxon gbif_backbone/Taxon.tsv \\
        --gbif-vernacular gbif_backbone/VernacularName.tsv

Writes:
    data/animals/families.json   [[commonName, ScientificName, groupIndex], ...]
    data/animals/orders.json     [{name, formal, count, month: null}, ...]
"""

import argparse
import json
import os
import sys
from collections import defaultdict

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "animals")

GROUPS = [
    "Porifera + Ctenophora + Placozoa",
    "Cnidaria",
    "Insecta",
    "Crustacea",
    "All other Arthropoda",
    "Tardigrada + Onychophora",
    "Cycloneuralia",
    "Mollusca",
    "Annelida",
    "Platyhelminthes",
    "Xenacoelomorpha + Echinodermata + Hemichordata",
    "All other Spiralia",
]

# Every one of these is a real phylum name; the two "same clade, two
# possible spellings" pairs are both included pending live confirmation
# of which one GBIF's backbone actually uses (see module docstring).
PHYLUM_TO_GROUP = {
    "Porifera": 0, "Ctenophora": 0, "Placozoa": 0,
    "Cnidaria": 1,
    # Arthropoda: handled specially below, by class, not listed here.
    "Tardigrada": 5, "Onychophora": 5,
    "Nematoda": 6, "Nematomorpha": 6, "Priapulida": 6,
    "Kinorhyncha": 6, "Loricifera": 6,
    "Mollusca": 7,
    "Annelida": 8,
    "Platyhelminthes": 9,
    "Xenacoelomorpha": 10, "Xenoturbellida": 10, "Acoelomorpha": 10, "Acoela": 10,
    "Echinodermata": 10, "Hemichordata": 10,
    "Nemertea": 11, "Gastrotricha": 11, "Entoprocta": 11, "Kamptozoa": 11,
    "Cycliophora": 11, "Chaetognatha": 11, "Brachiopoda": 11,
    "Bryozoa": 11, "Ectoprocta": 11, "Phoronida": 11,
    "Gnathostomulida": 11, "Micrognathozoa": 11, "Rotifera": 11,
    "Acanthocephala": 11,  # modern classification nests this inside Rotifera
    # Confirmed live against the real backbone (2026-09-06 run): GBIF's
    # taxonomy still carries these as their own "phylum" field even though
    # modern molecular work resolves both differently than a classic
    # standalone phylum would suggest.
    "Sipuncula": 8,  # peanut worms -- now understood to nest inside Annelida
    "Dicyemida": 11, "Orthonectida": 11,  # "Mesozoa" -- molecular evidence points to a reduced/parasitic Spiralia lineage, not a basal animal
}

# These two phyla are looked up at GENUS rank instead of FAMILY rank (see
# module docstring) -- both still map to the same group via PHYLUM_TO_GROUP
# above, GENUS_RANK_GROUP_INDEX just confirms they agree rather than
# hardcoding a second "5" that could silently drift out of sync with it.
GENUS_RANK_PHYLA = frozenset({"Tardigrada", "Onychophora"})
assert len({PHYLUM_TO_GROUP[p] for p in GENUS_RANK_PHYLA}) == 1
GENUS_RANK_GROUP_INDEX = PHYLUM_TO_GROUP[next(iter(GENUS_RANK_PHYLA))]

# Provisional -- see module docstring. Printed diagnostics will show every
# real class actually found under phylum Arthropoda so this can be
# corrected before the data is trusted.
#
# Confirmed live against the real backbone (2026-09-06 run): every class
# below except Tantulocarida was already correct; Thecostraca/Ichthyostraca/
# Pentastomida never actually appear as GBIF class values (harmless to keep
# listed -- they just never match) and Tantulocarida (5 families) was
# missing and fell through to "All other Arthropoda" until added here.
CRUSTACEAN_CLASSES = {
    "Malacostraca", "Branchiopoda", "Copepoda", "Ostracoda",
    "Thecostraca", "Maxillopoda", "Remipedia", "Cephalocarida",
    "Ichthyostraca", "Pentastomida", "Tantulocarida",
}

CHORDATA_PHYLUM = "Chordata"


def group_for(phylum, klass):
    if phylum == "Arthropoda":
        if klass == "Insecta":
            return 2
        if klass in CRUSTACEAN_CLASSES:
            return 3
        return 4
    return PHYLUM_TO_GROUP.get(phylum)


def load_gbif_animal_taxa(taxon_tsv_path):
    """Streams GBIF's bulk Taxon.tsv once. Returns:
      - family_info: family_name -> {taxonID, phylum, class, order}, for
        every kingdom=Animalia, taxonRank=family, taxonomicStatus=accepted,
        phylum != Chordata, phylum NOT IN GENUS_RANK_PHYLA row.
      - species_ids_by_family: family_name -> [taxonID, ...] of every
        kingdom=Animalia, taxonRank=species, taxonomicStatus=accepted,
        phylum != Chordata, phylum NOT IN GENUS_RANK_PHYLA row -- collected
        by matching the row's OWN family field as plain text, not a
        parent-taxonID lookup, so this needs only one pass regardless of
        row order (same trick the plant pipeline used with genericName).
      - phylum_class_counts: (phylum, class) -> family count, for
        reviewing what's actually in the data before trusting the
        group mapping. Only covers family-rank rows (GENUS_RANK_PHYLA
        never reach class-level splitting, so they don't need this).
      - genus_info: genus_name -> {taxonID, phylum, class, order}, for
        every kingdom=Animalia, taxonRank=genus, taxonomicStatus=accepted
        row whose phylum IS one of GENUS_RANK_PHYLA.
      - species_ids_by_genus: genus_name -> [taxonID, ...], the
        GENUS_RANK_PHYLA equivalent of species_ids_by_family -- matched via
        the row's own genericName field rather than family."""
    family_info = {}
    species_ids_by_family = defaultdict(list)
    phylum_class_counts = defaultdict(int)
    genus_info = {}
    species_ids_by_genus = defaultdict(list)

    with open(taxon_tsv_path, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}
        required = ("taxonID", "canonicalName", "genericName", "family", "taxonRank",
                    "taxonomicStatus", "kingdom", "phylum", "class", "order")
        for r in required:
            if r not in col:
                print(f"!! Expected column '{r}' not found. Columns present: {header}", file=sys.stderr)
                sys.exit(1)

        i_id, i_name, i_generic, i_family = col["taxonID"], col["canonicalName"], col["genericName"], col["family"]
        i_rank, i_status, i_kingdom = col["taxonRank"], col["taxonomicStatus"], col["kingdom"]
        i_phylum, i_class, i_order = col["phylum"], col["class"], col["order"]
        max_col = max(i_id, i_name, i_generic, i_family, i_rank, i_status, i_kingdom, i_phylum, i_class, i_order)

        rows = 0
        family_rows = 0
        species_rows = 0
        genus_rows = 0
        species_rows_genus = 0
        for line in f:
            rows += 1
            fields = line.rstrip("\n").split("\t")
            if len(fields) <= max_col:
                continue
            if fields[i_kingdom] != "Animalia" or fields[i_status] != "accepted":
                continue
            phylum = fields[i_phylum]
            if phylum == CHORDATA_PHYLUM:
                continue
            genus_rank_phylum = phylum in GENUS_RANK_PHYLA

            if fields[i_rank] == "family":
                if genus_rank_phylum:
                    continue  # this phylum is handled at genus rank instead -- see below
                name = fields[i_name]
                if not name:
                    continue
                family_info[name] = {
                    "taxonID": fields[i_id],
                    "phylum": phylum,
                    "class": fields[i_class],
                    "order": fields[i_order],
                }
                phylum_class_counts[(phylum, fields[i_class])] += 1
                family_rows += 1
            elif fields[i_rank] == "genus":
                if not genus_rank_phylum:
                    continue  # every other phylum stays at family rank
                name = fields[i_name]
                if not name:
                    continue
                genus_info[name] = {
                    "taxonID": fields[i_id],
                    "phylum": phylum,
                    "class": fields[i_class],
                    "order": fields[i_order],
                }
                genus_rows += 1
            elif fields[i_rank] == "species":
                if genus_rank_phylum:
                    generic = fields[i_generic]
                    if generic:
                        species_ids_by_genus[generic].append(fields[i_id])
                        species_rows_genus += 1
                else:
                    fam = fields[i_family]
                    if fam:
                        species_ids_by_family[fam].append(fields[i_id])
                        species_rows += 1

        print(f"  {rows} total rows scanned, {family_rows} are Animalia/family/accepted/non-Chordata "
              f"(excl. genus-rank phyla), {species_rows} are their member species", file=sys.stderr)
        print(f"  {genus_rows} are Animalia/genus/accepted in {sorted(GENUS_RANK_PHYLA)}, "
              f"{species_rows_genus} are their member species", file=sys.stderr)

    return family_info, species_ids_by_family, phylum_class_counts, genus_info, species_ids_by_genus


def load_common_names(vernacular_tsv_path, wanted_taxon_ids):
    """Streams GBIF's bulk VernacularName.tsv once. Returns
    {taxonID: firstEnglishNameFound} for whichever of wanted_taxon_ids
    have one. Identical logic to the plant pipeline's version -- no
    "preferred" column in this file, first English row wins."""
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


# Identical to the plant pipeline's stoplist and derivation logic -- see
# build_flowering_plant_genera_from_backbone.py for the reasoning (a
# generic top-level category word like "Beetle" or "Moth" carries no
# distinguishing information on its own; a single named species' FULL
# name is used as-is since there's nothing to reconcile it against).
GENERIC_STOPLIST = {"animal", "species", "bug", "worm", "creature"}


def _capitalize_first(s):
    return s[:1].upper() + s[1:] if s else s


def derive_names_from_species(species_ids_by_taxon, common_names):
    """Returns {taxonName: derivedName}, Title Cased. Rank-agnostic --
    species_ids_by_taxon is species_ids_by_family for the family-rank
    groups, species_ids_by_genus for Tardigrada + Onychophora; the voting
    logic below doesn't care which. See module docstring and
    build_flowering_plant_genera_from_backbone.py for the method."""
    derived = {}
    for taxon_name, taxon_ids in species_ids_by_taxon.items():
        named = [common_names[tid] for tid in taxon_ids if common_names.get(tid)]
        if not named:
            continue
        if len(named) == 1:
            derived[taxon_name] = _capitalize_first(named[0])
            continue

        last_word_votes = {}
        for name in named:
            words = name.split()
            if not words:
                continue
            word = words[-1].strip(".,;:'\"()").lower()
            if not word:
                continue
            last_word_votes[word] = last_word_votes.get(word, 0) + 1
        candidates = [w for w in sorted(last_word_votes, key=last_word_votes.get, reverse=True) if w not in GENERIC_STOPLIST]
        if candidates:
            derived[taxon_name] = _capitalize_first(candidates[0])
    return derived


def write_output(bucketed, counts):
    all_entries = []
    for group_idx, entry_list in enumerate(bucketed):
        for entry in entry_list:
            common = entry.get("common", entry["name"])
            all_entries.append([common, entry["name"], group_idx])

    orders = [
        {"name": name, "formal": name, "count": counts[i], "month": None}
        for i, name in enumerate(GROUPS)
    ]

    os.makedirs(OUT_DIR, exist_ok=True)
    families_path = os.path.join(OUT_DIR, "families.json")
    orders_path = os.path.join(OUT_DIR, "orders.json")
    with open(families_path, "w") as f:
        json.dump(all_entries, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(orders_path, "w") as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nWrote {len(all_entries)} entries to {families_path}", file=sys.stderr)
    print(f"Wrote {len(orders)} groups to {orders_path}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--gbif-taxon", required=True)
    parser.add_argument("--gbif-vernacular", required=True)
    args = parser.parse_args()

    print(f"Reading {args.gbif_taxon} (this is a ~2GB file -- may take a minute) ...", file=sys.stderr)
    (family_info, species_ids_by_family, phylum_class_counts,
     genus_info, species_ids_by_genus) = load_gbif_animal_taxa(args.gbif_taxon)
    print(f"  {len(family_info)} accepted Animalia families found (Chordata + genus-rank phyla excluded)", file=sys.stderr)
    print(f"  {len(genus_info)} accepted genera found across {sorted(GENUS_RANK_PHYLA)}", file=sys.stderr)

    counts = [0] * len(GROUPS)
    bucketed = [[] for _ in GROUPS]
    unmapped = defaultdict(int)  # (phylum, class) -> family count

    for family, info in family_info.items():
        gi = group_for(info["phylum"], info["class"])
        if gi is None:
            unmapped[(info["phylum"], info["class"])] += 1
            continue
        bucketed[gi].append({"name": family, "phylum": info["phylum"], "class": info["class"], "taxonID": info["taxonID"]})

    # GENUS_RANK_PHYLA bypasses group_for entirely -- both phyla always
    # belong to the same one group (GENUS_RANK_GROUP_INDEX), never split by
    # class the way Arthropoda is, so there's no class-mapping gap to check.
    for genus, info in genus_info.items():
        bucketed[GENUS_RANK_GROUP_INDEX].append({"name": genus, "phylum": info["phylum"], "class": info["class"], "taxonID": info["taxonID"]})

    print("\nReal (phylum, class) combinations found among Arthropoda families "
          "-- check this against CRUSTACEAN_CLASSES before trusting groups 2-4:", file=sys.stderr)
    for (phylum, klass), n in sorted(phylum_class_counts.items()):
        if phylum == "Arthropoda":
            print(f"    class={klass!r}: {n} families", file=sys.stderr)

    if unmapped:
        print(f"\n!! {sum(unmapped.values())} families had an unrecognized phylum/class and were DROPPED, "
              f"not guessed into a group -- fix PHYLUM_TO_GROUP/CRUSTACEAN_CLASSES above and re-run:", file=sys.stderr)
        for (phylum, klass), n in sorted(unmapped.items(), key=lambda kv: -kv[1]):
            print(f"    phylum={phylum!r} class={klass!r}: {n} families", file=sys.stderr)

    print(f"\nReading {args.gbif_vernacular} (~99 MB) ...", file=sys.stderr)
    wanted_ids = {entry["taxonID"] for group_list in bucketed for entry in group_list}
    for ids in species_ids_by_family.values():
        wanted_ids.update(ids)
    for ids in species_ids_by_genus.values():
        wanted_ids.update(ids)
    common_names = load_common_names(args.gbif_vernacular, wanted_ids)

    derived_names_family = derive_names_from_species(species_ids_by_family, common_names)
    derived_names_genus = derive_names_from_species(species_ids_by_genus, common_names)
    print(f"{len(derived_names_family)} families got a name derived from their species' common names", file=sys.stderr)
    print(f"{len(derived_names_genus)} {GROUPS[GENUS_RANK_GROUP_INDEX]} genera got a name derived from their species' common names", file=sys.stderr)

    direct_hits = 0
    derived_hits = 0
    for group_idx, name in enumerate(GROUPS):
        derived_names = derived_names_genus if group_idx == GENUS_RANK_GROUP_INDEX else derived_names_family
        unit = "genera" if group_idx == GENUS_RANK_GROUP_INDEX else "families"
        for entry in bucketed[group_idx]:
            taxon_id = entry["taxonID"]
            direct = common_names.get(taxon_id)
            if direct:
                entry["common"] = direct
                direct_hits += 1
            elif entry["name"] in derived_names:
                entry["common"] = derived_names[entry["name"]]
                derived_hits += 1
            else:
                entry["common"] = entry["name"]
        counts[group_idx] = len(bucketed[group_idx])
        print(f"  -> {name}: {counts[group_idx]} {unit}", file=sys.stderr)

    total = sum(counts)
    print(f"\n{direct_hits} entries got a direct common name, "
          f"{derived_hits} got one derived from their member species, "
          f"{total - direct_hits - derived_hits} fell back to their scientific name "
          f"(of {total} entries total -- all families except "
          f"{GROUPS[GENUS_RANK_GROUP_INDEX]}, which is genera)", file=sys.stderr)

    write_output(bucketed, counts)


if __name__ == "__main__":
    main()
