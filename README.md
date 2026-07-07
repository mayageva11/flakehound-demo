# Flaky Shop 🛒 × flakehound 🐕

A **living demo** for [flakehound](https://github.com/mayageva11/flakehound): a
real website with bugs planted *on purpose*, a Playwright suite that exposes
them, and a scheduled pipeline that clusters the failures into a dashboard.

**Live dashboard:** https://mayageva11.github.io/flakehound-demo/
**The shop:** https://mayageva11.github.io/flakehound-demo/shop/

_Both are served from one GitHub Pages deployment (`main` → `/docs`): the dashboard
at the root, the shop from `docs/shop/`._

> ### Honest framing — read this first
> The flakiness in this demo is **seeded on purpose for demonstration**. The
> bugs live in the **application code**, never in the tests. And flakehound
> analyzes **test artifacts** (JUnit XML) — it *never* inspects the running
> website. This repo is a three-stage chain: **a buggy site → a suite that
> exposes the bugs → flakehound clustering the resulting failures.** Nothing
> here claims flakehound looks at source code or a live URL; it reads the XML a
> CI run leaves behind.

The hypothesis layer uses flakehound's `auto` provider chain, so it costs nothing
either way: on a machine with **local Ollama** running, each failure cluster gets
a one-line AI hypothesis (`timeout`, `assertion`, …) generated **locally at zero
cost** — that's what the dashboard shows here. The **scheduled cloud runner has no
local model and no API key, so it auto-skips** the AI step and publishes the
deterministic report. Either way the pipeline is free to run forever; the AI is a
local-first enrichment, never the source of truth.

---

## The three-stage chain

### 1 · The Flaky Shop — a real site with defects planted in the app

A tiny `login → checkout → payment` storefront (static, served from GitHub Pages
at `/shop/`). Three defects are planted in the **application code** (`docs/shop/js/shop.js`), each
tagged `PLANTED DEFECT` in a comment:

| # | Defect | Where | Surfaces as |
|---|---|---|---|
| 1 | Pay button renders after a random **0–35s** delay | `checkout.html` | **timeout flake** — a fixed render SLA sometimes elapses first |
| 2 | Cart total reads shared pricing state that an async promo **races** | `payment.html` | **race-condition flake** — the total occasionally disagrees with the charge |
| 3 | Receipt total sums **list prices**, always ignoring the promo | `payment.html` receipt | **regression** — deterministic, fails every run |

Defects 1 and 2 are genuinely non-deterministic (real `setTimeout`/promise
races); defect 3 is deterministic — which is the point: it lets the dashboard
demonstrate the **flaky-vs-regression split**.

### 2 · The Playwright suite — exposes them, emits JUnit XML

`tests/shop.spec.ts` drives the live site through page objects that mirror the
defects. Over repeated runs on the same commit:

```
login    → stable
checkout → flaky (high)    (defect 1, intermittent timeout)
payment  → flaky (medium)  (defect 2, intermittent pricing race)
receipt  → regression      (defect 3, deterministic wrong total)
```

**Retries in CI** (`retries: 2`) are deliberate: when a flaky test fails then
passes *within one run*, that intra-run retry flip is flakehound's
**highest-confidence** signal — so `checkout` reads as flaky/**high**, distinct
from `payment`'s cross-run flaky/**medium**. The suite emits one `<testcase>` per
attempt, so a retry flip appears as two same-named `<testcase>` entries in one
file (the shape flakehound already unit-tests in `playwright-retries.xml`).

A small deterministic reporter (`tests/junit-reporter.ts`) pins the JUnit shape
so a test's id is byte-identical across every run — that stability is what lets
flakehound track a test's history.

### 3 · The scheduled pipeline — clusters the failures

[`.github/workflows/flakehound.yml`](.github/workflows/flakehound.yml) runs
**every 6 hours** and on **manual dispatch**. Each run:

1. runs the suite against the live shop → `junit.xml` + a `junit.meta.json`
   sidecar (`$GITHUB_SHA`, timestamp, runner) into a dated `history/` folder;
2. runs `flakehound analyze` over the **accumulated** history, with the previous
   report as `--baseline` (AI hypotheses auto-skip on the cloud runner — no local
   model — so cloud runs stay free and deterministic; run `npm run analyze`
   locally with Ollama up to enrich the report with hypotheses);
3. commits the refreshed `docs/flakehound.report.json` back to the repo (that
   commit *is* the persisted baseline for the next run);
4. republishes `docs/` — the dashboard, stamped with **"last run: X ago."**

The CI gate fails **once** when a regression first appears (exit 1), then reads
as *known* on subsequent runs (exit 0) — so the pipeline doesn't cry wolf every
6 hours. The workflow treats exit 1 as informational (surfacing the regression
is the goal) and fails only on exit 2 (a real tool error).

---

## Run it locally

```sh
npm install
npm run test:install     # one-time: Playwright's chromium
npm test                 # boots a local static server for docs/shop and runs the suite
npm run analyze          # clusters history/ → docs/flakehound.report.json
```

`npm run analyze` locates flakehound automatically: a sibling `../flakehound`
checkout if present, otherwise it clones and builds it into `.flakehound/`
(flakehound itself is never modified). Then open `docs/index.html` (via any
static server, e.g. `npx serve docs`) to see the dashboard.

For PR-based repos there's also a one-step alternative to the hand-rolled
workflow here — flakehound's reusable action, which gates and posts the summary
as a PR comment:

```yaml
- uses: mayageva11/flakehound@main
  with:
    input-glob: 'history/**/*.xml'
    baseline: flakehound.report.json
    comment: 'true'
```

Because defects 1 and 2 are timing-based, a single local run is a coin toss —
run `npm test` a handful of times and watch `checkout`/`payment` flip while
`receipt` fails every time.

## Deploy — one GitHub Pages site, no Vercel

Both the dashboard and the shop are served from a single Pages deployment.

- **Enable Pages:** Settings → Pages → *Deploy from a branch*, branch `main`,
  folder `/docs`. That publishes the dashboard at the repo-root URL and the shop
  at `/shop/` (from `docs/shop/`).
- **Point the pipeline at the live shop:** the workflow defaults `SHOP_URL` to
  `https://mayageva11.github.io/flakehound-demo/shop/`, so no repo setting is
  needed. (Override with a repo **Variable** `SHOP_URL` if you fork/rename; if it
  resolves empty, the workflow boots a local server in the runner instead.)
- **Trigger a run:** Actions → *flakehound* → *Run workflow* (the
  `workflow_dispatch` button — handy for live demos).

> After the first push, wait ~1 min for Pages to publish the shop under `/shop/`
> **before** triggering a run, so the suite has a live site to test.

## What's honest about this, precisely

- The **bugs are in the app**, not the tests — every failure is real behavior of
  the deployed site.
- flakehound reads **JUnit XML**, not the website and not source code. It groups
  failures by **normalized stack trace** and, for regressions, names the commit
  that broke them.
- The **oldest** runs in `history/` are a labelled **seed backstory**
  ([`history/README.md`](history/README.md)) that bootstraps the baseline;
  everything after is a genuine artifact from the live site. Delete the seed and
  the pipeline still works — it just needs real runs to accumulate first.

## Layout

```
docs/                served by GitHub Pages
  index.html           the dashboard + the report it renders (repo-root URL)
  shop/                the Flaky Shop (static site; defects in shop/js/shop.js) → /shop/
tests/               Playwright suite + page objects + deterministic JUnit reporter
scripts/             static server, seed generator, analyze wrapper
history/             run history (seed backstory + real runs) — flakehound's input
.github/workflows/   the scheduled + on-demand pipeline
```

MIT licensed. The shop's bugs are intentional. 🙂
