#!/bin/bash
# Downloads Kew's World Checklist of Vascular Plants (WCVP) Darwin Core
# Archive -- the data source for scripts/fetch_flowering_plant_genera_data.py.
# Confirmed live: POWO's own website API is Cloudflare-blocked (HTTP 403 to
# a plain curl), and WFO's site didn't respond at all, but this WCVP bulk
# download works with no auth and no bot protection.
#
# Usage:
#   bash scripts/download_wcvp.sh
#
# Safe to re-run if it drops partway through -- curl -C - resumes rather
# than starting over.
set -euo pipefail

DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/wcvp_data"
mkdir -p "$DEST_DIR"
cd "$DEST_DIR"

URL="https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip"

echo "Downloading $URL (~84 MB) ..."
curl -C - --retry 20 --retry-delay 5 --retry-all-errors -o wcvp_dwca.zip "$URL"

echo
echo "Done. Contents:"
unzip -l wcvp_dwca.zip
echo
echo "Next steps:"
echo "  python3 scripts/wcvp_family_classes_diagnostic.py --wcvp-zip wcvp_data/wcvp_dwca.zip"
echo "  python3 scripts/wcvp_group_mapping_diagnostic.py --wcvp-zip wcvp_data/wcvp_dwca.zip"
echo "  python3 scripts/fetch_flowering_plant_genera_data.py --wcvp-zip wcvp_data/wcvp_dwca.zip"
