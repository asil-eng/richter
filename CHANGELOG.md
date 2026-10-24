# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-24T23:29:46+05:30 — Re-analyze stale models from the empty state

- Changed: New `frontend/src/components/Reanalyze.tsx`: the NO SIGNAL panel offers RE-ANALYZE for models built before multi-language support (no `summary.languages`). `App.tsx`: re-analyzing the already-open repo reloads its model (cache-busted) and snapshots instead of being ignored as a same-slug switch. `data.ts`: `loadModel(slug, fresh)`.
- Why: Participant saw 'no source files' for AbhineethVS/arinjilley-web, a TypeScript monorepo (62 .ts files) analyzed before multi-language support; the saved model was stale.
- Validation: Re-analyzed via CLI: 61 files (55 TS, 6 JS), 145 edges, 28 snapshots; workspace package packages/core resolved (schema.ts reaches 21 files). Playwright: repo opens to the full risk map, no empty state, no page errors. `tsc -b` and `oxlint` clean.
- Limitations: Re-analysis of other stale local models is manual (button or CLI).

## 2026-10-24T23:25:26+05:30 — Multi-language import graphs (JS/TS, Go, JVM, Rust, C/C++, C#, Ruby, PHP)

- Changed: New `backend/richter/langs.py`: shared source walker (vendored/build/test/docs dirs and test-file patterns excluded, non-Python files over 400 KB skipped) and per-language import resolvers — JS/TS (relative + index, ./x.js->x.ts, tsconfig/jsconfig path aliases with comment-tolerant JSON, workspace packages), Go (go.mod module paths, package fan-out), Java/Kotlin/Scala (package+class FQCN, wildcard), Rust (mod, use crate/super/self, brace groups, workspace crates), C/C++/ObjC (#include relative then unique suffix), C# (using -> type or namespace files, capped at 60), Ruby (require_relative, gem-style require), PHP (use FQCN, require/include). `deps.py` merges them with the Python ast graph; nodes carry `lang`; model summary gains `languages`. Snapshots sparse-checkout all source extensions + go.mod/Cargo.toml/package.json/tsconfig. UI: language tag in inspector, languages in repo picker, empty-state text no longer Python-only. Added ripgrep (Rust) as a fourth demo with snapshots and AI notes. README: Languages section, ripgrep backtest row, updated limitations.
- Why: Participant asked to expand beyond Python to any repository.
- Validation: `pytest` 17 passed (new per-language tests incl. tsconfig with trailing comments, Rust brace groups, stdlib `require 'logger'` not bound to a repo file). Python demo graphs verified byte-identical before/after. Shallow-cloned zustand, express, fzf, ripgrep, gson, hiredis, sinatra, guzzle and spot-checked sampled edges; fixed two bugs found (Ruby bare-suffix require, C test.c not excluded). End to end: zustand via API (18 files), ripgrep via CLI (81 files) + 28 snapshots in 39 s + notes; Playwright screenshots of ripgrep risk map, inspector, city with time-travel and zustand risk map; no page errors. ripgrep backtest: magnitude 11%, churn 17%, random 11% (reported as-is).
- Limitations: Pattern-based extraction: same-package/namespace references with no import (Java/Kotlin/Scala/C#) are invisible; Go and C# links are package/namespace-level; Swift/Dart not parsed.

## 2026-10-24T23:13:21+05:30 — Inspector instruments: plain-English summary, gauge, risk quadrant, shockwave rings

- Changed: New `frontend/src/components/Instruments.tsx`: RiskQuadrant (every file plotted by depended-on vs reworked, four labelled zones, this file pulsing with crosshairs, dots clickable) and ShockRings (epicenter with one ring per import hop, animated shockwaves, clickable dots). `Inspector.tsx`: header now opens with a plain-English sentence (what breaks, how often it changed, by how many people), the analog gauge shared with the report card, and a verdict callout; WHY IT'S RISKY and BLAST RADIUS sections use the new instruments with one-line captions.
- Why: Participant: the inspector was still plain and a first-time viewer would not understand it; liked the analog gauge on the report card and asked for something similarly innovative.
- Validation: Playwright at 1440x1000 on rich/cells.py: summary, gauge, quadrant and rings render; no page errors. `tsc -b` and `oxlint` clean.
- Limitations: Rings show up to 90 dots per hop; very large repos collapse beyond that (counts stay exact).

## 2026-10-24T23:09:33+05:30 — Inspector redesign

- Changed: `Inspector.tsx`: magnitude header with descriptor and a one-line verdict (fragile and reworked / load-bearing but stable / reworked but isolated / quiet), a 0-10 Richter scale with a spring-in marker, STRUCTURAL/HUMAN meters with numeric values; BLAST RADIUS card (big count, % of codebase, stacked hop bar + counts); 4-column stats strip; MAGNITUDE OVER HISTORY sparkline from the time-travel snapshots; downstream hops with a colored rail, a short explanation per hop, chips sorted by importance with a magnitude dot, and expandable '+N more'. Old readout grid CSS removed. `App.tsx` passes snapshots to the inspector.
- Why: Participant asked to make the file inspector much better and more attractive.
- Validation: Playwright at 1440x1000: selected rich/cells.py via finder; header, blast card, stats, history and hops render; '+24 more' expands and collapses; no page errors. `tsc -b` and `oxlint` clean.
- Limitations: History curve uses the snapshot normalization (human axis vs present-day max), so it can differ from the header by ~0.1; the end label shows the current score.

## 2026-10-24T23:03:49+05:30 — Canvas vs panel surfaces

- Changed: `tokens.css`: canvas `--bg` darkened to #060809; panel tokens lifted to slate (`--bg-1` #13191d, `--bg-2` #1a2227, `--bg-3` #20292f). `app.css`: graph-paper grid moved from the whole app onto `.stage` only, with an inset shadow so the canvas reads recessed; rails and top bar use the panel color with stronger edge lines.
- Why: Participant asked for only the canvas to be dark and the sidebars to be a different color, without changing the overall look.
- Validation: Playwright screenshots at 1440x900 of the home and selection states; finder/select flow still works, no page errors.
- Limitations: None identified in these checks.

## 2026-10-24T23:00:06+05:30 — UX pass: start-here panel, file finder, zoom controls, hop legend

- Changed: Opens on the Risk Map instead of the monochrome graph (`App.tsx`). Empty inspector replaced by START HERE: one-click epicenters (most dangerous, widest reach, most reworked, one author) plus a HOW TO READ legend (size, color, hops, ghost edge, broken ring) and keys (`Inspector.tsx`). New `FileFinder.tsx` (press F, type, Enter; filename matches first, then by magnitude). Graph view: +/−/FIT buttons, hop-color legend during a cascade, and the camera glides to a selected file if it is off-screen (`GraphView.tsx`). Top-risk titles wrap instead of truncating.
- Why: Participant asked to improve overall visibility and UX: first screen was hard to read, the right rail was empty until a click, files were hard to find, zoom wasn't discoverable, cascade colors weren't explained.
- Validation: Playwright at 1440x900: home screen, F + 'traceb' + Enter selects rich/traceback.py, cascade with legend, zoom +/+/FIT; no page errors. `tsc -b` and `oxlint` clean.
- Limitations: Zoom buttons are on the 2D views only; the city uses orbit controls.

## 2026-10-24T22:57:03+05:30 — Searchable repo picker + empty state for non-Python repos

- Changed: Added `frontend/src/components/RepoPicker.tsx`: one REPO button (current repo, count, chevron) opening a dropdown with search (multi-term), per-repo files/commits and a TIME-TRAVEL tag, keyboard navigation (/ to open from anywhere, arrows, Enter, Esc) and click-outside close; replaces the scrolling tab strip in `TopBar.tsx` (old tab CSS removed). `App.tsx`: repos with zero analyzable Python files show a NO SIGNAL panel instead of the rails and views; the picker labels them 'no Python files'.
- Why: Participant asked for a dropdown with search instead of a growing row of tabs. While testing, opening a non-Python repo (0 files) crashed the page with 'Reduce of empty array with no initial value'.
- Validation: Playwright: open picker, search 'star' -> 1 row, Enter selects Kludex/starlette, '/' opens, Esc and outside click close, no-match message shown. Zero-file repo now renders the NO SIGNAL panel with no page errors (previously threw). `tsc -b` and `oxlint` clean.
- Limitations: None identified in these checks.

## 2026-10-24T22:51:34+05:30 — Visible background grid

- Changed: `frontend/src/styles/app.css`: background instrument grid raised from 1.8% opacity with a top fade to a two-level grid (minor 32px at 4%, major 128px at 8.5%), no fade.
- Why: Participant: the background grid was not visible.
- Validation: Playwright screenshot at 1440x900 with a selection active; grid visible behind the graph without competing with nodes. No page errors.
- Limitations: None identified in these checks.

## 2026-10-24T22:41:35+05:30 — City visibility pass + fix lost snapshots on re-click

- Changed: `CityView.tsx`: coarser, evenly lit window texture (was fine grain that read as static), lighter matte tower bodies so faces shade, stronger hemisphere/moon/ambient light and exposure, brighter ground grid and district plots/outlines, bloom reduced (strength 0.95->0.6, threshold 0.16->0.42) and peak emissive lowered so hot towers stay crisp. `App.tsx`: re-clicking the already-open repo tab no longer clears its snapshots.
- Why: Participant: code city visibility was poor. While checking, found that clicking the active repo tab wiped time-travel data (the load effect does not re-run for the same slug).
- Validation: Before/after Playwright screenshots of rich and starlette cities at 1440x900; rich timeline present after re-clicking its tab. `tsc -b` and `oxlint` clean.
- Limitations: Checked with software WebGL; GPU bloom may differ slightly.

## 2026-10-24T22:36:42+05:30 — Revert camera-facing district labels

- Changed: Restored `frontend/src/views/CityView.tsx` to its version before commit 8da6b0c: district labels lie flat at a fixed position on each plot's front edge, original label brightness. The legend/HUD change from 8da6b0c is kept.
- Why: Participant asked for the label change to be undone.
- Validation: `git diff` shows only CityView.tsx reverted (17 lines removed, 2 restored); `tsc -b` clean.
- Limitations: Labels read mirrored when the camera orbits to the far side, as before.

## 2026-10-24T22:34:54+05:30 — City: camera-facing district labels, clearer legend

- Changed: `CityView.tsx`: district labels turn to face the camera every frame and sit on the plot edge nearest the viewer (they read mirrored/upside-down when orbiting); label color kept below the bloom threshold. `App.tsx` + `app.css`: HUD restructured into a wrapping row plus hint line; city legend now says DISTRICT = FOLDER WITH .PY FILES, with a tooltip noting tests/docs/examples are excluded by default.
- Why: Participant saw 3 districts for starlette but 6 top-level folders on GitHub, and upside-down labels. Verified: .github, docs and scripts contain 0 .py files; tests/ (35 .py) is excluded by default, so 3 districts (starlette, starlette/middleware, benchmarks) is correct — the UI just didn't say so.
- Validation: Counted .py files per folder in the starlette clone. Playwright screenshots of the starlette city from the default view and after orbiting to the far side: labels upright; HUD no longer overlaps. `tsc -b` and `oxlint` clean.
- Limitations: Including tests in the city requires `richter.cli analyze --include-tests`; there is no UI toggle.

## 2026-10-24T22:29:21+05:30 — Fix: long URL in Analyze shifted the whole UI sideways

- Changed: `frontend/src/styles/app.css`: repo tabs strip shrinks and scrolls horizontally (hidden scrollbar, edge fade) so the top bar never exceeds the viewport; `overflow: clip` on body, `.app` and `.topbar` so the page cannot be scrolled programmatically; ellipsis in the Analyze input. `TopBar.tsx`: active repo tab scrolls into view.
- Why: Participant report: with several repos analyzed, typing a long URL scrolled the overflowing top bar's container to keep the caret visible, cutting off the left rail.
- Validation: Reproduced with Playwright at 1600px (top bar 1840px wide, page scrolled 144px). After fix, typing a long URL at 1280/1440/1600/1920px leaves scroll at 0 and the left rail at x=0. `tsc -b` and `oxlint` clean.
- Limitations: None identified in these checks.

## 2026-10-24T22:25:10+05:30 — Readability pass

- Changed: Raised text contrast (tokens: text-2 #bcc8cd, text-3 #8f9ea6, text-4 #66747c; previously ~3:1 and ~2:1 on the panel background), larger type scale (smallest 10.5px, was 9px), letter-spacing on small-caps labels tightened from 0.12-0.22em to 0.08em, brighter hairlines, wider rails. Graph labels 12.5px medium with dark halo; graph-mode nodes and edges brighter; city district labels larger and brighter. Renamed left-rail section to HOTTEST FILES.
- Why: Participant feedback: visibility and readability were poor.
- Validation: `tsc -b` clean, `oxlint` clean. Playwright screenshots at 1440x900 of graph and selection states reviewed; no page errors.
- Limitations: None identified in these checks.

## 2026-10-24T22:10:07+05:30 — Real AI notes: sharper prompts, portable cache, offline bundle

- Changed: `backend/richter/agent.py`: cache keyed on repo HEAD + file/question instead of prompt text (prompts contain local-clone excerpts, so the committed cache must hit on other machines); dependents passed most-important-first; prompts demand file-specific checklists and name classes/functions; ask summary labels every column (fixes a misread of the bus-factor flag). Added `precompute_notes` + `richter.cli notes <url>` writing `data/notes/<slug>.json`. Frontend `data.ts` falls back to that bundle when the API is unreachable. Committed AI notes (guard + unblock for 14 files per demo repo) and answers to the 3 suggested questions, plus `data/cache/`.
- Why: With a key available, the demo should show real AI output — and keep showing it offline.
- Validation: `pytest` 12 passed; `tsc -b` and `oxlint` clean. 84 AI notes + 9 answers generated, 0 invented paths dropped. Spot-checked notes against code (fastapi routing.py cites request_response/starlette; black __init__.py plan cites recurring CLI-option fixes). Playwright: ask + note with live API and with backend stopped both render `AI · GPT-4O-MINI · CACHED`; no errors. Scanned data/notes and data/cache for key strings: none.
- Limitations: First prompt version misread the bus-factor column; fixed by labelling columns, earlier outputs discarded. Free-form questions beyond the 3 suggestions need a key.

## 2026-10-24T22:01:06+05:30 — Backtest: magnitude vs later fixes

- Changed: Added `backend/richter/backtest.py` and `richter.cli backtest <url> [--cutoff]`: scores a repo at the snapshot nearest a history cutoff and measures the share of later fix-commit touches landing in the top 10% by magnitude, against churn-only and random baselines. README gains a Backtest section with the results.
- Why: Turns 'nice visualization' into a checkable claim, and reports it honestly.
- Validation: Ran at cutoffs 0.5/0.6/0.7 on all three demo repos. At 0.6: rich 45% (churn 46%, random 10%), fastapi 68% (72%, 10%), black 42% (48%, 11%). pytest 12 passed. Scoring not changed (still SCORING_VERSION 1.0).
- Limitations: Magnitude does not beat a churn-only ranking at predicting future fixes; its added value is impact (blast radius). Small samples (5-8 top files per repo).

## 2026-10-24T22:00:00+05:30 — README, demo media, submission draft

- Changed: Rewrote `README.md` to lead with the differentiators (blast-radius cascade, guard notes/unblock plans, time-travel, ghost edges), prior-art positioning, scoring table, demo findings, mermaid architecture, run steps and honest limitations; kept the template's project overview and event section. Added `docs/blast-radius.gif`, `docs/time-travel.gif`, `docs/city.png`, `docs/risk-map.png`, `docs/city-blast.png` (recorded from the running app with Playwright + ffmpeg). Filled `SUBMISSION.md` except the final commit SHA and checklist, which the participant must confirm.
- Why: The project is judged on the README; every number in it was checked against the analysis output in this session.
- Validation: Cross-checked README figures against model output and screenshots (rich cells.py 88 dependents / 81%, fastapi routing.py 193 commits 50 fixes, black __init__.py 579 commits 130 fixes, grades D/C/B). GIF sizes 4.9 MB and 6.1 MB.
- Limitations: Submission checklist left unticked for participant review. AI-note examples are not shown because no API key was available.

## 2026-10-24T21:55:51+05:30 — Design pass: laptop layout + render-safe refs

- Changed: Responsive tier at <=1480px (narrower rails, short view-tab labels, repo owners hidden, no-wrap tabs/labels) in `frontend/src/styles/app.css` + `TopBar.tsx`. Moved ref syncing out of render into layout effects (`GraphView.tsx`, `CityView.tsx`, `Seismo.tsx`) and the repo-switch state reset from an effect into an `openRepo` handler (`App.tsx`).
- Why: At 1280x800 the top bar wrapped and the Analyze button was cut off. Lint flagged ref writes and impure calls during render, which React does not guarantee to behave.
- Validation: `npm run build` succeeds; `oxlint src` 0 warnings; `tsc -b` clean. Playwright: boot screen, 1280x800 layout with ask error state, cascade and city regression shots; no page errors.
- Limitations: JS bundle is 865 kB (235 kB gzip), mostly three.js; not code-split.

## 2026-10-24T21:53:43+05:30 — Time-travel: snapshots + scrubber

- Changed: Added `backend/richter/snapshots.py` + `richter.cli snapshots <url>`: 28 sampled commits, sparse (`*.py`) blobless worktree checkout per sample, import graph + git stats on the history prefix, scored by the frozen engine; historical paths mapped to today's files via a shared `gitstats.FileIdentity` (refactored out of `compute`). `risk.score` gained an optional `human_ref` used only by snapshots so the human axis is relative to the present-day maximum. Frontend `Timeline.tsx`: seismogram of commit/fix activity, draggable needle, eased 14 s playback, NOW reset; city towers interpolate between frames, unborn files are flat, and the skyline scales with file count. Committed snapshots for rich, fastapi, black.
- Why: Hero feature: watch the city grow and redden as rework accumulates. Precomputed so the demo runs offline.
- Validation: `pytest` 12 passed. Snapshot runs: rich 46 s, fastapi 36 s, black ~1 min. rich grows 25 -> 109 files; the jump at the last frame was checked and is real (`_unicode_data` package added Jan 2026). Playwright screenshots at 5%, 45%, 80% of history and during playback; no errors. HEAD-frame scoring is unchanged (SCORING_VERSION 1.0).
- Limitations: Files added only via merge commits are not mapped (log uses --no-merges). Snapshots for freshly analyzed repos must be generated with the CLI; the UI does not trigger them.

## 2026-10-24T21:49:26+05:30 — Stage 5b: 3D code city

- Changed: Added `frontend/src/views/CityView.tsx` (three.js): folders as districts (shelf-packed plots with hairline edges and ground labels), files as towers (height = importance, emissive window texture colored by magnitude), UnrealBloom, ACES tone mapping, soft moonlight shadows, linear fog matched to a gradient sky in linear space, blinking beacons and red spill lights on the five hottest towers, intro fly-in, idle auto-orbit, hover outline + tooltip, click-to-select with a light column, ground shockwave rings and hop-timed cascade. Towers move on underdamped springs. Wired view 3 / key `3` in `App.tsx`; HUD hint moved under the view title; on-brand focus-visible outline.
- Why: Second view of the same JSON model; the spring-driven towers are the base for time-travel.
- Validation: `tsc -b` clean. Playwright (headless Chrome, SwiftShader WebGL) screenshots of rich, fastapi and black cities idle and with selection; no console or page errors. Fixed from screenshots: over-tall towers/cropped framing, solid beam, window shimmer, over-dark idle city, exponential fog swallowing the city, sky/fog color-space mismatch.
- Limitations: Visuals verified with software WebGL only; bloom on a real GPU may read slightly stronger. Large single-folder repos render as one dense district.

## 2026-10-24T21:43:15+05:30 — Stage 5a: control-room UI + 2D graph with blast-radius cascade

- Changed: Added `frontend/` (React 19 + Vite 8 + TypeScript). Canvas 2D dependency graph (d3-force layout clustered by folder) with the blast-radius cascade: shockwave rings from the selected file, a pulse travelling along each import edge hop by hop, spring-damped ignition of dependents colored by distance. Risk Map mode (color = magnitude), ghost-edge and bus-factor layers, left rail (repo stats, report card gauge, top risks, hottest files), right inspector (metrics, dependents by hop, hidden coupling, guard note / unblock plan), ask bar, boot screen. Design tokens in `frontend/src/styles/tokens.css`. Backend: `data/models/index.json` manifest so demo repos load statically without the API.
- Why: The blast-radius cascade is the signature interaction; the control-room layout keeps every metric one glance away.
- Validation: `tsc -b` clean. Drove the app in headless Chrome via Playwright: graph, risk map, cascade frames on rich/cells.py (88 dependents over 3 hops), ghost + bus layers, repo switch to fastapi — no page errors. Backend pytest 10 passed.
- Limitations: Code city tab disabled until stage 5b. Ghost edges, report card and ask bar were built in the same pass as the core graph (core cascade verified first). Ask-the-repo untested end-to-end without an API key.

## 2026-10-24T21:30:22+05:30 — Stage 4: agent actions + API

- Changed: Added `backend/richter/agent.py` (gpt-4o-mini guard notes, unblock plans, ask-the-repo with JSON output; disk cache in `data/cache/`; ask-the-repo file paths validated against the model; labelled rule-based fallback when no key) and `backend/richter/api.py` (FastAPI: repos, model, snapshots, background analyze jobs with stages, note, ask). Committed demo models for rich and black.
- Why: Agent actions write notes, not code; small prompts (one file's metrics, dependents, capped excerpt). Cache makes demos instant/offline. Path validation guarantees no invented file is ever highlighted.
- Validation: `pytest` 10 passed (invented paths dropped; offline fallback labelled `rules`). Ran uvicorn and curled /api/repos (3 models), /api/note (rules fallback for rich/console.py), /api/ask (503 without key), /api/analyze with bad URL (400).
- Limitations: No OPENAI_API_KEY configured yet, so no AI responses have been generated or cached; only the rule-based fallback is verified. httpx dropped from demos (23 files).

## 2026-10-24T21:28:04+05:30 — Stage 3: risk engine + JSON model

- Changed: Added `backend/richter/risk.py` (PageRank importance, BFS reverse-import blast radius with hop distances, structural = 0.5·rank(PageRank)+0.5·rank(blast size), human = log-min-max of churn×smoothed fix ratio, magnitude = geometric mean with 0.05 floor, bus-factor flag), `pipeline.py` (one index-based JSON model), `cli.py`. Added numpy/scipy (required by networkx PageRank). Committed `data/models/fastapi__fastapi.json`.
- Why: The risk engine is the core: pure functions, isolated from I/O, so the same scoring powers the live API and precomputed snapshots.
- Validation: `pytest` 8 passed. fastapi sanity check: top-12 magnitude includes routing.py (#1), dependencies/utils.py, encoders.py, params.py, exceptions.py, applications.py; bottom 5 are trivial shims. Scoring frozen at SCORING_VERSION 1.0.
- Limitations: Magnitude quartiles on fastapi are 0.05 / 0.17 / 0.48, so ~25% of files sit at the floor (leaf files with little history).

## 2026-10-24T21:25:21+05:30 — Stage 2: dependency + git parsers

- Changed: Added `backend/richter/deps.py` (ast import graph with relative-import, src-layout and `__init__` re-export resolution; excludes tests/, docs_src/, docs/, examples/ by default with `include_tests` option) and `backend/richter/gitstats.py` (rename-aware churn, authors, smoothed fix ratio `(fixes+1)/(churn+5)`, co-change with >30-file commit skip, ≥3 shared commits, confidence ≥0.5). Tests in `backend/tests/`.
- Why: Two independent signals over the same files: structural (who imports whom) and human (where work is repeatedly reworked). Re-export resolution prevents the graph collapsing into a star on `__init__.py`.
- Validation: `pytest` 5 passed. fastapi: 67 files, 125 edges, 2% of edges on `__init__.py`; spot-checked `applications.py` imports against source. Top human risk = `dependencies/utils.py` (183 commits, 60 fixes) and `routing.py`; 17 ghost co-change pairs (the `security/*` modules).
- Limitations: Imports consumed outside the repo (library public API) are invisible, so public entry modules show low in-repo importance. Fix detection is a commit-message regex.

## 2026-10-24T21:16:00+05:30 — Stage 1: ingest

- Changed: Added `backend/richter/ingest.py` (blobless clone via `git clone --filter=blob:none`, full `git log --no-merges -M --name-status` parse into commits + file changes), `backend/requirements.txt`, `.env.example`, `.gitignore` entries for `.repos/`.
- Why: Churn, authorship and co-change need full history; blobless clone keeps it fast. Rename detection keeps file histories continuous.
- Validation: `python -m richter.ingest https://github.com/fastapi/fastapi` → 7932 commits, 920 authors, 1045 renames in 238.6 s on first run; re-reading the cached clone returned 7932 commits.
- Limitations: First run on large repos is slow because rename detection lazily fetches blobs.

## Template setup — 10 October 2026

- Changed: Added the event README, rules, agent guide, change log, AI usage record, submission checklist, Git ignore rules, and pull request checklist.
- Why: Give participants a consistent starting point for event rules, basic coding patterns, documented changes, and regular commits.
- Validation: Checked local Markdown links, event detail consistency, required documents, and diff whitespace before publishing.
- Limitations: Documentation scaffolding only; no participant project, application, or working demo is included. GitHub publication and template status are verified separately after creation.
