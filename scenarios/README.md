# Scenarios

Benchmark datasets built from real-world data, including known-good
assignments, used to evaluate optimizer output against a reference solution.
Checked into this repo (not S3 — see `resopt-backend/CLAUDE.md`) since these
are dev-facing fixtures, not end-user or runtime data.

To benchmark a scenario against the optimizer: submit it through the normal
send-to-optimizer flow (same S3 upload + SQS message every optimization run
uses) and compare the returned solution's assignments against the reference
assignments checked in here.
