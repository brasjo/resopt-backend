#!/usr/bin/env bash
# Warns (never blocks) if .env is missing, or missing values for vars that
# .env.template declares. Run automatically by resopt-main's update.sh after
# cloning/pulling this repo - see that repo's update.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
TEMPLATE_FILE="$SCRIPT_DIR/.env.template"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "  WARNING [resopt-backend]: .env not found." >&2
    echo "    Copy .env.template to .env and fill in real values before running the backend." >&2
    exit 0
fi

[[ -f "$TEMPLATE_FILE" ]] || exit 0

missing=()
while IFS='=' read -r name _; do
    name="$(echo "$name" | xargs)"
    [[ -z "$name" || "$name" == \#* ]] && continue
    value="$(grep -E "^${name}=" "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d "'\"" | xargs)"
    if [[ -z "$value" ]]; then
        missing+=("$name")
    fi
done < "$TEMPLATE_FILE"

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "  WARNING [resopt-backend]: .env has no value set for: ${missing[*]}" >&2
    echo "    See .env.template for what each one is for." >&2
fi

exit 0
