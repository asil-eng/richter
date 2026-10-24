"""Import graphs for languages other than Python.

Python keeps its `ast`-based parser in `deps.py`. Everything here uses targeted
regexes for import syntax (which is simple and line-oriented in every language
below) plus a per-language *resolver* that maps an import to a real file in the
repo. Imports of third-party packages simply don't resolve and are dropped.

Accuracy notes (also in the README):
  * Java/Kotlin/Scala/C# can reference same-package types with no import at all;
    those dependencies are invisible here.
  * C# `using` is namespace-level, so edges point at every file declaring that
    namespace (skipped when the namespace is very large).
  * Go imports are package-level, so edges point at every file in the package.
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from pathlib import Path, PurePosixPath

LANGS = {
    "js": (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".vue", ".svelte"),
    "go": (".go",),
    "jvm": (".java", ".kt", ".kts", ".scala"),
    "rust": (".rs",),
    "c": (".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx", ".m", ".mm"),
    "cs": (".cs",),
    "ruby": (".rb",),
    "php": (".php",),
}
EXT_LANG = {ext: lang for lang, exts in LANGS.items() for ext in exts}
SOURCE_EXTS = (".py", *EXT_LANG)

# directories that are never first-party source
ALWAYS_SKIP = {
    ".git", "node_modules", "vendor", "third_party", "third-party", "bower_components",
    "dist", "build", "out", "target", "bin", "obj", ".next", ".nuxt", ".svelte-kit",
    "coverage", ".venv", "venv", "__pycache__", ".tox", "Pods", "DerivedData",
}
# test / docs / example code: excluded by default, `include_tests` brings it back
TEST_DIRS = {
    "test", "tests", "__tests__", "__mocks__", "spec", "specs", "testdata", "fixtures",
    "e2e", "docs", "docs_src", "doc", "examples", "example", "samples",
}
TEST_FILE = re.compile(
    r"(\.(test|spec|stories)\.[a-z]+$)|(_test\.go$)|(Tests?\.(java|kt|cs|scala)$)|(_spec\.rb$)"
    r"|(^test_.*\.py$)|(^conftest\.py$)|(\.d\.ts$)|(\.min\.js$)|(^tests?\.[a-z]+$)|(_test\.(c|cc|cpp)$)"
)
MAX_BYTES = 400_000  # skip generated/minified giants


def iter_source_files(root: Path, include_tests: bool = False) -> list[Path]:
    skip = ALWAYS_SKIP | (set() if include_tests else TEST_DIRS)
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip and not d.startswith(".")]
        for f in filenames:
            if not f.endswith(SOURCE_EXTS):
                continue
            if not include_tests and TEST_FILE.search(f):
                continue
            p = Path(dirpath) / f
            try:
                # size cap targets minified/generated bundles; Python keeps its old behaviour
                if not f.endswith(".py") and p.stat().st_size > MAX_BYTES:
                    continue
            except OSError:
                continue
            out.append(p)
    return sorted(out)


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def _norm(path: PurePosixPath) -> str:
    parts: list[str] = []
    for part in path.parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part != ".":
            parts.append(part)
    return "/".join(parts)


class Repo:
    """Index of the repo's source files shared by all resolvers."""

    def __init__(self, root: Path, files: list[Path]):
        self.root = root
        self.paths = [p.relative_to(root).as_posix() for p in files]
        self.pathset = set(self.paths)
        self.by_dir: dict[str, list[str]] = defaultdict(list)
        self.by_name: dict[str, list[str]] = defaultdict(list)
        for p in self.paths:
            self.by_dir[p.rsplit("/", 1)[0] if "/" in p else ""].append(p)
            self.by_name[p.rsplit("/", 1)[-1]].append(p)
        self.text = {p: _read(root / p) for p in self.paths if not p.endswith(".py")}

    def suffix(self, rel: str) -> str | None:
        """Unique repo file whose path ends with `rel` (as whole path segments)."""
        name = rel.rsplit("/", 1)[-1]
        hits = [p for p in self.by_name.get(name, []) if p == rel or p.endswith("/" + rel)]
        return hits[0] if len(hits) == 1 else None


# ------------------------------------------------------------------ JavaScript / TypeScript

