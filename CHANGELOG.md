# Change log

## 2026-10-24T22:04:32+05:30 — Keep event correction aligned with the new project README

- Changed: retained the participant's rewritten Richter README and corrected the old event footer it introduced.
- Why: the project README changed while the event correction PR was being prepared.
- Validation: documentation-only diff and whitespace checks; local Markdown links checked against the current base.
- Limitations: maintainer review is pending; no application behavior changed.

## 2026-10-24T21:53:05+05:30 — Correct Devin Hack Kochi event guidance

- Changed: corrected the current event name and AI tool guidance in `.github/pull_request_template.md`, `AGENTS.md`, `AI_USAGE.md`, `CHANGELOG.md`, `README.md`, `RULES.md`, `SUBMISSION.md`.
- Why: the organizer shared an older event template; Devin Hack Kochi has no
  major AI usage constraints and the template must not require a particular AI provider.
- Scope: preserved project implementation and historical assistance records.
- Removed obsolete template logistics, participation limits, and credit promises; current organizer instructions remain authoritative.
- Validation: reviewed documentation diffs, checked whitespace with `git diff --check`, and checked local Markdown links for new breakage.
- Limitations: maintainer review is pending; application tests were not run for this documentation-only correction.

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-25T09:06:25+05:30 — Ask-the-repo explains what a selected file does

- Changed: `backend/richter/agent.py`: the prompt now lets the assistant read the selected file's code excerpt (functions, classes, docstrings) to explain its purpose; the excerpt grows from 1,500 to 3,500 characters; `ASK_VERSION` 9.
- Why: with cells.py selected, 'what is the function of this file?' got 'not sure' — the excerpt was sent but the prompt said to use only the README and risk data.
- Validation: `pytest` 21 passed. Live: cells.py → measures terminal cell widths of Unicode characters (`CellTable`, `cell_len`, `get_character_cell_size`); hugo tpl/template.go → the template interface and `RenderingContext`; fastapi routing.py → request routing, handler matching, dependency resolution.
- Limitations: explains from the first 3,500 characters of the file; very long files are only partially seen.

## 2026-10-25T08:09:09+05:30 — Ask-the-repo understands Richter's own screen

- Changed: `backend/richter/agent.py` adds a RICHTER UI GUIDE to the ask context (what circles, sizes, colors, lines, ghost edges, contours, broken rings, the cascade, city towers, beam, timeline and both side panels mean) and the current view; `ask()` / `AskReq` take `view` (graph | risk | city), included in the cache key; `ASK_VERSION` 8. Frontend passes the current view from `App.tsx` through `AskBar` to `askRepo`.
- Why: 'what does the line between blobs in the canvas represent?' got 'not sure' — the assistant knew the repo but not the app's visuals.
- Validation: `pytest` 21 passed; `tsc -b`, `oxlint` clean. Live: graph view 'line between blobs' → imports; city view 'height of a building' → importance; risk view 'orange rings' → isoseismal contours.
- Limitations: none identified in these checks.

## 2026-10-25T08:02:06+05:30 — Ask-the-repo knows what the project is

- Changed: `backend/richter/agent.py`: new `project_block()` adds a PROJECT section to the ask context — the README excerpt from the local clone (badges/HTML stripped, 2,500 chars) and the folder layout with file counts; the prompt uses it for 'what is/does this project' questions and the risk model for risk questions; `ASK_VERSION` 7.
- Why: 'what does this repo do?' got 'not sure' because the assistant only received risk metrics.
- Validation: `pytest` 21 passed. Live: rich → 'a Python library for rich text and beautiful formatting in the terminal…'; hugo → 'a fast and flexible static site generator… written in Go'; 'what does console.py do and why is it risky?' combines purpose and magnitude.
- Limitations: the README comes from the local clone; without one the assistant infers from file and folder names and says so.

## 2026-10-25T07:58:13+05:30 — Ask-the-repo: conversation memory, full-repo context

