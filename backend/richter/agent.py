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
import re
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


def _chat_json(kind: str, key: str, system: str, user: str, prior: list[dict] | None = None) -> dict:
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
        messages=[{"role": "system", "content": system}, *(prior or []), {"role": "user", "content": user}],
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


ASK_VERSION = "8"  # bump when the ask prompt or context changes, so stale cached answers aren't reused
ASK_SYSTEM = (
    "You answer questions about a codebase and its risk. Use the PROJECT block (README excerpt and "
    "folders) for what the project is and does, and the risk model summary for anything about risk; "
    "Use the RICHTER UI GUIDE for questions about what something on screen means. Use nothing else. "
    "This is a conversation: earlier questions and your answers come before the latest question. "
    "Resolve follow-ups ('it', 'that one', 'the second file', 'why?', 'what about the safest?') "
    "from that conversation. "
    "The summary says whether it lists every file or only the riskiest and calmest ones; if an "
    "answer depends on files that are not listed, say so instead of guessing. 'Lowest/safest/"
    "least risky' means the smallest magnitude. If several files share the lowest or highest "
    "value, say that several files tie (give the count only if you are sure) and name at most three. If the user refers to something that is not in the "
    "conversation or the summary, say you are not sure what they mean instead of guessing. "
    "If a CURRENT SELECTION block is present, the user is looking at that file and folder: "
    "words like 'this', 'this file', 'here', 'it' or 'this folder' refer to it, and answers "
    "should be about it unless the question clearly asks about the whole repo. "
    "Answer in plain English, 2-5 sentences. List the files your answer is about, copying paths "
    'exactly as they appear in the summary. Reply as JSON: {"answer": str, "files": [str]}'
)


def focus_block(model: dict, path: str, repo_root: Path | None = None) -> str:
    """What the user is looking at: the selected file and its folder, in model terms."""
    i, n = _node(model, path)
    nodes = model["nodes"]
    imports = [nodes[b]["id"] for a, b in model["edges"] if a == i]
    folder = [m for m in nodes if m["dir"] == n["dir"]]
    folder.sort(key=lambda m: -m["magnitude"])
    in_folder = {m["id"] for m in folder}
    outside_dependents = {nodes[a]["dir"] for a, b in model["edges"]
                          if nodes[b]["id"] in in_folder and nodes[a]["id"] not in in_folder}
    lines = [
        "CURRENT SELECTION (the user is looking at this file right now):",
        _metrics_block(model, i, n),
        f"language: {n.get('lang', 'python')}; lines of code: {n['loc']}",
        f"it imports: {', '.join(imports[:12]) or 'nothing in the repo'}",
        f"its folder {n['dir']}/ has {len(folder)} files (riskiest first):",
        *[f"  {m['id']} | M {m['magnitude'] * 10:.1f} | blast {m['blast_size']} | fixes {m['fixes']}"
          + (" | single author" if m["bus_factor"] else "") for m in folder[:12]],
        f"other folders that import from {n['dir']}/: {', '.join(sorted(outside_dependents)[:10]) or 'none'}",
    ]
    excerpt = _excerpt(repo_root, path)[:1500]
    if excerpt:
        lines += ["code excerpt:", excerpt]
    return "\n".join(lines)


def summarize_model(model: dict, full_upto: int = 160, top: int = 30, bottom: int = 20) -> str:
    """Every file for typical repos; the riskiest and calmest ones (plus stats) for large repos,
    so 'safest file' questions have the low end too."""
    nodes = model["nodes"]
    ordered = sorted(nodes, key=lambda n: -n["magnitude"])
    if len(ordered) <= full_upto:
        ranked, scope = ordered, f"ALL {len(ordered)} files, riskiest first"
    else:
        ranked = ordered[:top] + ordered[-bottom:]
        scope = (f"the {top} riskiest and {bottom} calmest of {len(ordered)} files "
                 f"(the {len(ordered) - top - bottom} in between are not listed)")
    mags = sorted(n["magnitude"] * 10 for n in nodes)
    lines = [f"repo {model['repo']['name']}: {model['summary']}",
             f"magnitude across all files: min {mags[0]:.1f}, median {mags[len(mags) // 2]:.1f}, max {mags[-1]:.1f}",
             f"table below lists {scope}",
             "columns: magnitude/10 = fragile AND reworked; blast = files that break if it changes; "
             "churn = commits; fixes = fix/revert commits; authors = distinct people; "
             "single_author = yes means ONE person wrote every commit (bus-factor risk)",
             "path | magnitude/10 | blast | churn | fixes | authors | single_author"]
    # a long tie at the floor carries no extra information: keep a few, count the rest exactly
    shown_m = lambda n: round(n["magnitude"] * 10, 1)  # ties as the user sees them (one decimal)
    floor = shown_m(ordered[-1])
    tied = [n for n in ranked if shown_m(n) == floor]
    hidden = tied[3:] if len(tied) > 5 else []
    shown = [n for n in ranked if n not in hidden]
    lines += [f"{n['id']} | {n['magnitude'] * 10:.1f} | {n['blast_size']} | {n['churn']} | "
              f"{n['fixes']} | {n['authors']} | {'yes' if n['bus_factor'] else 'no'}" for n in shown]
    if hidden:
        tie_total = sum(1 for n in nodes if shown_m(n) == floor)
        lines.append(f"... and {len(hidden)} more files at magnitude {floor:.1f} "
                     f"({tie_total} files in total share this lowest value)")
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


