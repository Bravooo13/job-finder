#!/usr/bin/env bash
# One-time setup on a new computer (macOS or Linux). Run from the vnext/ folder: bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
python -m playwright install chromium
python -m jobfinder init
echo
echo "Done. Next:"
echo "  1. Fill private/profile.yaml (or: python -m jobfinder import-v1 ../data/job-finder.db)"
echo "  2. Put your resume at private/files/resume.pdf"
echo "  3. . .venv/bin/activate && python -m jobfinder find --simplify"