- Changed: `backend/richter/agent.py`: `summarize_model` lists every file for repos up to 160 files (riskiest and calmest 30/20 plus min/median/max for larger ones) and collapses a long tie at the lowest displayed score into an exact count; `ask()` takes `history` (last 6 turns) and sends them as chat messages after the risk-model context; the prompt resolves follow-ups, reports ties, and says when a referenced file isn't in the conversation; cache key versioned (`ASK_VERSION`) and includes a hash of the history. `api.py` AskReq gains `history`. Frontend `AskBar.tsx` keeps a per-repo conversation thread (CONVERSATION · N QUESTIONS, NEW CHAT, copy thread, auto-scroll, 'Ask a follow-up…'); `data.ts` sends history; the hosted demo serves bundled answers only for first-turn questions. `vite.config.ts` proxy target overridable via `RICHTER_API`.
- Why: the assistant forgot earlier questions, and only saw the 25 riskiest files, so 'which file has the least score?' answered 5.1 while 0.5 files existed.
- Validation: `pytest` 21 passed (new tests: low-end coverage in the summary, history sent and keyed into the cache). Live: 'which is the file with the least score?' → several files tie at 0.5 (was 5.1); follow-ups 'why is it so low?' and 'which file is the riskiest compared to it?' resolve correctly; hugo 'safest file' answered from the calm end. UI (port 5174 against backend 8001): 3-turn thread, NEW CHAT clears, no page errors. `tsc -b`, `oxlint` clean.
- Limitations: vague references ('the file we discussed before') can still be resolved to a file named in the selection context rather than the conversation.

## 2026-10-25T06:32:42+05:30 — README: how to analyze your own repo

- Changed: New README section 'Analyze any GitHub repo': paste a public repo link into the ANALYZE box, the CLONE → HISTORY → SCORE stages, where the repo appears (REPO picker), optional snapshots/AI notes, the CLI equivalent, and limits (public repos, supported languages, very long histories, hosted demo cannot analyze). 'Try it now' links to it; the hosted demo's ANALYZE YOUR REPO button now links there too. Hosted demo rebuilt.
- Why: Participant: the README did not explain that you give Richter a repo link to analyze.
- Validation: README anchors checked with github-slugger (0 broken). `tsc -b`, `oxlint` clean.
- Limitations: None identified in these checks.

## 2026-10-25T06:06:06+05:30 — Final README pass + real CI

- Changed: README: track statement (Devin Hacks Kochi, Track 2: Make the Invisible Visible); replaced the '4–7×' headline (churn alone matches it, per our own backtest) with the city's 181-tower burst; 'nobody looks at together' -> 'rarely meet in one view'; 'Reviewing a pull request' (no PR feature) -> 'About to change a file'; run instructions no longer say 'two commands'; section 6 rebuilt around the code city with a full-width building-click burst image (`docs/city-burst.jpg`) plus time-travel; X (full screen) added to the keys table.
- Why: Final enhancement before judging: remove the claims a skeptical judge could call overstated, and give the code city its due.
- Validation: Backend pytest 19 passed locally; all README anchors resolve (github-slugger 2.0.0); all docs/ images exist. The TESTS badge links to `backend/tests`; a CI workflow was prepared but not pushed (the GitHub token lacks the `workflow` scope).
- Limitations: None identified in these checks.

## 2026-10-25T06:02:45+05:30 — Main demo video: 2.5-minute walkthrough with the city burst

- Changed: Replaced the demo with a single 2:31 walkthrough (ElevenLabs narration, word-synced actions and captions): the problem, what Richter reads, reading the hazard map, the cells.py blast radius, the inspector and danger zone, guard note and selection-aware ask, hidden coupling and bus factor, the report card, the code city with a building clicked so the shock bursts through its 181 dependents (hugo template.go), rich time-travel, a language montage, and the outro. New poster from the city burst. `docs/richter-demo.mp4` (1280x800, 17.4 MB) served via GitHub Pages; README, Pages player and SUBMISSION say 2½ minutes. App: `CityView.tsx` exposes a read-only `window.__richterCity.screenOf(path)` (tower screen position) used to click a specific building in scripted recordings. Hosted demo rebuilt.
- Why: Participant: the 65-second cut felt rushed; wanted one main video, kept on GitHub (not YouTube), with the building-click burst in the city section.
- Validation: Hook tested: clicking via screenOf selects tpl/template.go and triggers the beam, rings and 181 dependents. Raw and final contact sheets reviewed (24 frames). ebur128: -14.3 LUFS, peak -1.1 dBFS. Recording used only the 7 demo repos; local repos restored after. `tsc -b`, `oxlint` clean.
- Limitations: AI-generated voice (credited). Synthesized music bed. Video is above GitHub's 10 MB inline-upload limit, so the README links to the Pages player.

## 2026-10-25T05:37:29+05:30 — New 65-second demo video (ElevenLabs narration) + faster city switching