MAX_TURNS = 6
README_CHARS = 2500

# How to read Richter's own screen, so questions about the UI ("what are these lines?") work.
UI_GUIDE = """RICHTER UI GUIDE (the app the user is looking at):
- Dependency graph / risk map (views 1 and 2): every circle ("node", "blob") is one source file. Circle SIZE =
  importance (how central: PageRank on imports). Circle COLOR = magnitude 0-10, teal = calm, amber -> red = risky
  (in the plain graph view circles are teal-outlined and size matters most).
- Thin straight LINES between circles = imports: one file imports the other. Hovering a circle turns its own
  import lines teal.
- Dashed amber curved lines = GHOST EDGES (layer toggle): files that are often committed together but never import
  each other = hidden coupling.
- Orange contour rings / shaded zones labelled M5-M8 = isoseismal contours: where high-magnitude files cluster.
- Dashed broken ring around a circle = BUS FACTOR layer: only one person has ever changed that file.
- Clicking a file = blast radius: a shockwave spreads to every file that depends on it; red = hop 1 (imports it
  directly), orange = hop 2, amber = hop 3+; everything else dims.
- Code city (view 3): folders = districts (flat plots), files = towers. Tower HEIGHT = importance, GLOW color =
  magnitude. Blinking red lights mark the most dangerous towers. Clicking a tower fires a beam and shockwave rings
  and lights up its dependents. The timeline at the bottom replays history (28 snapshots).
- Left panel: repo report card (gauge 0-10, grade A-F; fix concentration, reach, bus factor, hidden coupling),
  top risks. Right panel: selected file's summary, gauge, danger-zone chart (x = depended on, y = reworked),
  blast-radius rings, AI guard note / unblock plan."""


def project_block(model: dict, repo_root: Path | None) -> str:
    """What the project is: README excerpt (from the local clone) and its folder layout."""
    folders: dict[str, int] = {}
    for n in model["nodes"]:
        folders[n["dir"]] = folders.get(n["dir"], 0) + 1
    top = sorted(folders.items(), key=lambda kv: -kv[1])[:12]
    lines = ["PROJECT:", "folders (analyzed source files): " + ", ".join(f"{d}/ ({c})" for d, c in top)]
    readme = None
    if repo_root is not None:
        for name in ("README.md", "README.rst", "README.txt", "README", "readme.md"):
            if (repo_root / name).is_file():
                readme = (repo_root / name).read_text(errors="replace")
                break
    if readme:
        text = re.sub(r"<[^>]+>|!\[[^\]]*\]\([^)]*\)", " ", readme)    # drop HTML and badge images
        text = re.sub(r"\n{3,}", "\n\n", text).strip()[:README_CHARS]
        lines += ["README excerpt:", text]
    else:
        lines.append("README: not available here; infer only from file and folder names, and say so.")
    return "\n".join(lines)


VIEWS = {"graph": "dependency graph (view 1)", "risk": "risk map (view 2)", "city": "code city (view 3)"}


def ask(model: dict, question: str, focus: str | None = None, repo_root: Path | None = None,
        history: list[dict] | None = None, view: str | None = None) -> dict:
    """`history`: earlier turns of this conversation, [{"q", "a", "about"?}], oldest first."""
    question = question.strip()[:500]
    if not question:
        raise ValueError("empty question")
    turns = [t for t in (history or []) if isinstance(t, dict) and t.get("q") and t.get("a")][-MAX_TURNS:]
    context = UI_GUIDE + "\n\n" + project_block(model, repo_root) + "\n\n" + summarize_model(model)
    if view in VIEWS:
        context += f"\n\nThe user is currently looking at the {VIEWS[view]}."
    key = f"v{ASK_VERSION}:{model['repo']['head']}:{' '.join(question.lower().split())}"
    if focus:
        context += "\n\n" + focus_block(model, focus, repo_root)  # KeyError if not in model
        key += f"@{focus}"
    if view in VIEWS:
        key += f"#{view}"
    # the risk model goes first (system context); prior turns follow as real chat messages
    prior = [{"role": "user", "content": context + "\n\n(Conversation starts below.)"},
             {"role": "assistant", "content": '{"answer": "Ready.", "files": []}'}]
    for t in turns:
        about = f" [about {t['about']}]" if t.get("about") else ""
        prior += [{"role": "user", "content": f"question{about}: {str(t['q'])[:500]}"},
                  {"role": "assistant", "content": json.dumps({"answer": str(t["a"])[:1200], "files": []})}]
    if turns:
        key += "|h:" + hashlib.sha256(json.dumps(turns, sort_keys=True).encode()).hexdigest()[:12]
    data = _chat_json("ask", key, ASK_SYSTEM, "question: " + question, prior)
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
    # also cover the inspector's START HERE picks (most reworked, riskiest single-author file)
    reworked = sorted(nodes, key=lambda n: -n["fixes"])[:2]
    lonely = sorted((n for n in nodes if n["bus_factor"]), key=lambda n: -n["magnitude"])[:2]
    files = list(dict.fromkeys(n["id"] for n in hot + wide + reworked + lonely))
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
