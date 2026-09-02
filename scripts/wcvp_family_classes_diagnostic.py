#!/usr/bin/env python3
"""
Diagnostic step for a future flowering-plant-genera fetch script -- figures
out, from real GBIF data, which class value(s) actually mean "angiosperm"
for the family names WCVP uses, rather than hardcoding a guess at GBIF's
class-rank vocabulary (Magnoliopsida/Liliopsida? Equisetopsida? something
else entirely?). Guessing that kind of thing and being wrong is exactly
what cost multiple rewrites on the reptile/amphibian GBIF script -- this
gets real evidence first.

Reads every unique `family` value from a locally-downloaded WCVP Darwin
Core Archive's genus-rank, Accepted rows (taxonrank=Genus,
taxonomicstatus=Accepted), resolves each family name against GBIF's
backbone via species/match, and prints a table of
class -> family count -> total genus count -- so the real angiosperm-vs-
not split can be read off before any filtering logic gets written.

Usage:
    python3 scripts/wcvp_family_classes_diagnostic.py --wcvp-zip wcvp_data/wcvp_dwca.zip
"""

import argparse
import csv
import io
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://api.gbif.org/v1"
TAXON_MEMBER = "wcvp_taxon.csv"


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


def load_genus_rows(wcvp_zip_path):
    """Returns {family: genus_count} for every WCVP row with
    taxonrank=Genus and taxonomicstatus=Accepted."""
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

            family_counts = {}
            rows = 0
            genus_rows = 0
            for row in reader:
                rows += 1
                try:
                    rank = row[col["taxonrank"]]
                    status = row[col["taxonomicstatus"]]
                except IndexError:
                    continue
                if rank != "Genus" or status != "Accepted":
                    continue
                genus_rows += 1
                family = row[col["family"]]
                family_counts[family] = family_counts.get(family, 0) + 1

            print(f"  {rows} total rows scanned, {genus_rows} are Genus/Accepted, "
                  f"across {len(family_counts)} unique families", file=sys.stderr)
            return family_counts


def resolve_family_class(family_name):
    """Best-effort: returns (class_name_or_None, note)."""
    try:
        data = get_json(f"{API}/species/match", {"name": family_name, "rank": "family", "strict": "true"})
    except Exception as e:
        return None, f"error: {e!r}"
    if data.get("matchType") != "EXACT":
        return None, f"matchType={data.get('matchType')} note={data.get('note')}"
    return data.get("class"), data.get("status")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wcvp-zip", required=True)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    print(f"Reading {args.wcvp_zip} ...", file=sys.stderr)
    family_counts = load_genus_rows(args.wcvp_zip)

    print(f"Resolving {len(family_counts)} unique families against GBIF (rank=family) ...", file=sys.stderr)
    class_family_counts = {}   # class -> number of distinct families
    class_genus_counts = {}    # class -> total genus count across those families
    unresolved = []

    families = sorted(family_counts)
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(resolve_family_class, fam): fam for fam in families}
        for fut in as_completed(futures):
            fam = futures[fut]
            done += 1
            if done % 50 == 0:
                print(f"  ... {done}/{len(families)}", file=sys.stderr)
            cls, note = fut.result()
            if cls is None:
                unresolved.append((fam, note))
                continue
            class_family_counts[cls] = class_family_counts.get(cls, 0) + 1
            class_genus_counts[cls] = class_genus_counts.get(cls, 0) + family_counts[fam]

    print("\n=== class -> family count -> genus count ===", file=sys.stderr)
    for cls in sorted(class_genus_counts, key=lambda c: -class_genus_counts[c]):
        print(f"  {cls or '(none)'}: {class_family_counts[cls]} families, {class_genus_counts[cls]} genera", file=sys.stderr)

    if unresolved:
        print(f"\n=== {len(unresolved)} families could not be resolved (name mismatch WCVP vs GBIF?) ===", file=sys.stderr)
        for fam, note in unresolved[:30]:
            print(f"  {fam}: {note}", file=sys.stderr)
        if len(unresolved) > 30:
            print(f"  ... and {len(unresolved) - 30} more", file=sys.stderr)


if __name__ == "__main__":
    main()