- Changed: Re-made the demo video: kinetic-typography cards (open, 'Your code, as a city', CTA end card), footage timed to ElevenLabs word timestamps, camera punch-ins, kinetic stats (88 files, 17x), city labels (hugo, excalidraw, rich time-travel), a Python/TypeScript/Go/Rust report-card montage synced to each spoken word, word-synced captions, a synthesized music bed side-chain ducked under the voice, whooshes and impacts; -14 LUFS. Replaced `docs/richter-demo.mp4` (1280x800, 8.8 MB), `docs/demo-play.jpg`, `docs/demo-thumbnail.jpg`; README/Pages/SUBMISSION now say 65 seconds and credit ElevenLabs. App: `CityView.tsx` plays the cinematic fly-in once per session; later repo switches settle in ~0.9 s (flag set only after an intro completes, so React StrictMode's double mount can't skip it). Hosted demo rebuilt.
- Why: Participant asked for a far more dynamic, professional demo with a more realistic voice and more emphasis on the code city.
- Validation: Contact sheets of raw footage and the final cut reviewed; fixed an empty excalidraw city (slow fly-in on every switch, fixed in the app), a picker typing race, and local non-demo repos appearing in the picker (parked during recording, restored after). ebur128: -14.2 LUFS, LRA 4.3, peak -1.1 dBFS; no silences > 1 s. `tsc -b`, `oxlint` clean.
- Limitations: Narration voice is AI-generated (ElevenLabs free tier, credited). Music is a simple synthesized bed.

## 2026-10-25T05:10:06+05:30 — Callout pointing to the repo switcher

- Changed: `TopBar.tsx`: a second callout under the REPO switcher ('Try another repo · N analyzed · <two largest other repos>…'); clicking opens the searchable picker; it disappears once the visitor switches repo or dismisses it. Both callouts are now left-anchored to their controls so they sit side by side. `app.css` styles. Hosted demo rebuilt.
- Why: Participant asked for the same kind of pointer for changing the repo as for the code city.
- Validation: Playwright at 1280, 1440 and 1920 px: both callouts visible with no overlap; clicking opens the picker, switching to hugo hides the repo callout; no page errors. `tsc -b`, `oxlint` clean.
- Limitations: None identified in these checks.

## 2026-10-25T04:43:19+05:30 — City callout on every visit + permanent 3D badge

- Changed: `TopBar.tsx`: the code-city callout is no longer remembered forever in localStorage; it shows on every page load while on Graph/Risk until the city is opened or the callout dismissed in that visit. The CODE CITY tab gets a permanent orange 3D badge. `app.css` badge style. Hosted demo rebuilt.
- Why: Participant could not see the callout: it was hidden in the city view and permanently suppressed after the first city visit.
- Validation: Playwright: callout on first load, hidden after opening the city in the same visit, shown again after reload; 3D badge present; no page errors. `tsc -b`, `oxlint` clean.
- Limitations: None identified in these checks.

## 2026-10-25T04:35:33+05:30 — Callout pointing first-time visitors to the code city

- Changed: `TopBar.tsx`: on first visit, a callout anchored under the CODE CITY tab ('See this repo as a 3D city · towers = files · glow = risk · replay its history →') appears after the boot screen, with a pulsing tab outline; clicking opens the city, ✕ dismisses it. Opening the city by any route retires it (persisted in localStorage). Styles in `app.css`. Hosted demo rebuilt.
- Why: Participant: visitors would not realise the code city exists unless told.
- Validation: Playwright: callout shown on first load, click opens CODE CITY, not shown again after returning to the risk map or after reload; no page errors. `tsc -b`, `oxlint` clean.
- Limitations: Hint state is per browser (localStorage); private windows show it again.

## 2026-10-25T04:21:16+05:30 — Three large demo repos: excalidraw, hugo, textual

- Changed: Added models, 28-frame snapshots, precomputed AI notes and cache for excalidraw/excalidraw (TypeScript, 529 files, 2,810 imports), gohugoio/hugo (Go, 537 files, 7,687 imports) and Textualize/textual (Python, 249 files, 1,106 imports). Demo index now lists seven repos; README findings table and repo counts updated; hosted demo rebuilt.
- Why: Participant wanted large, famous repos preloaded so the code city and graph look big in the demo.
- Validation: Analyses: excalidraw 173 s, hugo 334 s, textual 117 s; snapshots 38-60 s each. Headed Chrome: map, cascade and city at 120 fps for all three, no page errors. README grades computed with the app's report formula (matches the UI: excalidraw B 4.4, hugo B 3.5, textual B 4.1).
- Limitations: Repos with far longer histories (e.g. microsoft/vscode, ~130k commits) are out of reach for local analysis and the browser.

## 2026-10-25T04:07:44+05:30 — Full-screen canvas