JS_FROM = re.compile(r"""\bfrom\s*['"]([^'"\n]+)['"]""")
JS_SIDE = re.compile(r"""^\s*import\s*['"]([^'"\n]+)['"]""", re.M)
JS_CALL = re.compile(r"""\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)""")
JS_TRY = ("", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte")


def _strip_json_comments(raw: str) -> str:
    """Drop // and /* */ comments outside strings (tsconfig is JSON-with-comments)."""
    out, i, n, in_str = [], 0, len(raw), False
    while i < n:
        ch = raw[i]
        if in_str:
            out.append(ch)
            if ch == "\\":
                out.append(raw[i + 1:i + 2])
                i += 1
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
            out.append(ch)
        elif raw.startswith("//", i):
            i = raw.find("\n", i)
            i = n if i < 0 else i
            continue
        elif raw.startswith("/*", i):
            i = raw.find("*/", i + 2)
            i = n if i < 0 else i + 2
            continue
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def _json_loose(p: Path) -> dict:
    try:
        raw = re.sub(r",(\s*[}\]])", r"\1", _strip_json_comments(_read(p)))
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (ValueError, OSError):
        return {}


class JsResolver:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.aliases: list[tuple[str, str, str]] = []  # (config dir, pattern prefix, target prefix)
        self.packages: dict[str, str] = {}             # workspace package name -> dir
        for dirpath, dirnames, filenames in os.walk(repo.root):
            dirnames[:] = [d for d in dirnames if d not in ALWAYS_SKIP and not d.startswith(".")]
            rel = Path(dirpath).relative_to(repo.root).as_posix()
            rel = "" if rel == "." else rel
            for cfg in ("tsconfig.json", "jsconfig.json"):
                if cfg in filenames:
                    opts = _json_loose(Path(dirpath) / cfg).get("compilerOptions", {})
                    base = _norm(PurePosixPath(rel, opts.get("baseUrl", ".")))
                    for pat, targets in (opts.get("paths") or {}).items():
                        if targets:
                            self.aliases.append((base, pat.rstrip("*"), targets[0].rstrip("*")))
            if "package.json" in filenames and rel:
                name = _json_loose(Path(dirpath) / "package.json").get("name")
                if isinstance(name, str):
                    self.packages[name] = rel

    def _file(self, base: str) -> str | None:
        stem = re.sub(r"\.(m|c)?js$", "", base)  # ESM-in-TS: './x.js' is really x.ts
        for cand in (base, stem):
            for ext in JS_TRY:
                if cand + ext in self.repo.pathset:
                    return cand + ext
            for ext in JS_TRY[1:]:
                if f"{cand}/index{ext}" in self.repo.pathset:
                    return f"{cand}/index{ext}"
        return None

    def resolve(self, src: str, spec: str) -> str | None:
        if spec.startswith("."):
            return self._file(_norm(PurePosixPath(src).parent / spec))
        for base, pre, target in self.aliases:
            if pre and spec.startswith(pre):
                hit = self._file(_norm(PurePosixPath(base, target + spec[len(pre):])))
                if hit:
                    return hit
        for name, d in self.packages.items():
            if spec == name or spec.startswith(name + "/"):
                sub = spec[len(name):].lstrip("/")
                for cand in ([f"{d}/{sub}", f"{d}/src/{sub}"] if sub else [f"{d}/src/index", f"{d}/index", f"{d}/src/main"]):
                    hit = self._file(_norm(PurePosixPath(cand)))
                    if hit:
                        return hit
        return None

    def edges(self, path: str, text: str):
        specs = set(JS_FROM.findall(text)) | set(JS_SIDE.findall(text)) | set(JS_CALL.findall(text))
        for spec in specs:
            hit = self.resolve(path, spec)
            if hit:
                yield hit


# ------------------------------------------------------------------ Go

GO_BLOCK = re.compile(r"^\s*import\s*\((.*?)\)", re.S | re.M)
GO_ONE = re.compile(r"""^\s*import\s+(?:[\w.]+\s+)?"([^"]+)\"""", re.M)
GO_PATH = re.compile(r'"([^"]+)"')


class GoResolver:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.modules: list[tuple[str, str]] = []  # (module path, dir)
        for dirpath, dirnames, filenames in os.walk(repo.root):
            dirnames[:] = [d for d in dirnames if d not in ALWAYS_SKIP and not d.startswith(".")]
            if "go.mod" in filenames:
                m = re.search(r"^module\s+(\S+)", _read(Path(dirpath) / "go.mod"), re.M)
                if m:
                    rel = Path(dirpath).relative_to(repo.root).as_posix()
                    self.modules.append((m.group(1), "" if rel == "." else rel))
        self.modules.sort(key=lambda x: -len(x[0]))

    def edges(self, path: str, text: str):
        imports = set(GO_ONE.findall(text))
        for block in GO_BLOCK.findall(text):
            imports |= set(GO_PATH.findall(block))
        for imp in imports:
            for mod, d in self.modules:
                if imp == mod or imp.startswith(mod + "/"):
                    pkg = _norm(PurePosixPath(d, imp[len(mod):].lstrip("/")))
                    for f in self.repo.by_dir.get(pkg, []):
                        if f.endswith(".go"):
                            yield f
                    break


# ------------------------------------------------------------------ Java / Kotlin / Scala

JVM_PKG = re.compile(r"^\s*package\s+([\w.]+)", re.M)
JVM_IMPORT = re.compile(r"^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*|\._)?\s*;?\s*$", re.M)


class JvmResolver:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.fqcn: dict[str, str] = {}
        self.pkg: dict[str, list[str]] = defaultdict(list)
        for p, text in repo.text.items():
            if EXT_LANG.get(Path(p).suffix) != "jvm":
                continue
            m = JVM_PKG.search(text)
            pkg = m.group(1) if m else ""
            self.pkg[pkg].append(p)
            self.fqcn[f"{pkg}.{Path(p).stem}" if pkg else Path(p).stem] = p

    def edges(self, path: str, text: str):
        for name, wild in JVM_IMPORT.findall(text):
            if wild:
                yield from self.pkg.get(name, [])
                continue
            parts = name.split(".")
            # a.b.C, a.b.C.member (static), or a.b.function (Kotlin top-level)
            for k in range(len(parts), 0, -1):
                hit = self.fqcn.get(".".join(parts[:k]))
                if hit:
                    yield hit
                    break
            else:
                # Kotlin top-level function import: only attributable if the package has one file
                owners = self.pkg.get(".".join(parts[:-1]), [])
                if len(owners) == 1:
                    yield owners[0]


# ------------------------------------------------------------------ Rust

RS_MOD = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;", re.M)
RS_USE = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);", re.M)


