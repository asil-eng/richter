# AI usage record

If maintaining this record, briefly document the actual contributions of whichever AI tools you use at Devin Hack Kochi. Add a row after each meaningful task or milestone. Keep summaries concise and omit secrets, private data, and full chat transcripts.

## Event build log

No participant AI usage has been recorded yet. Replace the placeholder row as you build. Mark human review as pending until someone has reviewed the contribution.

| Date and time with timezone | Tool / model, if known | Task | Assistance and affected files | Human review / corrections | Validation and result |
| --- | --- | --- | --- | --- | --- |
| 2026-10-24T21:16+05:30 | Claude Code (Claude Opus 5.5) | Spec review; project scaffold; stage 1 ingest | Reviewed the project spec and suggested fixes (blobless clone, fix-ratio metric, co-change de-noising); wrote `backend/richter/ingest.py`, README overview, this log | Spec changes reviewed and approved by participant; code review pending | Ran ingest on fastapi: 7932 commits parsed |
| 2026-10-24T21:25+05:30 | Claude Code (Claude Opus 5.5) | Stage 2: dependency + git parsers | Wrote `backend/richter/deps.py`, `backend/richter/gitstats.py` and tests | Pending participant review | pytest 5 passed; fastapi graph/history spot-checked |
| 2026-10-24T21:28+05:30 | Claude Code (Claude Opus 5.5) | Stage 3: risk engine + JSON model | Wrote `risk.py`, `pipeline.py`, `cli.py`, tests; ran the sanity check | Pending participant review | pytest 8 passed; CLI analyze fastapi in 2.3 s |
| 2026-10-24T21:30+05:30 | Claude Code (Claude Opus 5.5) | Stage 4: agent actions + API | Wrote `agent.py`, `api.py`, agent tests | Pending participant review | pytest 10 passed; endpoints exercised with curl |
| 2026-10-24T21:43+05:30 | Claude Code (Claude Opus 5.5) | Stage 5a: control-room UI + 2D graph with blast-radius cascade | Wrote the frontend (views, components, styles) and iterated on layout/labels from screenshots | Pending participant review | tsc clean; Playwright screenshots reviewed, no page errors |
| 2026-10-24T21:49+05:30 | Claude Code (Claude Opus 5.5) | Stage 5b: 3D code city | Wrote `CityView.tsx` and iterated lighting/fog/camera from screenshots | Pending participant review | tsc clean; screenshots reviewed, no errors |
| 2026-10-24T21:53+05:30 | Claude Code (Claude Opus 5.5) | Time-travel: snapshots + scrubber | Wrote snapshots pipeline, FileIdentity refactor, Timeline component, city interpolation | Pending participant review | pytest 12 passed; screenshots reviewed |
| 2026-10-24T21:55+05:30 | Claude Code (Claude Opus 5.5) | Design pass: laptop layout + render-safe refs | Screen-by-screen design review and fixes | Pending participant review | build + lint clean; screenshots reviewed |
| 2026-10-24T22:00+05:30 | Claude Code (Claude Opus 5.5) | README, demo media, submission draft | Wrote README and SUBMISSION drafts; recorded and encoded demo GIFs/screenshots | Pending participant review | Figures cross-checked against generated models |
| 2026-10-24T22:01+05:30 | Claude Code (Claude Opus 5.5) | Backtest: magnitude vs later fixes | Designed and ran the backtest; wrote README section with the unflattering comparison included | Pending participant review | Results reproduced via CLI |
| 2026-10-24T22:10+05:30 | Claude Code (Claude Opus 5.5) | Real AI notes: sharper prompts, portable cache, offline bundle | Improved agent prompts and caching, generated and reviewed AI notes, added offline fallback | Pending participant review | pytest 12 passed; live + offline UI checks |
| 2026-10-24T22:25+05:30 | Claude Code (Claude Opus 5.5) | Readability pass | Readability pass on tokens, CSS and canvas labels | Pending participant review | tsc/lint clean; screenshots reviewed |
| 2026-10-24T22:29+05:30 | Claude Code (Claude Opus 5.5) | Fix: long URL in Analyze shifted the whole UI sideways | Diagnosed and fixed top-bar overflow | Pending participant review | Playwright measurements at 4 widths |
| 2026-10-24T22:34+05:30 | Claude Code (Claude Opus 5.5) | City: camera-facing district labels, clearer legend | Diagnosed folder/district question, fixed label orientation and HUD | Pending participant review | Screenshots from two camera angles |
| 2026-10-24T22:36+05:30 | Claude Code (Claude Opus 5.5) | Revert camera-facing district labels | Reverted label orientation change on request | Pending participant review | tsc clean |
| 2026-10-24T22:41+05:30 | Claude Code (Claude Opus 5.5) | City visibility pass + fix lost snapshots on re-click | City lighting/material/bloom pass; fixed repo re-click bug | Pending participant review | Before/after screenshots |
| 2026-10-24T22:51+05:30 | Claude Code (Claude Opus 5.5) | Visible background grid | Background grid visibility | Pending participant review | Screenshot reviewed |
| 2026-10-24T22:57+05:30 | Claude Code (Claude Opus 5.5) | Searchable repo picker + empty state for non-Python repos | Built repo picker; found and fixed empty-repo crash | Pending participant review | Playwright interaction checks |
| 2026-10-24T23:00+05:30 | Claude Code (Claude Opus 5.5) | UX pass: start-here panel, file finder, zoom controls, hop legend | UX pass across inspector, graph overlays and file finder | Pending participant review | Playwright interaction + screenshots |
| 2026-10-24T23:03+05:30 | Claude Code (Claude Opus 5.5) | Canvas vs panel surfaces | Surface color split between canvas and panels | Pending participant review | Screenshots reviewed |
| 2026-10-24T23:09+05:30 | Claude Code (Claude Opus 5.5) | Inspector redesign | Inspector redesign | Pending participant review | Screenshots reviewed |
| 2026-10-24T23:13+05:30 | Claude Code (Claude Opus 5.5) | Inspector instruments: plain-English summary, gauge, risk quadrant, shockwave rings | Designed and built the inspector instruments | Pending participant review | Screenshots reviewed |
| 2026-10-24T23:25+05:30 | Claude Code (Claude Opus 5.5) | Multi-language import graphs (JS/TS, Go, JVM, Rust, C/C++, C#, Ruby, PHP) | Designed and implemented multi-language parsing, tests, real-repo verification | Pending participant review | pytest 17 passed; 8 real repos checked |
| 2026-10-24T23:29+05:30 | Claude Code (Claude Opus 5.5) | Re-analyze stale models from the empty state | Diagnosed stale model; added re-analyze flow | Pending participant review | CLI + Playwright |
| 2026-10-24T23:37+05:30 | Claude Code (Claude Opus 5.5) | Ask bar redesign | Ask bar redesign | Pending participant review | Playwright interaction + screenshots |
| 2026-10-24T23:45+05:30 | Claude Code (Claude Opus 5.5) | Ask-the-repo knows the current selection | Selection-aware ask: backend context + UI chip | Pending participant review | pytest + live UI questions checked against model |
| 2026-10-24T23:50+05:30 | Claude Code (Claude Opus 5.5) | Graph as a seismic hazard map: isoseismal contours, aftershocks, magnitude labels | Hazard-map rendering for the 2D graph | Pending participant review | Screenshots on two repos; fixed an exaggeration found in review |
| 2026-10-25T00:24+05:30 | Claude Code (Claude Opus 5.5) | Demo video (AI narration) + thumbnail | Wrote narration, generated AI voice, scripted recording, composited and encoded the video | Pending participant review | Frame review + loudness measurement |
| 2026-10-25T00:33+05:30 | Claude Code (Claude Opus 5.5) | README rewrite with fresh media and demo video | README rewrite and media generation | Pending participant review | Paths, anchors and figures verified |
| 2026-10-25T00:39+05:30 | Claude Code (Claude Opus 5.5) | Demo video hosted on GitHub Pages | Diagnosed video link; set up Pages player | Pending participant review | HTTP headers + browser playback |
| 2026-10-25T00:47+05:30 | Claude Code (Claude Opus 5.5) | Hosted live demo + README overhaul | Static hosting mode, Pages build, README rewrite | Pending participant review | Live URL tested end to end; links validated |

## Template preparation

This historical preparation note refers to the older template. It does not define Devin Hack Kochi's event rules or AI tool requirements.

On 10 October 2026, Codex prepared this documentation template from the organizer's supplied rules and checked the linked Luma page for the event name and dates. This covered `README.md`, `RULES.md`, `AGENTS.md`, `CHANGELOG.md`, `AI_USAGE.md`, `SUBMISSION.md`, `.gitignore`, and the pull request checklist. Agent validation covered local links, event consistency, required documents, and diff whitespace; organizer review is pending.

This preparation is separate from participant project implementation and participant AI usage during the event.

## Event documentation correction — 2026-10-24T21:53:05+05:30

- Tool: Codex.
- Task: correct the organizer-shared template to Devin Hack Kochi and clarify
  that the event has no major AI usage constraints.
- Affected files: `.github/pull_request_template.md`, `AGENTS.md`, `AI_USAGE.md`, `CHANGELOG.md`, `README.md`, `RULES.md`, `SUBMISSION.md`.
- Human review: pending maintainer review of this pull request.
- Validation: documentation diff, whitespace, and local Markdown link checks;
  no application code changed and no runtime checks were needed.

- 2026-10-24T22:04:32+05:30 — Codex preserved the participant's new README during conflict resolution and corrected its reintroduced old-event footer. Human review remains pending; documentation checks only.
