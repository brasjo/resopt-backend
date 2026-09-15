# resopt-backend

Django app in the ResOpt module graph: `resopt-utils` → `resopt-schemas` → **resopt-backend**. Installs `resopt-schemas` and `resopt-utils` as dependencies (see `requirements.txt`); never vendor or duplicate their code here.

## Apps

- `opt/` — optimization scenarios: submits input to the optimizer, parses/validates results (`preprocess.py`, `postprocess.py`, `validation_models*.py`, `kpi.py`).

### File upload (`opt/views_v1.py:upload_file_view` → `OptimizationScenario.update_input`)

A single generic `upload-file/` endpoint, no file-type picker in the UI —
format is entirely content-sniffed server-side (`resopt_utils.parser.
parse_content`: `guess_content_type` for JSON/CSV/SSIM, `guess_model_class`
for which of the 6 schema classes a JSON/CSV row represents). Deliberate UX
choice: drag-and-drop any file, backend figures out what it is.

**IATA SSIM files are supported** as a third auto-detected content type,
added with **zero changes to this repo** — `parse_content` already handled
this generically, so extending `resopt_utils.parser` (detection + parsing)
was the entire change. SSIM always produces `flights` only (never
aircrafts/maintenances/etc), via `resopt_utils.ssim`'s fixed-width parsing
+ recurring-pattern expansion — see `resopt-utils/CLAUDE.md`'s `ssim.py`
section for the full design, including a real caveat: an un-filtered
full-season SSIM export can expand to millions of flights, well beyond a
normal scenario's scale, and the only existing guard is the pre-parse
`DATA_UPLOAD_MAX_MEMORY_SIZE` file-size check (bounds input bytes, not
output flight count).

**Compressed uploads (.zip/.gz) are accepted too** — `upload_file_view`
calls `resopt_utils.utils.maybe_decompress(raw_bytes)` right after reading
the upload, before the existing decode/`update_input` flow; detection is by
magic bytes, not the filename. A zip must contain exactly one file (an
error otherwise) - there's no support for "one zip, multiple data files."
This exists mainly so a large SSIM export can travel compressed. Note the
`DATA_UPLOAD_MAX_MEMORY_SIZE` check above it runs against the *compressed*
size on the wire - decompressed content can be substantially larger, which
is the whole point, but means that size check no longer bounds what
`update_input`/`parse_content` actually has to process.

This is why `maybe_decompress` enforces its own separate 500MB
decompressed-size cap internally (streamed, not read-then-check) — a
compressed upload well within `DATA_UPLOAD_MAX_MEMORY_SIZE` (50MB here)
could otherwise decompress to tens of gigabytes in a single blocking call
(DEFLATE's worst-case ratio is roughly 1032:1) and exhaust server memory —
a real, cheaply-crafted decompression-bomb DoS, not just a theoretical
concern. See `resopt-utils/CLAUDE.md`'s "maybe_decompress and
decompression-bomb protection" section for the full reasoning; if this
cap's value ever needs to change, it lives in
`resopt_utils.utils.MAX_DECOMPRESSED_SIZE`, not here.

**Replace semantics are intentional, not a bug**: `update_input_builder`
(`opt/models.py`) replaces a top-level key wholesale (e.g. all `flights`)
whenever the uploaded content contains that key — it never merges/appends.
The user is expected to combine/curate their data into one file before
uploading. Don't change this to additive/merge behavior without checking
with the user first.
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
