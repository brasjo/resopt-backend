#!/usr/bin/env bash
# Hard gate for run.sh: exits non-zero (and says what's missing) if .env is
# missing, or doesn't have a value for everything .env.template declares.
#
# This is deliberately separate from check_env.sh, which only warns and
# never blocks - that one is run by resopt-main's update.sh, which must
# never be blocked by a missing/incomplete .env (see resopt-main/CLAUDE.md).
# This script is for run.sh's use instead: starting the dev server against
# an incomplete .env just fails later in a more confusing way, so run.sh
# stops here first.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
TEMPLATE_FILE="$SCRIPT_DIR/.env.template"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR [resopt-backend]: .env not found." >&2
    echo "  Copy .env.template to .env and fill in real values before running the backend." >&2
    exit 1
fi

missing=()
if [[ -f "$TEMPLATE_FILE" ]]; then
    while IFS='=' read -r name _; do
        name="$(echo "$name" | xargs)"
        [[ -z "$name" || "$name" == \#* ]] && continue
        value="$(grep -E "^${name}=" "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d "'\"" | xargs)"
        if [[ -z "$value" ]]; then
            missing+=("$name")
        fi
    done < "$TEMPLATE_FILE"
fi

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR [resopt-backend]: .env has no value set for: ${missing[*]}" >&2
    echo "  See .env.template for what each one is for." >&2
    exit 1
fi

exit 0
