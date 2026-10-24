"""Orchestration: repo -> ONE JSON model the frontend reads.

Nodes are referenced by index everywhere (edges, blast lists, co-change) to keep
the payload small enough to ship precomputed demo models in the repo.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path

from . import gitstats, risk
from .deps import build_import_graph
from .ingest import Commit, clone, read_log, repo_slug

MODELS_DIR = Path(__file__).resolve().parents[2] / "data" / "models"


def build_model(root: Path, commits: list[Commit], url: str = "",
                include_tests: bool = False) -> dict:
    g = build_import_graph(root, include_tests)
    stats, cochange = gitstats.compute(commits, keep=set(g.nodes))
    scores = risk.score(g, stats)

    paths = sorted(g.nodes)
    idx = {p: i for i, p in enumerate(paths)}
    nodes = []
    for p in paths:
        r, s = scores[p], stats.get(p)
        nodes.append({
            "id": p,
            "dir": p.rsplit("/", 1)[0] if "/" in p else ".",
            "lang": g.nodes[p].get("lang", "python"),
            "loc": g.nodes[p]["loc"],
            "pagerank": round(r.pagerank, 6),
            "importance": round(r.importance, 4),
            "structural": round(r.structural, 4),
            "human": round(r.human, 4),
            "magnitude": round(r.magnitude, 4),
            "blast_size": len(r.blast),
            "blast": sorted([idx[d], h] for d, h in r.blast.items()),
            "churn": s.churn if s else 0,
            "authors": len(s.authors) if s else 0,
            "fixes": s.fixes if s else 0,
            "fix_ratio": round(s.fix_ratio, 4) if s else 0.0,
            "bus_factor": r.bus_factor,
            "last_commit": s.last_ts if s else 0,
        })
    edges = [[idx[a], idx[b]] for a, b in g.edges]
    cc = [{
        "a": idx[c.a], "b": idx[c.b], "shared": c.shared, "confidence": c.confidence,
        "ghost": not (g.has_edge(c.a, c.b) or g.has_edge(c.b, c.a)),
    } for c in cochange]

    return {
        "scoring_version": risk.SCORING_VERSION,
        "repo": {
            "url": url,
            "name": url.rstrip("/").split("github.com/")[-1] if url else root.name,
            "head": commits[-1].sha if commits else "",
            "commits": len(commits),
            "authors": len({c.author_email for c in commits}),
            "first_ts": commits[0].timestamp if commits else 0,
            "last_ts": commits[-1].timestamp if commits else 0,
            "analyzed_at": int(time.time()),
        },
        "summary": {
            "files": len(nodes),
            "edges": len(edges),
            "cochange_pairs": len(cc),
            "ghost_edges": sum(c["ghost"] for c in cc),
            "bus_factor_files": sum(n["bus_factor"] for n in nodes),
            "languages": dict(Counter(n["lang"] for n in nodes).most_common()),
        },
        "nodes": nodes,
        "edges": edges,
        "cochange": cc,
    }


def analyze(url: str, include_tests: bool = False, save: bool = True) -> dict:
    root = clone(url)
    model = build_model(root, read_log(root), url, include_tests)
    if save:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        (MODELS_DIR / f"{repo_slug(url)}.json").write_text(json.dumps(model, separators=(",", ":")))
        write_manifest()
    return model


def write_manifest() -> list[dict]:
    """data/models/index.json — lets the frontend list demo repos with no backend."""
    entries = []
    for p in sorted(MODELS_DIR.glob("*.json")):
        if p.name == "index.json":
            continue
        m = json.loads(p.read_text())
        entries.append({"slug": p.stem, "name": m["repo"]["name"], "summary": m["summary"],
                        "commits": m["repo"]["commits"],
                        "has_snapshots": (MODELS_DIR.parent / "snapshots" / p.name).exists()})
    (MODELS_DIR / "index.json").write_text(json.dumps(entries, indent=1))
    return entries
