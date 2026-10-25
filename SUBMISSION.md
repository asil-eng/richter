# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** Richter — measure the magnitude of risk in any codebase
- **Short description:** Changing a central file in an unfamiliar codebase is risky, and the risk is invisible. Richter ingests a public GitHub repo and predicts what breaks when a file changes (transitive blast radius), where work keeps getting reworked (fix-heavy churn), and which files are secretly coupled (co-change with no import). It fuses these into one magnitude score shown as a 2D risk graph and a 3D code city with time-travel, and writes guard notes and unblock plans with an LLM. It helps engineers, reviewers and newcomers touch risky code safely.
- **Code repository URL:** https://github.com/asil-eng/richter
- **Final submitted implementation commit SHA:** TODO — participant to record at submission
- **Working demo URL or local demo steps:** Live app: https://asil-eng.github.io/richter/app/ (no install). Demo video: https://asil-eng.github.io/richter/ (65 s, AI narration by ElevenLabs). Full app locally — `cd frontend && npm install && npm run dev`, open http://localhost:5173. The three demo repos load without the backend; start `cd backend && .venv/bin/uvicorn richter.api:app --port 8000` for notes, ask-the-repo and analyzing new repos.
- **Demo access requirements:** None for the demo repos (precomputed AI notes included). `OPENAI_API_KEY` in `.env` enables notes for other files and free-form questions.

## Participants

List participants according to the organizers' current participation format. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| Muhammed Asil Pari | [@asil-eng](https://github.com/asil-eng) | Project idea, spec, review and direction; implementation with Claude Code (see AI_USAGE.md) |

## Run and demonstrate

- **Prerequisites and versions:** Python 3.11+ (tested on 3.14), git 2.30+, Node 20.19+ (tested on 24)
- **Install command:** `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`; `cd frontend && npm install`
- **Required environment variable names:** `OPENAI_API_KEY` (optional; see `.env.example`)
- **Start command:** `cd backend && .venv/bin/uvicorn richter.api:app --port 8000` and `cd frontend && npm run dev`
- **Demo walkthrough:** (1) rich loads with its report card (grade D, M 6.5). (2) Press `2` for the risk map, click `cells.py` in the hottest list → blast-radius cascade over 88 dependents. (3) Toggle *Ghost edges*. (4) Press `3` for the code city, press ▶ on the timeline to watch 2019→2026. (5) Switch to fastapi/black in the top bar. (6) With a key: ask “which files are most fragile?”.
- **Checks performed and results:** backend `pytest` 12 passed; frontend `tsc -b` clean, `npm run build` succeeds, `oxlint src` 0 warnings; UI driven in headless Chrome via Playwright for every view with no page errors.
- **Known limitations or incomplete features:** Import parsing outside Python is pattern-based (see README → Languages); free-form ask-the-repo needs an API key (suggested questions and 14 files per demo repo are precomputed); fix detection is a commit-message regex; first ingest of large repos is slow. See README → Scope and limitations.
- **Libraries, APIs, and public datasets used:** FastAPI, GitPython, networkx, NumPy/SciPy, React, Vite, d3-force, three.js, IBM Plex Mono and Archivo (Fontsource), OpenAI API; demo data derived from public repos Textualize/rich, fastapi/fastapi, psf/black.
- **AI usage record:** [AI_USAGE.md](AI_USAGE.md)
- **Development change log:** [CHANGELOG.md](CHANGELOG.md)

## Submission checklist

- [ ] The project follows the organizers' current project-start and eligibility instructions.
- [ ] The participation format follows the organizers' current instructions.
- [ ] Any AI usage record included accurately identifies the tools used; this template requires no particular AI tool or provider.
- [ ] The code repository URL, short description, and working demo are provided.
- [ ] README setup and demo instructions match the submitted code.
- [ ] Actual checks and known limitations are documented.
- [ ] Meaningful changes are documented and committed throughout development.
- [ ] The final implementation is committed and pushed, and its SHA is recorded above.
- [ ] No credentials or private data are included in the repository or demo instructions.
- [ ] The organizers' announced submission method and timing have been followed.

Event: **Devin Hack Kochi**. Follow the organizers' current submission method and deadline. The event has no major AI usage constraints.
