#!/usr/bin/env bash
# Entry point for honcho's `backend` Procfile line (see resopt-main/Procfile
# and resopt-main/CLAUDE.md). Checks the environment is actually usable
# before doing anything else, then hands off to the dev server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Hard gate: an incomplete .env should fail fast and clearly here, not
# partway through db_init or as a confusing runtime error from Django.
# set -e means a non-zero exit from this terminates run.sh immediately.
./check_vars.sh

python manage.py db_init

# `exec` replaces this script's process with the server instead of running
# it as a child - honcho (and resopt-main/run.sh's shutdown handling) then
# signals the actual Django process directly, with no extra shell layer
# left behind to worry about.
exec python manage.py runserver
