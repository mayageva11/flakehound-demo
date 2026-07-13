# Flaky Shop 🛒 × flakehound 🐕

A **living demo** for [flakehound](https://github.com/mayageva11/flakehound): a
real website with bugs planted *on purpose*, a Playwright suite that exposes
them, a scheduled pipeline that clusters the failures into a dashboard — and
**automatic quarantine**: flaky tests get tagged out of the blocking lane,
tracked in GitHub issues, and released on their own once they stabilize.

**Live dashboard:** https://mayageva11.github.io/flakehound-demo/
**The shop:** https://mayageva11.github.io/flakehound-demo/shop/
**Quarantine issues:** https://github.com/mayageva11/flakehound-demo/issues?q=label%3Aflakehound

_Both pages are served from one GitHub Pages deployment (`main` → `/docs`): the
dashboard at the root, the shop from `docs/shop/`._

> ### Honest framing — read this first
> The flakiness in this demo is **seeded on purpose for demonstration**. The
> bugs live in the **application code**, never in the tests. And flakehound
> analyzes **test artifacts** (JUnit XML) — it *never* inspects the running
> website. This repo is a chain: **a buggy site → a suite that exposes the
> bugs → flakehound clustering the failures → quarantine acting on the
> verdicts.** Nothing here claims flakehound looks at source code or a live
> URL; it reads the XML a CI run leaves behind — and when it edits a spec file
> to quarantine a test, that edit is a surgical, reversible AST change you can
> see in the commit history.

The hypothesis layer uses flakehound's `auto` provider chain, so it costs nothing
either way: on a machine with **local Ollama** running, each failure cluster gets
a one-line AI hypothesis (`timeout`, `network`, …) generated **locally at zero
cost** — that's what the dashboard shows here. The **scheduled cloud runner has no
local model and no API key, so it auto-skips** the AI step and publishes the
deterministic report. Either way the pipeline is free to run forever; the AI is a
local-first enrichment, never the source of truth.

---

## The chain, stage by stage

### 1 · The Flaky Shop — a real site with defects planted in the app

A tiny `login → checkout → payment` storefront plus an inventory page (static,
served from GitHub Pages at `/shop/`). Six defects are planted in the
**application code** (`docs/shop/js/shop.js`), each tagged `PLANTED DEFECT`:

| # | Defect | Where | Surfaces as |
|---|---|---|---|
| 1 | Pay button renders after a random **0–35s** delay | `checkout.html` | **timeout flake** — a fixed render SLA sometimes elapses first |
| 2 | Cart total reads shared pricing state that an async promo **races** | `payment.html` | **race-condition flake** — the total occasionally disagrees with the charge |
| 3 | Receipt total sums **list prices**, always ignoring the promo | `payment.html` receipt | **regression** — deterministic, fails every run |
| 4 | Catalog "API" call returns a simulated **502** on ~25% of loads | `inventory.html` | **network flake** — the catalog intermittently fails to render |
| 5 | Restock schedule hides during a **maintenance window** (first 8 min of every UTC hour) | `inventory.html` | **environment flake** — whether a run fails depends on CI scheduling jitter, not code |
| 6 | Shipping-estimate "API" returns a **503 on every call** | `inventory.html` + `checkout.html` + `payment.html` | **shared outage** — three tests fail with the same trace, folded into **one cluster** |

Defects 1, 2 and 4 are genuinely non-deterministic; defect 3 is deterministic;
defect 5 is deterministic *given the clock* but random *across scheduled runs*;
defect 6 is deterministic and shared by **three** tests — the many-failing-tests,
one-root-cause case. Together they exercise the full
flaky/regression/confidence/clustering spectrum.

### 2 · The Playwright suite — exposes them, emits JUnit XML

`tests/shop.spec.ts`, `tests/inventory.spec.ts` and `tests/shipping.spec.ts`
drive the live site through page objects that mirror the defects. Over repeated
runs on the same commit:

```
shop.spec.ts      > login    → stable            (and on the criticalTests list)
shop.spec.ts      > checkout → flaky (HIGH)      defect 1 → QUARANTINED
shop.spec.ts      > payment  → flaky (HIGH)      defect 2 → QUARANTINED, then released after the fix
shop.spec.ts      > receipt  → regression        defect 3
inventory.spec.ts > catalog  → flaky (medium→HIGH) defect 4 → quarantined organically once live retries flip
inventory.spec.ts > restock  → flaky (medium)    defect 5 → NEVER quarantined — the confidence gate at work
shipping.spec.ts  > inventory delivery estimate ┐
shipping.spec.ts  > checkout delivery estimate  ├ defect 6 → three tests, ONE cluster = one bug
shipping.spec.ts  > payment delivery estimate   ┘
```

The three `shipping.spec.ts` tests fail on every run with a byte-identical
error (`NetworkError: 503 Service Unavailable fetching /api/shipping-estimate`
thrown from one shared page object), so flakehound's trace normalizer folds
them into a **single failure cluster** — the dashboard shows one cluster
affecting three tests, i.e. "fix one backend and three red tests go green."

**Retries in CI** (`retries: 2`) are deliberate: when a flaky test fails then
passes *within one run*, that intra-run retry flip is flakehound's
**highest-confidence** signal — and high confidence is the bar for
auto-quarantine. `restock` never earns it: every attempt in a run sees the same
clock, so it only flips *across* runs → medium confidence forever → flakehound
refuses to quarantine on that evidence. That refusal is a feature on display.

A small deterministic reporter (`tests/junit-reporter.ts`) pins the JUnit shape
(one `<testsuite>` per spec file, one `<testcase>` per attempt) so a test's id
is byte-identical across every run — that stability is what lets flakehound
track a test's history.

### 3 · The scheduled pipeline — clusters the failures

[`.github/workflows/flakehound.yml`](.github/workflows/flakehound.yml) runs
**every 6 hours** and on **manual dispatch**. Each run:

1. runs the suite against the live shop → `junit.xml` + a `junit.meta.json`
   sidecar (`$GITHUB_SHA`, timestamp, runner) into a dated `history/` folder;
2. runs `flakehound analyze` over the **accumulated** history, with the previous
   report as `--baseline`;
3. runs the quarantine step (next section);
4. commits everything back — refreshed report, history, state file, and any
   quarantine spec edits — and republishes `docs/`, stamped **"last run: X ago."**

The CI gate fails **once** when a regression first appears (exit 1), then reads
as *known* on subsequent runs (exit 0) — so the pipeline doesn't cry wolf every
6 hours.

The dashboard itself (`docs/index.html`) is a **generated artifact**: the
canonical source lives in the flakehound repo, and every pipeline run
re-fetches it with the demo config injected
([`scripts/sync-dashboard.mjs`](scripts/sync-dashboard.mjs)). Dashboard
changes don't have to wait for a scheduled run, though — the lightweight
[`sync-dashboard.yml`](.github/workflows/sync-dashboard.yml) workflow
refreshes it in seconds, triggered automatically when flakehound's dashboard
changes (via `repository_dispatch` from its `notify-demo.yml`) or manually
from the Actions tab. The automatic trigger needs a one-time setup: a
fine-grained PAT with **Contents: read/write** on this repo, stored in the
**flakehound** repo as the `DEMO_DISPATCH_TOKEN` secret — until then the
manual button does the same job. One caveat when watching a deploy: GitHub Pages serves
with a ~10-minute cache (`max-age=600`), so hard-refresh (Cmd+Shift+R) to see
a fresh deploy sooner.

### 4 · Quarantine & auto-release — `flakehound quarantine --apply`

After each analysis, [`scripts/quarantine.mjs`](scripts/quarantine.mjs) applies
flakehound's verdicts (config in [`flakehound.config.ts`](flakehound.config.ts)):

- **Quarantine:** tests classified flaky with **high** confidence get
  `{ tag: '@flakehound-quarantined' }` added to their `test(...)` call — a
  surgical ts-morph edit that touches nothing else — plus a machine-readable
  marker comment, one **GitHub issue** per test (cluster trace, score, AI
  hypothesis), and an entry in `flakehound.quarantine.json`.
- **The two lanes:** [PR CI](.github/workflows/ci.yml) runs
  `playwright test --grep-invert "@flakehound-quarantined"` — a quarantined
  flake can never block a pull request. The scheduled history lane keeps
  running *everything*, which is exactly what keeps a quarantined test's
  signal flowing.
- **Auto-release:** after `stableRunsToRelease: 5` consecutive clean passes
  (no failures, no skips, no retry flips — ~30 hours at this cadence), the next
  run removes the tag and marker (restoring the spec byte-identically), closes
  the issue with a comment, and prunes the state file. The dashboard's
  **Quarantined Tests** panel shows each test's progress toward release.
- **Safety rails on display:** `login` is on `quarantine.criticalTests` and can
  never be auto-quarantined; `restock` never clears the confidence bar; and the
  whole thing is dry-run-by-default when you run it yourself — this pipeline
  passes `--apply` explicitly.

**The staged story arc:** `payment` was quarantined on 2026-07-12
([issue #2](https://github.com/mayageva11/flakehound-demo/issues/2)), and its
underlying bug (defect 2, the promo race) was fixed in the app the same day.
Five scheduled runs later flakehound releases it automatically — closed issue,
un-tagged spec, empty progress bar — while `checkout`
([issue #1](https://github.com/mayageva11/flakehound-demo/issues/1), whose bug
stays planted) remains quarantined indefinitely. One caveat worth knowing: `checkout` passes
~57% of runs, so once in a while it can luck into 5 clean passes and get
released — the next flip simply re-quarantines it with a fresh issue. The
system is self-healing in both directions.

---

## Run it locally

```sh
npm install
npm run test:install     # one-time: Playwright's chromium
npm test                 # boots a local static server for docs/shop and runs the suite
npm run analyze          # clusters history/ → docs/flakehound.report.json
node scripts/quarantine.mjs   # applies quarantine verdicts (needs GITHUB_TOKEN for issues)
```

The scripts locate flakehound automatically: `FLAKEHOUND_CLI` env override → the
pinned **npm devDependency** (what CI uses) → a sibling `../flakehound` checkout
→ clone-and-build into `.flakehound/`. Then open `docs/index.html` (via any
static server, e.g. `npx serve docs`) to see the dashboard.

For PR-based repos there's also a one-step alternative to the hand-rolled
workflow here — flakehound's reusable action, which gates, posts the summary as
a PR comment, and reports pending quarantine actions (read-only):

```yaml
- uses: mayageva11/flakehound@v0.3.1
  with:
    input-glob: 'history/**/*.xml'
    baseline: flakehound.report.json
    comment: 'true'
    quarantine: 'true'   # dry-run report + quarantine-pending output
```

Because defects 1, 2 and 4 are timing-based, a single local run is a coin toss —
run `npm test` a handful of times and watch them flip while `receipt` fails
every time.

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
- Quarantine edits are **visible, reversible commits** made by the pipeline bot —
  a tag and a marker comment, nothing else — and every one is paired with a
  GitHub issue you can audit.
- The **oldest** runs in `history/` are a labelled **seed backstory**
  ([`history/README.md`](history/README.md)) that bootstraps the baseline —
  including the retry flips that make `checkout` and `payment` high-confidence
  from day one; everything after is a genuine artifact from the live site.
  Delete the seed and the pipeline still works — it just needs real runs to
  accumulate first.

## Layout

```
docs/                served by GitHub Pages
  index.html           the dashboard (repo-root URL)
  flakehound.report.json      the analysis artifact the dashboard renders
  flakehound.quarantine.json  quarantine state copy for the dashboard panel
  shop/                the Flaky Shop (static site; defects in shop/js/shop.js) → /shop/
tests/               Playwright suites + page objects + deterministic JUnit reporter
scripts/             static server, seed generator, analyze + quarantine wrappers
history/             run history (seed backstory + real runs) — flakehound's input
flakehound.config.ts flakehound + quarantine configuration
flakehound.quarantine.json   quarantine state (committed — prevents duplicate issues)
.github/workflows/   flakehound.yml (history lane) + ci.yml (blocking PR lane)
```

MIT licensed. The shop's bugs are intentional. 🙂
