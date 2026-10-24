"""Time-travel snapshots: the risk model re-scored at ~28 points across history.

For each sampled commit we check out only source files (sparse, blobless
worktree), rebuild the import graph, recompute git stats on the history prefix,
and score with the frozen risk engine. Historical paths are mapped to today's
files through rename tracking, so one tower in the city is one file over time.

The human axis is normalized against the present-day maximum (see risk.score
`human_ref`), so the city visibly reddens as rework accumulates.
"""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

from . import gitstats, langs, risk
from .deps import build_import_graph
from .ingest import Commit, clone, read_log, repo_slug
from .pipeline import MODELS_DIR, write_manifest

SNAPSHOTS_DIR = MODELS_DIR.parent / "snapshots"
ACTIVITY_BUCKETS = 160


def _git(*args: str) -> None:
    subprocess.run(["git", *args], check=True, capture_output=True)


def _worktree(root: Path, sha: str) -> Path:
    wt = root.parent / f"{root.name}__snap"
    if not wt.exists():
        _git("-C", str(root), "worktree", "add", "-q", "--no-checkout", "--detach", str(wt), sha)
        # only source files are needed to rebuild the import graph
        patterns = [f"*{ext}" for ext in langs.SOURCE_EXTS] + ["go.mod", "Cargo.toml", "package.json", "tsconfig.json", "jsconfig.json"]
        _git("-C", str(wt), "sparse-checkout", "set", "--no-cone", *patterns)
    _git("-C", str(wt), "checkout", "-q", "--detach", sha)
    return wt


def sample_indices(n_commits: int, frames: int) -> list[int]:
    frames = min(frames, n_commits)
    return sorted({round((k + 1) / frames * n_commits) - 1 for k in range(frames)})


def activity(commits: list[Commit]) -> list[dict]:
    t0, t1 = commits[0].timestamp, commits[-1].timestamp
    span = max(1, t1 - t0)
    buckets = [{"ts": t0 + span * b // ACTIVITY_BUCKETS, "commits": 0, "fixes": 0}
               for b in range(ACTIVITY_BUCKETS)]
    for c in commits:
        b = min(ACTIVITY_BUCKETS - 1, (c.timestamp - t0) * ACTIVITY_BUCKETS // span)
        buckets[b]["commits"] += 1
        buckets[b]["fixes"] += gitstats.is_fix(c.message)
    return buckets


def build_snapshots(url: str, frames: int = 28, include_tests: bool = False) -> dict:
    slug = repo_slug(url)
    model = json.loads((MODELS_DIR / f"{slug}.json").read_text())
    root = clone(url)
    commits = read_log(root)
    if commits[-1].sha != model["repo"]["head"]:
        raise RuntimeError("model is stale: re-run `richter.cli analyze` before snapshots")
    index = {n["id"]: i for i, n in enumerate(model["nodes"])}

    # stable identities: historical path -> file id -> today's path
    samples = sample_indices(len(commits), frames)
    identity = gitstats.FileIdentity()
    at_sample: dict[int, dict[str, int]] = {}
    for k, c in enumerate(commits):
        for ch in c.changes:
            identity.apply(ch)
        if k in samples:
            at_sample[k] = dict(identity.ids)
    today = {fid: p for p, fid in identity.ids.items()}

    present_human = max((n["churn"] * n["fix_ratio"] for n in model["nodes"]), default=0)
    human_ref = math.log1p(present_human) or 1.0

    out_frames = []
    for k in samples:
        wt = _worktree(root, commits[k].sha)
        g = build_import_graph(wt, include_tests)
        stats, _ = gitstats.compute(commits[: k + 1], keep=set(g.nodes))
        scores = risk.score(g, stats, human_ref=human_ref)
        importance: list[float | None] = [None] * len(model["nodes"])
        magnitude: list[float | None] = [None] * len(model["nodes"])
        for hist_path, r in scores.items():
            fid = at_sample[k].get(hist_path)
            i = index.get(today.get(fid, "")) if fid is not None else None
            if i is None:
                continue  # file later deleted, or outside today's model
            importance[i] = round(r.importance, 3)
            magnitude[i] = round(r.magnitude, 3)
        out_frames.append({"ts": commits[k].timestamp, "sha": commits[k].sha[:10],
                           "commits": k + 1, "importance": importance, "magnitude": magnitude})
        print(f"  frame {len(out_frames):2d}/{len(samples)}  {commits[k].sha[:7]}  "
              f"{sum(v is not None for v in importance)} files", flush=True)

    snap = {"scoring_version": risk.SCORING_VERSION,
            "normalization": "human axis relative to present-day maximum",
            "frames": out_frames, "activity": activity(commits)}
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    (SNAPSHOTS_DIR / f"{slug}.json").write_text(json.dumps(snap, separators=(",", ":")))
    write_manifest()
    return snap