- Changed: `App.tsx`: FULL SCREEN button (top-right of the canvas, under find file) and `X` key toggle the browser Fullscreen API on the stage (graph, risk map, city); label switches to EXIT; Esc also exits. `app.css` styles; `Inspector.tsx` keys list gains X.
- Why: Participant asked for a full-screen option for the canvas.
- Validation: Headed Chrome via Playwright: button enters full screen with the canvas at 1440x900 (= screen), city resizes to 1440x900 with timeline and ask bar intact, X exits; no page errors. `tsc -b`, `oxlint` clean. Hosted demo rebuilt.
- Limitations: The side panels are hidden in full screen; exit to read a selected file's details.

## 2026-10-25T00:47:57+05:30 — Hosted live demo + README overhaul

- Changed: Static demo mode in the frontend (`VITE_STATIC`, base-aware data paths, cached notes/answers only, clear live-only messages, ANALYZE YOUR REPO link) and `frontend/scripts/build-pages.sh` building to `docs/app/` from committed demo data only; precomputed notes now cover every START HERE pick. Live at https://asil-eng.github.io/richter/app/. README: hero with badges and four headline numbers, Try it now (live app, video, local), a collapsible 60-second judge tour, comparison with existing tool categories, why the numbers can be trusted, who it's for, collapsible scoring/language detail, roadmap (clearly marked as not built). SUBMISSION.md links the live app.
- Why: Participant: the README should make judges certain on first read; a no-install live demo is the strongest proof.
- Validation: Static build tested locally and on the live Pages URL with Playwright: cached AI note, cached answer, free-form message, repo switch, city; 0 page errors, 0 failed requests. README: 0 broken anchors (github-slugger), all images present, live/video/badge URLs return 200. A quoting bug briefly committed (apostrophe in a TS string) was fixed forward in 57318d0 before rebuilding; the published app never contained it.
- Limitations: Hosted demo answers only the ⚡ questions and precomputed notes; free-form and file-specific AI need the local backend with a key. Comparison table is compiled from public docs and marked as such.

## 2026-10-25T00:39:27+05:30 — Demo video hosted on GitHub Pages

- Changed: Added `docs/index.html` (Richter-styled player page) and `docs/.nojekyll`; enabled GitHub Pages from `main:/docs`. README thumbnail and SUBMISSION.md now link to https://asil-eng.github.io/richter/.
- Why: Participant clicked the thumbnail and GitHub's file viewer showed 'we can't show files that are this big'; raw.githubusercontent serves the mp4 as application/octet-stream, which downloads instead of playing.
- Validation: Pages status built; HTTP 200 with content-type video/mp4 and accept-ranges bytes; Playwright loaded the page and played the video (currentTime 2.8 s after 3 s, 1280x800, duration 93.5 s, no media error).
- Limitations: An inline player inside the README itself still requires uploading the mp4 through the GitHub web editor.

## 2026-10-25T00:33:22+05:30 — README rewrite with fresh media and demo video

- Changed: Rewrote `README.md`: banner, demo thumbnail linking to `docs/richter-demo.mp4`, problem statement, seven illustrated feature sections (hazard map, blast radius, inspector, ask, hidden coupling, city + time-travel, report card + languages), scoring, findings across four repos (ripgrep added), backtest with the honest reading, languages, architecture, run, keys, limitations (incl. AI narration disclosure); hackathon overview/event sections kept and updated. Regenerated all media from the caption-free demo recording (`docs/*.jpg`, `blast-radius.gif`, `time-travel.gif`); removed three outdated images. Committed the 9.1 MB demo video. SUBMISSION.md links the video.
- Why: Participant: the README is the core of the project and should be top quality with images and correct explanations.
- Validation: Every `docs/` path in the README exists; all in-page anchors checked with github-slugger 2.0.0 (6/6 ok); rendered through GitHub's /markdown API (gfm, repo context); every figure cross-checked against the models (ripgrep: grade A, M 1.8, walk.rs M 9.4 with 84 commits, 21 fixes, 31 authors).
- Limitations: An inline video player in the README needs the mp4 uploaded through the GitHub web editor; until then the thumbnail links to the file.

## 2026-10-25T00:24:00+05:30 — Demo video (AI narration) + thumbnail

