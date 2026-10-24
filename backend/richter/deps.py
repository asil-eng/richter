"""Stage 2a — DEPENDENCY PARSER.

Build a file-level import graph (edge A -> B means "A imports B"). Python files
are parsed with `ast` here; other languages are handled in `langs.py`.

The naive version collapses into a star on `__init__.py`, because most code does
`from pkg import thing`. To keep edges pointing at real modules we:
  * derive each file's dotted module name from its package chain, so `src/`
    layouts resolve without configuration;
  * resolve relative imports (`from . import x`, `from ..a import b`);
  * follow `__init__.py` re-exports: if `pkg/__init__.py` does
    `from .routing import APIRouter`, then `from pkg import APIRouter` becomes an
    edge to `pkg/routing.py`, not to the package init.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path

import networkx as nx

from . import langs



@dataclass
class Module:
    path: str                 # repo-relative file path
    name: str                 # dotted module name
    is_package: bool          # True for __init__.py
    tree: ast.Module | None
    loc: int
    defined: set[str] = field(default_factory=set)        # top-level names
    reexports: dict[str, str] = field(default_factory=dict)  # name -> source module (inits only)
    star_sources: list[str] = field(default_factory=list)   # `from .x import *` sources


def iter_python_files(root: Path, include_tests: bool = False) -> list[Path]:
    return [p for p in langs.iter_source_files(root, include_tests) if p.suffix == ".py"]


def module_name(root: Path, path: Path) -> str:
    """Dotted name from the chain of enclosing packages (dirs with __init__.py)."""
    parts = [] if path.name == "__init__.py" else [path.stem]
    d = path.parent
    while d != root and (d / "__init__.py").exists():
        parts.insert(0, d.name)
        d = d.parent
    return ".".join(parts) or path.stem


def _top_level_names(tree: ast.Module) -> set[str]:
    names = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                if isinstance(t, ast.Name):
                    names.add(t.id)
    return names


def _resolve_relative(mod: Module, level: int, target: str | None) -> str:
    """Absolute dotted name for a `from <dots><target> import ...` in `mod`."""
    if level == 0:
        return target or ""
    pkg = mod.name.split(".") if mod.is_package else mod.name.split(".")[:-1]
    base = pkg[: len(pkg) - (level - 1)] if level > 1 else pkg
    return ".".join(base + ([target] if target else []))


class ImportResolver:
    def __init__(self, modules: dict[str, Module]):
        self.modules = modules  # dotted name -> Module

    def longest_prefix(self, dotted: str) -> str | None:
        parts = dotted.split(".")
        for i in range(len(parts), 0, -1):
            cand = ".".join(parts[:i])
            if cand in self.modules:
                return cand
        return None

    def through_reexports(self, pkg: str, name: str, _seen: frozenset = frozenset()) -> str:
        """Follow `pkg.name` through __init__ re-exports to the defining module."""
        mod = self.modules.get(pkg)
        if mod is None or not mod.is_package or pkg in _seen:
            return pkg
        seen = _seen | {pkg}
        src = mod.reexports.get(name)
        if src and src in self.modules:
            return self.through_reexports(src, name, seen)
        for star in mod.star_sources:
            star_mod = self.modules.get(star)
            if star_mod and (name in star_mod.defined or name in star_mod.reexports):
                return self.through_reexports(star, name, seen)
        return pkg

    def targets(self, mod: Module, node: ast.AST) -> set[str]:
        out: set[str] = set()
        if isinstance(node, ast.Import):
            for alias in node.names:
                hit = self.longest_prefix(alias.name)
                if hit:
                    out.add(hit)
        elif isinstance(node, ast.ImportFrom):
            base = _resolve_relative(mod, node.level, node.module)
            for alias in node.names:
                sub = f"{base}.{alias.name}" if base else alias.name
                if sub in self.modules:          # `from pkg import submodule`
                    out.add(sub)
                    continue
                hit = self.longest_prefix(base) if base else None
                if hit is None:
                    continue
                if alias.name == "*" or hit != base:
                    out.add(hit)
                else:
                    out.add(self.through_reexports(hit, alias.name))
        return out


def load_modules(root: Path, include_tests: bool = False) -> dict[str, Module]:
    modules: dict[str, Module] = {}
    for p in iter_python_files(root, include_tests):
        src = p.read_text(encoding="utf-8", errors="replace")
        try:
            tree = ast.parse(src)
        except SyntaxError:
            tree = None
        name = module_name(root, p)
        if name in modules:  # e.g. two top-level scripts with same stem; keep first
            continue
        modules[name] = Module(
            path=p.relative_to(root).as_posix(),
            name=name,
            is_package=p.name == "__init__.py",
            tree=tree,
            loc=src.count("\n") + 1,
            defined=_top_level_names(tree) if tree else set(),
        )
    # Record what each package __init__ re-exports and from where.
    for mod in modules.values():
        if not (mod.is_package and mod.tree):
            continue
        for node in mod.tree.body:
            if not isinstance(node, ast.ImportFrom):
                continue
            base = _resolve_relative(mod, node.level, node.module)
            for alias in node.names:
                if alias.name == "*":
                    mod.star_sources.append(base)
                elif f"{base}.{alias.name}" in modules:
                    mod.reexports[alias.asname or alias.name] = f"{base}.{alias.name}"
                else:
                    mod.reexports[alias.asname or alias.name] = base
    return modules


def build_import_graph(root: Path, include_tests: bool = False) -> nx.DiGraph:
    """Nodes are repo-relative file paths (with `loc`, `lang`); edge A->B = A imports B.

    Python uses the `ast` resolver below; every other language goes through
    `langs.build_edges`. Mixed-language repos get one combined graph.
    """
    files = langs.iter_source_files(root, include_tests)
    modules = load_modules(root, include_tests)
    resolver = ImportResolver(modules)
    g = nx.DiGraph()
    for mod in modules.values():
        g.add_node(mod.path, loc=mod.loc, module=mod.name, lang="python")
    for mod in modules.values():
        if mod.tree is None:
            continue
        for node in ast.walk(mod.tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                for target in resolver.targets(mod, node):
                    dst = modules[target].path
                    if dst != mod.path:
                        g.add_edge(mod.path, dst)

    other = [p for p in files if p.suffix != ".py"]
    if other:
        loc, edges = langs.build_edges(root, other)
        for path, n in loc.items():
            g.add_node(path, loc=n, module=path, lang=langs.language_of(path))
        g.add_edges_from(edges)
    return g


if __name__ == "__main__":
    import sys
    from collections import Counter

    g = build_import_graph(Path(sys.argv[1]))
    indeg = Counter(dict(g.in_degree()))
    inits = sum(d for n, d in indeg.items() if n.endswith("__init__.py"))
    by_lang = Counter(d["lang"] for _, d in g.nodes(data=True))
    print(f"{g.number_of_nodes()} files {dict(by_lang)}, {g.number_of_edges()} import edges, "
          f"{inits / max(g.number_of_edges(), 1):.0%} of edges point at __init__.py")
    for n, d in indeg.most_common(8):
        print(f"  {d:4d}  {n}")
