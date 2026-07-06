# history/

This folder is the **run history** — the only input flakehound analyzes. Each
subfolder is one CI run: a JUnit XML file plus a `junit.meta.json` sidecar
carrying the commit SHA, timestamp, and runner.

There are two kinds of folders:

| Prefix | What it is |
|---|---|
| `seed-*` | **Seed backstory — hand-written, not a real run.** |
| `<sha>_<timestamp>` | **A genuine run** appended by the scheduled workflow, testing the live site. |

## Why the seed exists (and what it honestly is)

flakehound needs history to say anything: flakiness is a pass↔fail *transition*
across runs, and a regression is *"failing now, passed before."* A brand-new
repo has neither. The `seed-*` folders provide a small, explicitly-labelled
backstory so the dashboard shows the full flaky-vs-regression split from the
first render, instead of an empty page that only becomes interesting days later.

The backstory: commit `5eed001` was healthy; commit `5eed002` shipped the
promo-pricing change that introduced all three planted defects. That is exactly
what flakehound recovers from the seed — `receipt` broke deterministically
(regression, since `5eed002`), while `checkout` and `payment` began flipping
(flaky).

The `2026-07-04` run's `checkout` is a **retry flip** (attempt 1 times out,
attempt 2 passes in the same run — two `<testcase>` entries). That is
flakehound's highest-confidence flaky signal, so `checkout` reads as
flaky/**high** and `payment` as flaky/**medium** from the seed alone. It's seed
backstory like everything else here; real CI runs (`retries: 2`) add genuine
retry flips over time.

The seed is **generated**, not fabricated by hand file-by-file — see
[`../scripts/seed-history.mjs`](../scripts/seed-history.mjs), which documents the
backstory as data. Every seed run carries the same test ids and trace shapes the
real Playwright suite emits, so real runs compose seamlessly on top: a live
failure lands in the *same cluster* as its seeded counterpart.

Everything after the seed is real. Delete the `seed-*` folders and the pipeline
keeps working — it just needs a few real runs to accumulate before the
transition-based signals light up.
