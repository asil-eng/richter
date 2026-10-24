"""Command line: `python -m richter.cli analyze <github-url> [--include-tests]`."""

from __future__ import annotations

import argparse
import time

from .pipeline import analyze


def main() -> None:
    ap = argparse.ArgumentParser(prog="richter")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze", help="clone a repo and write data/models/<slug>.json")
    a.add_argument("url")
    a.add_argument("--include-tests", action="store_true",
                   help="also parse tests/, docs_src/, docs/, examples/")
    s = sub.add_parser("snapshots", help="precompute time-travel frames to data/snapshots/<slug>.json")
    s.add_argument("url")
    s.add_argument("--frames", type=int, default=28)
    nt = sub.add_parser("notes", help="precompute AI notes for the demo bundle (needs OPENAI_API_KEY)")
    nt.add_argument("url")
    nt.add_argument("--top", type=int, default=12)
    b = sub.add_parser("backtest", help="does magnitude at a past snapshot predict later fixes?")
    b.add_argument("url")
    b.add_argument("--cutoff", type=float, default=0.6, help="fraction of history treated as the past")
    args = ap.parse_args()

    if args.cmd == "notes":
        import json

        from .agent import precompute_notes
        from .ingest import REPOS_DIR, repo_slug
        from .pipeline import MODELS_DIR

        slug = repo_slug(args.url)
        model = json.loads((MODELS_DIR / f"{slug}.json").read_text())
        root = REPOS_DIR / slug
        bundle = precompute_notes(model, slug, root if root.exists() else None, top=args.top)
        ai = sum(n.get("source") == "ai" for k in ("guard", "unblock") for n in bundle[k].values())
        print(f"{slug}: {len(bundle['guard'])} files, {ai} AI notes, {len(bundle['ask'])} answers")
        return

    if args.cmd == "backtest":
        from .backtest import backtest

        r = backtest(args.url, cutoff=args.cutoff)
        print(f"{r['repo']}: scored at commit {r['cutoff_commit']}/{r['commits']}, "
              f"{r['future_fix_touches']} later fix touches on {r['files_at_cutoff']} files")
        print(f"  top {r['top_n']} files by magnitude caught {r['magnitude_share']:.0%} "
              f"| by churn {r['churn_share']:.0%} | random {r['random_share']:.0%}")
        return

    if args.cmd == "snapshots":
        from .snapshots import build_snapshots

        t0 = time.time()
        snap = build_snapshots(args.url, frames=args.frames)
        print(f"{len(snap['frames'])} frames in {time.time() - t0:.1f}s")
        return

    t0 = time.time()
    m = analyze(args.url, include_tests=args.include_tests)
    top = sorted(m["nodes"], key=lambda n: -n["magnitude"])[:5]
    print(f"{m['repo']['name']}: {m['summary']} in {time.time() - t0:.1f}s")
    for n in top:
        print(f"  M{n['magnitude'] * 10:4.1f}  blast={n['blast_size']:<4d} {n['id']}")


if __name__ == "__main__":
    main()