- Changed: Produced a 94 s demo video outside the repo (`~/Desktop/devin/richter-demo/`: `richter-demo.mp4` 1280x800 9.5 MB for README upload, `richter-demo-1920.mp4` 1920x1200 master). Real app recorded via Chrome DevTools screencast with a scripted cursor; title/outro cards; camera punch-ins; captions in Archivo; narration generated with OpenAI `gpt-4o-mini-tts` (voice onyx); low synthesized drone and two impact hits; loudness-normalised to -16 LUFS. Added `docs/demo-thumbnail.jpg`.
- Why: Participant asked for a top-quality demo video with a human-sounding voice for the README.
- Validation: Contact-sheet review of 15 timestamps; fixed boot-screen ghosting in the title crossfade, spoken-form text in captions ('cells dot py' -> cells.py), and caption overlap. ebur128: -16.3 LUFS integrated, LRA 6 LU; no silences > 2.5 s. README version under GitHub's 10 MB upload limit.
- Limitations: Narration is an AI-generated voice and must be disclosed wherever the video is posted. Video files are not committed (size); they must be uploaded via the GitHub README editor or YouTube.

## 2026-10-24T23:50:47+05:30 — Graph as a seismic hazard map: isoseismal contours, aftershocks, magnitude labels

- Changed: `GraphView.tsx`: computes a hazard field once per layout (each file radiates its magnitude as a gaussian; field = max) and draws banded fills plus marching-squares contour lines at M5–M8 (dashed below M7) with spaced M-labels, fading in after the intro and dimming during a selection; the six hottest files (M ≥ 6) emit periodic aftershock ripples; labels show magnitude in heat color (riskiest 6 + most central 6 files). HUD adds CONTOURS = ISOSEISMAL M5–M8; HOW TO READ legend gains a contours entry.
- Why: Participant: the graph looked like just another codebase visualizer.
- Validation: Playwright screenshots of rich (graph + risk map) and arinjilley-web. First version combined fields as a probabilistic OR, which painted rich's whole core M8 around M2–M5 files — switched to max so contours only reach a level near files that actually have it. `tsc -b` and `oxlint` clean; no page errors.
- Limitations: Contours are a visual aid over a force layout; distance on the map has no meaning beyond proximity in the import graph.

## 2026-10-24T23:45:56+05:30 — Ask-the-repo knows the current selection

- Changed: Backend `agent.py`: `ask(model, question, focus, repo_root)` appends a CURRENT SELECTION block (file metrics, what it imports, dependents by hop, ghost partners, language/LOC, its folder's files ranked by magnitude, other folders importing from it, short code excerpt); the system prompt maps 'this file/this folder/it/here' to the selection; cache key includes the focus. `api.py` AskReq gains `focus` (404 if not in model). Frontend: `askRepo(..., focus)`; ask bar shows a context chip (◉ file · folder/, ✕ to ask about the whole repo, WHOLE REPO otherwise), selection-specific suggestions (impact, why risky, riskiest in folder, coupling), answers labelled '— about <file>'; offline bundle used only for repo-wide questions. Tests for focus block and cache key.
- Why: Participant: the chat did not know which file/folder was selected ('The currently selected file is not specified').
- Validation: `pytest` 19 passed; `tsc -b`, `oxlint` clean. Playwright with rich/traceback.py selected: 'which file have i currently selected and is it safe to change?' -> names rich/traceback.py, M 6.5, blast 64; 'which files in this folder are riskiest?' -> console.py 8.2, cells.py 7.8, text.py 7.5 (match the model); detaching the chip switches to WHOLE REPO; no page errors.
- Limitations: Selection-aware questions need the live API and a key (they are not in the offline bundle).

## 2026-10-24T23:37:41+05:30 — Ask bar redesign

- Changed: `frontend/src/components/AskBar.tsx` rewritten: suggestions moved out of the input into a popover above the bar (TRY ASKING / MATCHING, category tags FRAGILE/COUPLING/IMPACT/FILE, ⚡ for precomputed answers, two repo-specific questions built from the riskiest and widest-reaching files, filtering as you type, arrow keys + Enter); `A` focuses the bar; RUN button disabled until there is text, spinner while busy; READING state with the question echoed and a live seismograph; answer card with question echo, CACHED badge, COPY and CLEAR, file chips colored by magnitude with scores ('highlighted on the map · click to open'); friendly errors for a missing key or unreachable API. Styles in `app.css` replaced.
- Why: Participant: the ask bar UI/UX was poor — suggestion chips sat inside the input, overlapped the caret and RUN, and overflowed.
- Validation: Playwright at 1440x900: idle, focused popover, keyboard selection of a cached question -> answer card with 12 highlighted files, CLEAR, typing 'why is' filters to 1 suggestion, live API question shows READING then an answer; no page errors. `tsc -b` and `oxlint` clean.
- Limitations: Repo-specific suggestions are answered live, so they need the API and a key unless already cached.

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
