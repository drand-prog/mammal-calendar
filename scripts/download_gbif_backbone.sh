#!/bin/bash
# Backup plan for scripts/fetch_reptile_amphibian_data.py: instead of ~22,000
# small live API calls (fragile against flaky Codespace networking), pull
# GBIF's entire backbone taxonomy as one (large, resumable) static archive
# and let build_reptile_amphibian_from_backbone.py process it with zero
# further network calls.
#
# Usage:
#   bash scripts/download_gbif_backbone.sh
#
# Safe to re-run if it drops partway through -- curl -C - resumes rather
# than starting over.
set -euo pipefail

DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/gbif_backbone"
mkdir -p "$DEST_DIR"
cd "$DEST_DIR"

URL="https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip"

echo "Checking archive size before committing to the download..."
curl -sI "$URL" | grep -i '^content-length' || echo "(couldn't read a size header -- proceeding anyway)"
echo

echo "Downloading $URL"
echo "(this is the WHOLE GBIF backbone -- all of life, not just reptiles/amphibians --"
echo " so expect this to be large; it's one resumable stream rather than thousands of"
echo " small requests, which is the whole point)"
curl -C - --retry 20 --retry-delay 5 --retry-all-errors -o backbone.zip "$URL"

echo
echo "Extracting just the two files we actually need..."
unzip -o backbone.zip Taxon.tsv VernacularName.tsv

echo
echo "Done. Next step:"
echo "  python3 scripts/build_reptile_amphibian_from_backbone.py"
ls -lh Taxon.tsv VernacularName.tsv
