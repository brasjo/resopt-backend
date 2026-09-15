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

**On a rejected upload, the actual reason is logged in three places**, not
just one: `messages.error(request, error)` per error (only rendered on the
*next* full page load, not the AJAX response itself - confusing during
testing, since the browser's own alert only ever shows the generic "Errors
occurred during file upload"), `log_error(opt_run, error)` per error (DB-
backed, `logify` app, viewable via that scenario's activity log), and now
also `logger.warning(...)` (plain `logging` module, `opt.views_v1` logger -
configured in `settings.py`'s `LOGGING['loggers']['opt']` at DEBUG with
both console and file handlers) so the real reason shows up immediately in
the server console/`resopt-main/logs/run.log`, without needing to open the
scenario's activity log or refresh the page.

**IATA SSIM files are supported** as a third auto-detected content type.
Detection (`guess_content_type`) and generic parsing live in
`resopt_utils.parser`/`resopt_utils.ssim`, but SSIM upload actually needed
one change here too — see "SSIM import scoping" below — because a
full-season SSIM export can expand to millions of flights (confirmed: the
real AA fixture's un-truncated original, ~310k Type 3 records spanning 393
days, expands to ~2.6M flights), far beyond a normal scenario's scale.

### SSIM import scoping

`OptimizationScenario.parse_content` (`opt/models.py`) special-cases SSIM
content (detected via `guess_content_type`) before falling through to the
generic path, via `_parse_ssim_upload`:

1. `resopt_utils.ssim.ssim_date_span` gets the file's total date range
   **without expanding anything** (cheap).
2. If that span is within `SSIM_MAX_IMPORT_SPAN_DAYS` (`settings.py`,
   default 90 days / ~3 months): expand and import the whole file, same as
   any other format.
3. If it's larger: the scenario's own period (`get_period_start()`/
   `get_period_end()` - Django field if set, else `meta.period_start/end`
   from the stored input builder) is required to scope the import down.
   **Not set → the upload is rejected** with an error telling the user to
   set the period first (via the existing `messages.error`/HTTP 400 path
   upload errors already use) - this deliberately doesn't try to guess a
   sensible default slice; the user is expected to know what period their
   scenario needs, same philosophy as the wholesale-replace behavior
   below.
4. The scenario's own period is also checked against
   `SCENARIO_MAX_PERIOD_DAYS` (default 30 days / ~1 month) via
   `resopt_utils.utils.check_period_span` - rejected if the period itself
   is too long. This is deliberately small relative to
   `SSIM_MAX_IMPORT_SPAN_DAYS`, so a valid period plus the buffer below
   still comfortably fits under the import-span cap.
5. If the period passes both checks, the import is scoped to
   `[period_start - SSIM_IMPORT_BUFFER_DAYS, period_end +
   SSIM_IMPORT_BUFFER_DAYS]` (default buffer: 10 days each side) via
   `expand_ssim_file`'s `window` parameter - which clips *during*
   expansion, not by filtering a fully-expanded list, so the cost stays
   proportional to what's kept, not to the whole file.

All three thresholds are plain `settings.py` values (env-var overridable,
matching `DATA_UPLOAD_MAX_MEMORY_SIZE`'s existing convention) - **not**
`constance` or any other DB-backed config, a deliberate choice: nothing
else in this codebase uses `constance`, and `resopt-schemas`/`resopt-utils`
have to stay importable without Django on the path at all, so a threshold
sourced from Django-only config could never reach a validator living in
those packages anyway. `check_period_span`/`ssim_date_span`/`expand_leg`'s
`window` are the reusable, framework-agnostic mechanism (in
`resopt-utils`); the actual numbers and the policy of when to apply them
live here.

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

### OptDetailView.post — Post/Redirect/Get on success

The scenario detail page's save (Ctrl+S → `opt.js`'s `postSave()` →
`form.submit()` on `#opt-run-form`, a plain POST to the same URL) redirects
back to `opt:detail` on success instead of rendering the response
directly — every *other* POST handler in `views_v1.py` already did this
(`redirect('opt:detail', run_id=run_id)`), this view was the one
exception. Without the redirect, refreshing the page after a save re-POSTs
the form (the browser's "Confirm Form Resubmission" prompt) — found via
real usage, not hypothetical.

Only redirects when there are **no error-level messages** queued during
processing — a validation failure still renders directly, so the user's
just-typed (invalid) values stay in the bound forms instead of being
silently discarded by a redirect-triggered GET (which would rebuild fresh,
unbound forms from the last-saved DB state). Checked by peeking at
`django.contrib.messages`' queued messages (`get_messages(request)`,
`storage.used = False` after checking so they're still shown afterward)
rather than auditing every form/formset's own `.errors` individually —
every error path in this view already calls `messages.error(...)`
(confirmed for the name form, params form, min-turn-time formset, rules
formset), so this stays correct as new sections get added later without
needing to remember to wire them into an explicit check too.

If you add a new POST-handled section to this view, make sure its error
path calls `messages.error(...)` — that's what this redirect-vs-render
decision keys off. Tests exercising the success path need `follow=True`
(and `assertRedirects`/`redirect_chain`, not a bare `status_code == 200`)
since the direct POST response is now a redirect — see
`opt/tests/view/tests.py`'s `OptDetailViewPostTestCase`.

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
