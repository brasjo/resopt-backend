# resopt-backend

Django app in the ResOpt module graph: `resopt-utils` → `resopt-schemas` → **resopt-backend**. Installs `resopt-schemas` and `resopt-utils` as dependencies (see `requirements.txt`); never vendor or duplicate their code here.

## Apps

- `opt/` — optimization scenarios: submits input to the optimizer, parses/validates results (`preprocess.py`, `postprocess.py`, `validation_models*.py`, `kpi.py`).
- `params/` — parameter sets (turn-time rules, penalties) backed by `schemas.parameters`.
- `forms/` — dynamic Django forms generated from `resopt-schemas` models (`forms/loader.py`, `forms/rules_matrix/`).
- `users/`, `logify/`, `viz/`, `dashboard/` — auth, activity logging, Gantt-style visualization views, dashboard pages.

## The optimizer is a black box from here

This repo talks to `resopt-optimizer` only as an external service/process boundary, through the data contracts defined in `resopt-schemas`. **Never read, grep, or reference `resopt-optimizer`'s internal files from this repo's code or docs** — that repo is private, and its own CLAUDE.md restricts direct file access even from other Claude Code sessions. If a task in this repo seems to need knowledge of the optimizer's internals, ask the user rather than looking.

## Known open issue: OUTPUT_DIR

`django_backend/settings.py` still defaults `OUTPUT_DIR` to a path one level
up from this repo (`../tmp/output`) — a leftover from when backend and
optimizer were siblings in one monorepo and shared a filesystem. Now that
they're separate repos (and potentially separate deployments), that default
only works in a local dev checkout where both repos happen to sit under the
same parent directory. Overridable via the `OPT_OUTPUT_DIR` env var. The
optimizer already has S3 plumbing (`config.py`'s `S3_BUCKET`, this repo's
`aws.py`) — that's the likely real fix, but wiring backend/optimizer
together over S3 instead of a shared path hasn't been done. Don't silently
pick a new default; ask the user.

## SCENARIOS_DIR: checked into this repo, not shared with the optimizer

Unlike `OUTPUT_DIR` (optimizer-generated solve results), `scenarios/` holds
dev-facing benchmark datasets — real-world data plus known-good reference
assignments, used to evaluate optimizer output quality. These are built by
the team, not generated at runtime by either service, so they're checked
into this repo (`scenarios/`, `SCENARIOS_DIR` in settings.py) rather than
S3 or the optimizer repo. If a scenario needs to actually run through the
optimizer for benchmarking, submit it through the normal send-to-optimizer
flow (same S3 upload + SQS message as any other optimization run) — don't
add any direct filesystem/git coupling to `resopt-optimizer` for this.

## Local dev login

For local testing that requires an authenticated session (e.g. curl/script access
to `@login_required` views or the `protected_file`-served assets under `/files/`),
use the dev account: username `adminuser`, password `password123`. Dev-only —
never assume this account or password exists outside a local checkout.

To get a session via curl: GET `/users/login/`, extract the
`csrfmiddlewaretoken` value from the login form (the page renders it twice —
take the first match), then POST `username`, `password`, and that token back to
`/users/login/` with the same cookie jar. A successful login redirects to
`/dashboard`.

## Dependency install

Dependencies (including `resopt-schemas`/`resopt-utils`) install into the
**single shared venv** at `resopt-root/.venv`, managed by `resopt-main`'s
`update.sh` — see that repo's README. Don't create a per-repo venv here.