class RustResolver:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.crates: dict[str, str] = {}  # crate name (underscored) -> src dir
        for dirpath, dirnames, filenames in os.walk(repo.root):
            dirnames[:] = [d for d in dirnames if d not in ALWAYS_SKIP and not d.startswith(".")]
            if "Cargo.toml" in filenames:
                m = re.search(r'^\s*name\s*=\s*"([^"]+)"', _read(Path(dirpath) / "Cargo.toml"), re.M)
                rel = Path(dirpath).relative_to(repo.root).as_posix()
                if m:
                    self.crates[m.group(1).replace("-", "_")] = _norm(PurePosixPath(rel, "src"))

    def _crate_root(self, path: str) -> str:
        d = PurePosixPath(path).parent
        while str(d) not in ("", "."):
            if any(f"{d}/{f}" in self.repo.pathset for f in ("lib.rs", "main.rs")):
                return str(d)
            d = d.parent
        return str(PurePosixPath(path).parent)

    @staticmethod
    def _mod_dir(path: str) -> str:
        p = PurePosixPath(path)
        return str(p.parent) if p.name in ("mod.rs", "lib.rs", "main.rs") else str(p.parent / p.stem)

    def _module_file(self, d: str, segs: list[str]) -> str | None:
        for k in range(len(segs), 0, -1):
            base = _norm(PurePosixPath(d, *segs[:k]))
            for cand in (base + ".rs", base + "/mod.rs"):
                if cand in self.repo.pathset:
                    return cand
        return None

    @staticmethod
    def _expand(use: str) -> list[str]:
        use = re.sub(r"\s+", "", use)
        m = re.match(r"^(.*?)::\{(.*)\}$", use)
        if not m:
            return [use]
        prefix, body, depth, cur, out = m.group(1), m.group(2), 0, "", []
        for ch in body + ",":
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            if ch == "," and depth == 0:
                if cur:
                    out.append(f"{prefix}::{cur}")
                cur = ""
            else:
                cur += ch
        return [p for o in out for p in RustResolver._expand(o)]

    def edges(self, path: str, text: str):
        here = self._mod_dir(path)
        for name in RS_MOD.findall(text):
            hit = self._module_file(here, [name])
            if hit:
                yield hit
        for use in RS_USE.findall(text):
            for u in self._expand(use):
                segs = [s for s in u.split("::") if s and s != "*"]
                if not segs:
                    continue
                head, rest = segs[0], segs[1:]
                if head == "crate":
                    base = self._crate_root(path)
                elif head == "self":
                    base = here
                elif head == "super":
                    base = str(PurePosixPath(here).parent)
                    while rest and rest[0] == "super":
                        base, rest = str(PurePosixPath(base).parent), rest[1:]
                elif head in self.crates:
                    base = self.crates[head]
                else:
                    continue
                hit = self._module_file(base, rest) if rest else None
                if hit:
                    yield hit


# ------------------------------------------------------------------ C / C++ / Objective-C

C_INCLUDE = re.compile(r'^\s*#\s*(?:include|import)\s*([<"])([^>"]+)[>"]', re.M)


