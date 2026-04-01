#!/usr/bin/env bash
# scripts/export.sh — Create a clean review/release bundle
#
# Uses `git archive` to export only version-controlled files.
# This automatically excludes everything in .gitignore, including:
#   - .env            (real secrets)
#   - node_modules/   (large binary artefact)
#   - .claude/        (local Claude Code session data)
#   - frontend/dist/  (build output)
#   - __pycache__/    (compiled Python)
#
# Usage:
#   bash scripts/export.sh
#   bash scripts/export.sh /some/output/directory
#
# Output: trading-analysis-platform-review-YYYYMMDD_HHMMSS.zip
#         Written to the parent directory of the repo, or the path you pass.

set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTDIR="${1:-"${REPO_ROOT}/.."}"
OUTFILE="${OUTDIR}/${REPO_NAME}-review-${TIMESTAMP}.zip"

echo "Exporting ${REPO_NAME} → ${OUTFILE}"
git -C "${REPO_ROOT}" archive --format=zip --output="${OUTFILE}" HEAD

ENTRY_COUNT="$(unzip -l "${OUTFILE}" | tail -1 | awk '{print $2}')"
echo "Done. ${ENTRY_COUNT} files in bundle."
echo ""
echo "Verify no secrets leaked:"
echo "  unzip -l ${OUTFILE} | grep -E '\\.env|node_modules|\\.claude'"
