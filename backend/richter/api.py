"""FastAPI server: `uvicorn richter.api:app --reload --port 8000` (from backend/)."""

from __future__ import annotations

import json
import threading
import time
import uuid
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import agent
from .ingest import REPOS_DIR, clone, read_log, repo_slug
from .pipeline import MODELS_DIR, build_model, write_manifest

SNAPSHOTS_DIR = MODELS_DIR.parent / "snapshots"

app = FastAPI(title="Richter")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@lru_cache(maxsize=16)
def _load(slug: str, mtime: float) -> dict:
    return json.loads((MODELS_DIR / f"{slug}.json").read_text())


def load_model(slug: str) -> dict:
    p = MODELS_DIR / f"{slug}.json"
    if not p.exists():
        raise HTTPException(404, f"no model for {slug}")
    return _load(slug, p.stat().st_mtime)


def repo_root(slug: str) -> Path | None:
    p = REPOS_DIR / slug
    return p if p.exists() else None


@app.get("/api/repos")
def repos():
    return write_manifest()


@app.get("/api/model/{slug}")
def model(slug: str):
    return load_model(slug)


@app.get("/api/snapshots/{slug}")
def snapshots(slug: str):
    p = SNAPSHOTS_DIR / f"{slug}.json"
    if not p.exists():
        raise HTTPException(404, f"no snapshots for {slug}")
    return json.loads(p.read_text())


# ---------------------------------------------------------------- live analysis

JOBS: dict[str, dict] = {}


class AnalyzeReq(BaseModel):
    url: str
    include_tests: bool = False


def _run_job(job_id: str, url: str, include_tests: bool) -> None:
    job = JOBS[job_id]
    try:
        slug = repo_slug(url)
        job.update(stage="clone", detail="blobless clone — full history, no file contents")
        root = clone(url)
        job.update(stage="history", detail="reading git log with rename detection")
        commits = read_log(root)
        job.update(stage="score", detail=f"{len(commits)} commits — parsing imports, scoring risk")
        m = build_model(root, commits, url, include_tests)
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        (MODELS_DIR / f"{slug}.json").write_text(json.dumps(m, separators=(",", ":")))
        write_manifest()
        job.update(stage="done", slug=slug, detail=f"{m['summary']['files']} files scored")
    except Exception as e:  # surface the real failure to the UI
        job.update(stage="error", detail=str(e))


@app.post("/api/analyze")
def analyze(req: AnalyzeReq):
    try:
        repo_slug(req.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    job_id = uuid.uuid4().hex[:10]
    JOBS[job_id] = {"id": job_id, "stage": "queued", "detail": "", "started": time.time()}
    threading.Thread(target=_run_job, args=(job_id, req.url, req.include_tests), daemon=True).start()
    return JOBS[job_id]


@app.get("/api/jobs/{job_id}")
def job(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "unknown job")
    return JOBS[job_id]


# ---------------------------------------------------------------- agent

class NoteReq(BaseModel):
    slug: str
    file: str
    kind: str = "guard"  # guard | unblock


class AskReq(BaseModel):
    slug: str
    question: str
    focus: str | None = None  # path of the file selected in the UI


@app.post("/api/note")
def note(req: NoteReq):
    m = load_model(req.slug)
    fn = {"guard": agent.guard_note, "unblock": agent.unblock_plan}.get(req.kind)
    if fn is None:
        raise HTTPException(400, "kind must be guard or unblock")
    try:
        return fn(m, req.file, repo_root(req.slug))
    except KeyError:
        raise HTTPException(404, f"{req.file} not in model")
    except Exception as e:
        raise HTTPException(502, f"agent failed: {e}")


@app.post("/api/ask")
def ask(req: AskReq):
    m = load_model(req.slug)
    try:
        return agent.ask(m, req.question, req.focus, repo_root(req.slug))
    except KeyError:
        raise HTTPException(404, f"{req.focus} not in model")
    except agent.AgentUnavailable as e:
        raise HTTPException(503, f"Ask-the-repo needs an API key: {e}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"agent failed: {e}")
