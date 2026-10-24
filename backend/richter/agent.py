"""Stage 4 — AGENT ACTIONS (OpenAI, gpt-4o-mini).

Three actions, all writing NOTES, never code:
  * guard note    — "touch carefully: here's what breaks and why" for one file
  * unblock plan  — "why this keeps getting reworked + how to unblock" for one file
  * ask the repo  — free question answered over a compact model summary, returning
                    structured JSON {answer, files[]} whose paths are validated
                    against the model before anything is highlighted

Prompts stay small: one file's metrics, its dependents/partners, a capped excerpt.
Every response is cached on disk keyed by the prompt, so demos replay instantly
and offline. Without OPENAI_API_KEY (and no cache hit) guard notes and unblock
plans fall back to a rule-based note built from the metrics, labelled as such.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"
MODEL = "gpt-4o-mini"
EXCERPT_CHARS = 3500

load_dotenv(ROOT / ".env")


class AgentUnavailable(RuntimeError):
    pass


def _cache_path(kind: str, key: str) -> Path:
    h = hashlib.sha256(f"{MODEL}\n{kind}\n{key}".encode()).hexdigest()[:24]
    return CACHE_DIR / kind / f"{h}.json"


def _chat_json(kind: str, key: str, system: str, user: str) -> dict:
    """`key` identifies the request (repo HEAD + file or question), NOT the prompt text:
    prompts include excerpts from a local clone that other machines may not have, and
    the committed cache must still hit there."""
    cp = _cache_path(kind, key)
    if cp.exists():
        return {**json.loads(cp.read_text()), "cached": True}
    if not os.getenv("OPENAI_API_KEY"):
        raise AgentUnavailable("OPENAI_API_KEY is not set")
    from openai import OpenAI

    resp = OpenAI().chat.completions.create(
        model=MODEL,
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    data = json.loads(resp.choices[0].message.content or "{}")
    cp.parent.mkdir(parents=True, exist_ok=True)
    cp.write_text(json.dumps(data, indent=1))
    return {**data, "cached": False}


# ---------------------------------------------------------------- context helpers

def _node(model: dict, path: str) -> tuple[int, dict]:
    for i, n in enumerate(model["nodes"]):
        if n["id"] == path:
            return i, n
    raise KeyError(path)


def _metrics_block(model: dict, i: int, n: dict) -> str:
    nodes = model["nodes"]
    # most important dependents first, so the model names the ones that matter
    ranked = sorted(n["blast"], key=lambda x: (x[1], -nodes[x[0]]["importance"]))
    names = [nodes[j]["id"] for j, _ in ranked]
    direct = [nodes[j]["id"] for j, h in ranked if h == 1]
    partners = [model["nodes"][c["b"] if c["a"] == i else c["a"]]["id"]
                for c in model["cochange"] if c["ghost"] and i in (c["a"], c["b"])]
    return "\n".join([
        f"file: {n['id']}",
        f"magnitude: {n['magnitude'] * 10:.1f}/10 (structural {n['structural']:.2f}, human {n['human']:.2f})",
        f"blast radius: {n['blast_size']} dependent files; direct importers: {', '.join(direct[:10]) or 'none'}",
        f"transitive dependents (nearest first): {', '.join(names[:15]) or 'none'}",
        f"history: {n['churn']} commits, {n['fixes']} fix/revert commits, {n['authors']} distinct authors"
        + (" — ONLY ONE author ever (bus factor 1)" if n["bus_factor"] else ""),
        f"hidden coupling (co-changes without import): {', '.join(partners[:6]) or 'none'}",
    ])


def _excerpt(repo_root: Path | None, path: str) -> str:
    if repo_root is None or not (repo_root / path).exists():
        return ""
    return (repo_root / path).read_text(errors="replace")[:EXCERPT_CHARS]


def _recent_messages(repo_root: Path | None, path: str, k: int = 15) -> list[str]:
    if repo_root is None or not (repo_root / ".git").exists():
        return []
    out = subprocess.run(["git", "-C", str(repo_root), "log", f"-{k}", "--no-merges",
                          "--format=%s", "--", path], capture_output=True, text=True)
    return out.stdout.splitlines()


# ---------------------------------------------------------------- actions

GUARD_SYSTEM = (
    "You are a senior engineer writing a short guard note for a teammate about to edit a file. "
    "Be concrete and grounded ONLY in the metrics and code given; never invent files. "
    "Read the code excerpt: name the specific classes/functions that make this file load-bearing. "
    "Direct importers are listed most-important first; pick the ones that matter. "
    "No generic advice like 'run the tests' or 'document changes' — every checklist item must "
    "mention something specific to this file. "
    'Reply as JSON: {"headline": str (<=12 words, specific to this file), "what_breaks": [str] '
    '(2-4 items, each "path — what it relies on here"), "why": str (2 sentences), '
    '"checklist": [str] (3-4 short, file-specific actions)}'
)

UNBLOCK_SYSTEM = (
    "You are a staff engineer diagnosing why a file keeps getting reworked. Use only the metrics, "
    "recent commit messages and code given. Write a plan, not code. Point at the recurring theme "
    "in the commit messages and the specific parts of the code it touches; no generic advice. "
    'Reply as JSON: {"headline": str (<=12 words), "diagnosis": str (2-3 sentences), '
    '"plan": [str] (3-4 concrete steps), "owner_hint": str (1 sentence on ownership/bus factor)}'
)


def guard_note(model: dict, path: str, repo_root: Path | None = None) -> dict:
    i, n = _node(model, path)
    user = _metrics_block(model, i, n) + "\n\ncode excerpt:\n" + _excerpt(repo_root, path)
    try:
        key = f"{model['repo']['head']}:{path}"
        return {"source": "ai", **_chat_json("guard", key, GUARD_SYSTEM, user)}
    except AgentUnavailable:
        return _rule_guard(model, n)


def unblock_plan(model: dict, path: str, repo_root: Path | None = None) -> dict:
    i, n = _node(model, path)
    msgs = _recent_messages(repo_root, path)
    user = (_metrics_block(model, i, n) + "\n\nrecent commit messages:\n- " + "\n- ".join(msgs)
            + "\n\ncode excerpt:\n" + _excerpt(repo_root, path)[:2000])
    try:
        key = f"{model['repo']['head']}:{path}"
        return {"source": "ai", **_chat_json("unblock", key, UNBLOCK_SYSTEM, user)}
    except AgentUnavailable:
        return _rule_unblock(n)


ASK_SYSTEM = (
    "You answer questions about a codebase's risk using ONLY the risk model summary given. "
    "Answer in plain English, 2-5 sentences. List the files your answer is about, copying paths "
    'exactly as they appear in the summary. Reply as JSON: {"answer": str, "files": [str]}'
)


def summarize_model(model: dict, top: int = 25) -> str:
    nodes = model["nodes"]
    ranked = sorted(nodes, key=lambda n: -n["magnitude"])[:top]
    lines = [f"repo {model['repo']['name']}: {model['summary']}",
             "columns: magnitude/10 = fragile AND reworked; blast = files that break if it changes; "
             "churn = commits; fixes = fix/revert commits; authors = distinct people; "
             "single_author = yes means ONE person wrote every commit (bus-factor risk)",
             "path | magnitude/10 | blast | churn | fixes | authors | single_author"]
    lines += [f"{n['id']} | {n['magnitude'] * 10:.1f} | {n['blast_size']} | {n['churn']} | "
              f"{n['fixes']} | {n['authors']} | {'yes' if n['bus_factor'] else 'no'}" for n in ranked]
    ghosts = sorted((c for c in model["cochange"] if c["ghost"]), key=lambda c: -c["shared"])[:10]
    lines.append("hidden coupling (co-changed, no import):")
    lines += [f"{nodes[c['a']]['id']} <-> {nodes[c['b']]['id']} ({c['shared']} commits)" for c in ghosts]
    return "\n".join(lines)


def validate_files(model: dict, names: list) -> list[str]:
    """Keep only paths that exist in the model (exact, or a unique path suffix)."""
    ids = [n["id"] for n in model["nodes"]]
    idset, out = set(ids), []
    for name in names:
        if not isinstance(name, str):
            continue
        name = name.strip().lstrip("./")
        hit = name if name in idset else None
        if hit is None:
            matches = [p for p in ids if p.endswith("/" + name)]
            hit = matches[0] if len(matches) == 1 else None
        if hit and hit not in out:
            out.append(hit)
    return out


def ask(model: dict, question: str) -> dict:
    question = question.strip()[:500]
    if not question:
        raise ValueError("empty question")
    key = f"{model['repo']['head']}:{' '.join(question.lower().split())}"
    data = _chat_json("ask", key, ASK_SYSTEM, summarize_model(model) + "\n\nquestion: " + question)
    raw = data.get("files", [])
    files = validate_files(model, raw if isinstance(raw, list) else [])
    return {"answer": str(data.get("answer", "")), "files": files,
            "dropped": len(raw) - len(files) if isinstance(raw, list) else 0,
            "cached": data.get("cached", False)}


# ---------------------------------------------------------------- offline fallback

def _rule_guard(model: dict, n: dict) -> dict:
    direct = [model["nodes"][j]["id"] for j, h in n["blast"] if h == 1][:4]
    return {
        "source": "rules",
        "headline": (f"{n['blast_size']} files depend on this" if n["blast_size"]
                     else "Leaf module — low structural reach"),
        "what_breaks": direct or ["No in-repo importers; external callers may still depend on it"],
        "why": (f"Changes propagate to {n['blast_size']} dependents through the import graph. "
                f"{n['fixes']} of its {n['churn']} commits were fixes or reverts."),
        "checklist": ["Run the tests covering the direct importers listed above",
                      "Keep public names and signatures stable",
                      "Review co-changed partner files in the same PR"],
    }


def _rule_unblock(n: dict) -> dict:
    return {
        "source": "rules",
        "headline": f"{n['fixes']} fixes across {n['churn']} commits",
        "diagnosis": (f"Smoothed fix ratio {n['fix_ratio']:.0%} with {n['authors']} authors. "
                      "Repeated fixes usually mean unclear contracts or missing tests."),
        "plan": ["Add regression tests for the last few fixes",
                 "Document the module's invariants at the top of the file",
                 "Split the most-edited responsibilities into smaller units"],
        "owner_hint": ("Only one author has touched this file; pair someone else on the next change."
                       if n["bus_factor"] else "Name one owner to review every change here."),
    }


# ---------------------------------------------------------------- precompute for demos

NOTES_DIR = ROOT / "data" / "notes"
# keep in sync with SUGGESTIONS in frontend/src/components/AskBar.tsx
SUGGESTED_QUESTIONS = ["Which files are most fragile?", "Where is hidden coupling?",
                       "What would break if I refactor the core?"]


def normalize_question(q: str) -> str:
    return " ".join(q.lower().split())


def precompute_notes(model: dict, slug: str, repo_root: Path | None, top: int = 12) -> dict:
    """Write data/notes/<slug>.json: AI notes for the hottest and widest-reaching files and
    answers to the suggested questions, so the static demo shows real output offline."""
    from concurrent.futures import ThreadPoolExecutor

    nodes = model["nodes"]
    hot = sorted(nodes, key=lambda n: -n["magnitude"])[:top]
    wide = sorted(nodes, key=lambda n: -n["blast_size"])[:3]
    files = list(dict.fromkeys(n["id"] for n in hot + wide))
    jobs = [("guard", f) for f in files] + [("unblock", f) for f in files]
    with ThreadPoolExecutor(max_workers=6) as ex:
        notes = list(ex.map(lambda j: (j, (guard_note if j[0] == "guard" else unblock_plan)(
            model, j[1], repo_root)), jobs))
        answers = list(ex.map(lambda q: (q, ask(model, q)), SUGGESTED_QUESTIONS))
    bundle = {"head": model["repo"]["head"], "model": MODEL, "guard": {}, "unblock": {}, "ask": {}}
    for (kind, f), note in notes:
        bundle[kind][f] = {k: v for k, v in note.items() if k != "cached"}
    for q, a in answers:
        bundle["ask"][normalize_question(q)] = {k: v for k, v in a.items() if k != "cached"}
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    (NOTES_DIR / f"{slug}.json").write_text(json.dumps(bundle, indent=1))
    return bundle