class CResolver:
    def __init__(self, repo: Repo):
        self.repo = repo

    def edges(self, path: str, text: str):
        here = PurePosixPath(path).parent
        for _, inc in C_INCLUDE.findall(text):
            local = _norm(here / inc)
            if local in self.repo.pathset:
                yield local
            else:
                hit = self.repo.suffix(_norm(PurePosixPath(inc)))
                if hit:
                    yield hit


# ------------------------------------------------------------------ C#

CS_NS = re.compile(r"^\s*namespace\s+([\w.]+)", re.M)
CS_USING = re.compile(r"^\s*(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;", re.M)
CS_MAX_NS = 60  # a namespace this large says nothing about a specific dependency


class CsResolver:
    def __init__(self, repo: Repo):
        self.ns: dict[str, list[str]] = defaultdict(list)
        self.types: dict[str, str] = {}
        for p, text in repo.text.items():
            if p.endswith(".cs"):
                for n in set(CS_NS.findall(text)):
                    self.ns[n].append(p)
                    self.types[f"{n}.{Path(p).stem}"] = p

    def edges(self, path: str, text: str):
        for name in CS_USING.findall(text):
            if name in self.types:
                yield self.types[name]
            elif 0 < len(self.ns.get(name, [])) <= CS_MAX_NS:
                yield from self.ns[name]


# ------------------------------------------------------------------ Ruby

RB_REL = re.compile(r"""^\s*require_relative\s*\(?\s*['"]([^'"]+)['"]""", re.M)
RB_REQ = re.compile(r"""^\s*require\s*\(?\s*['"]([^'"]+)['"]""", re.M)


class RubyResolver:
    def __init__(self, repo: Repo):
        self.repo = repo

    def edges(self, path: str, text: str):
        here = PurePosixPath(path).parent
        for spec in RB_REL.findall(text):
            cand = _norm(here / spec)
            cand = cand if cand.endswith(".rb") else cand + ".rb"
            if cand in self.repo.pathset:
                yield cand
        for spec in RB_REQ.findall(text):
            # plain `require` is a load-path lookup; only gem-style lib/<spec>.rb is ours
            # (a bare suffix match would bind stdlib `require 'logger'` to any logger.rb)
            rel = spec if spec.endswith(".rb") else spec + ".rb"
            hit = self.repo.suffix("lib/" + rel)
            if hit:
                yield hit


# ------------------------------------------------------------------ PHP

PHP_NS = re.compile(r"^\s*namespace\s+([\w\\]+)\s*;", re.M)
PHP_USE = re.compile(r"^\s*use\s+(?:function\s+|const\s+)?([\w\\]+)(?:\s+as\s+\w+)?\s*;", re.M)
PHP_INC = re.compile(r"""\b(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+\.php)['"]""")


class PhpResolver:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.fqcn: dict[str, str] = {}
        for p, text in repo.text.items():
            if p.endswith(".php"):
                m = PHP_NS.search(text)
                self.fqcn[(m.group(1) + "\\" if m else "") + Path(p).stem] = p

    def edges(self, path: str, text: str):
        for name in PHP_USE.findall(text):
            hit = self.fqcn.get(name.lstrip("\\"))
            if hit:
                yield hit
        here = PurePosixPath(path).parent
        for spec in PHP_INC.findall(text):
            cand = _norm(here / spec.lstrip("/"))
            if cand in self.repo.pathset:
                yield cand


RESOLVERS = {
    "js": JsResolver, "go": GoResolver, "jvm": JvmResolver, "rust": RustResolver,
    "c": CResolver, "cs": CsResolver, "ruby": RubyResolver, "php": PhpResolver,
}


def build_edges(root: Path, files: list[Path]) -> tuple[dict[str, int], set[tuple[str, str]]]:
    """Non-Python files -> ({path: loc}, {(importer, imported)})."""
    repo = Repo(root, files)
    present = {EXT_LANG[Path(p).suffix] for p in repo.text}
    resolvers = {lang: RESOLVERS[lang](repo) for lang in present}
    loc = {p: t.count("\n") + 1 for p, t in repo.text.items()}
    edges: set[tuple[str, str]] = set()
    for p, text in repo.text.items():
        for hit in resolvers[EXT_LANG[Path(p).suffix]].edges(p, text):
            if hit != p and hit in repo.pathset:
                edges.add((p, hit))
    return loc, edges


def language_of(path: str) -> str:
    ext = Path(path).suffix
    return "python" if ext == ".py" else {
        "js": "typescript" if ext in (".ts", ".tsx", ".mts", ".cts") else "javascript",
        "jvm": {".java": "java", ".scala": "scala"}.get(ext, "kotlin"),
        "c": "c/c++", "cs": "c#",
    }.get(EXT_LANG.get(ext, ""), EXT_LANG.get(ext, "other"))
