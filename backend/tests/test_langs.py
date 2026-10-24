from pathlib import Path

from richter.deps import build_import_graph


def write(root: Path, files: dict[str, str]) -> Path:
    for rel, src in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(src)
    return root


def edges(root: Path) -> set[tuple[str, str]]:
    return set(build_import_graph(root).edges())


def test_typescript_relative_index_esm_alias_and_workspace(tmp_path):
    write(tmp_path, {
        "tsconfig.json": '{ // comment\n "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["src/*"]}} }',
        "src/app.ts": "import { a } from './util.js'\nimport b from '@/lib'\nimport 'react'\nconst c = require('./c')",
        "src/util.ts": "export const a = 1",
        "src/lib/index.ts": "import { x } from '@acme/core'",
        "src/c.js": "",
        "packages/core/package.json": '{"name": "@acme/core"}',
        "packages/core/src/index.ts": "",
        "src/app.test.ts": "import './app'",
    })
    e = edges(tmp_path)
    assert ("src/app.ts", "src/util.ts") in e            # './util.js' -> util.ts
    assert ("src/app.ts", "src/lib/index.ts") in e       # tsconfig alias + index
    assert ("src/app.ts", "src/c.js") in e               # require()
    assert ("src/lib/index.ts", "packages/core/src/index.ts") in e  # workspace package
    assert not any(a.endswith(".test.ts") for a, _ in e)  # tests excluded


def test_go_module_packages(tmp_path):
    write(tmp_path, {
        "go.mod": "module example.com/app\n",
        "main.go": 'package main\nimport (\n  "fmt"\n  u "example.com/app/internal/util"\n)',
        "internal/util/a.go": "package util",
        "internal/util/b.go": "package util",
        "internal/util/a_test.go": "package util",
    })
    e = edges(tmp_path)
    assert {("main.go", "internal/util/a.go"), ("main.go", "internal/util/b.go")} <= e
    assert not any("a_test.go" in b for _, b in e)


def test_java_fqcn_static_and_wildcard(tmp_path):
    write(tmp_path, {
        "src/com/acme/App.java": "package com.acme;\nimport com.acme.util.Strings;\nimport static com.acme.util.Math.max;\nimport com.acme.model.*;\nimport java.util.List;",
        "src/com/acme/util/Strings.java": "package com.acme.util;",
        "src/com/acme/util/Math.java": "package com.acme.util;",
        "src/com/acme/model/User.java": "package com.acme.model;",
    })
    e = edges(tmp_path)
    assert ("src/com/acme/App.java", "src/com/acme/util/Strings.java") in e
    assert ("src/com/acme/App.java", "src/com/acme/util/Math.java") in e
    assert ("src/com/acme/App.java", "src/com/acme/model/User.java") in e


def test_rust_mod_use_braces_and_workspace(tmp_path):
    write(tmp_path, {
        "Cargo.toml": '[package]\nname = "app"',
        "src/main.rs": "mod config;\nmod net;\nuse crate::net::{client::Client, server};\nuse helper_lib::thing;",
        "src/config.rs": "use super::net::client;",
        "src/net/mod.rs": "pub mod client;\npub mod server;",
        "src/net/client.rs": "",
        "src/net/server.rs": "use self::super::client;",
        "helper/Cargo.toml": '[package]\nname = "helper-lib"',
        "helper/src/lib.rs": "pub mod thing;",
        "helper/src/thing.rs": "",
    })
    e = edges(tmp_path)
    assert {("src/main.rs", "src/config.rs"), ("src/main.rs", "src/net/mod.rs")} <= e
    assert {("src/main.rs", "src/net/client.rs"), ("src/main.rs", "src/net/server.rs")} <= e
    assert ("src/config.rs", "src/net/client.rs") in e
    assert ("src/main.rs", "helper/src/thing.rs") in e


def test_c_ruby_php(tmp_path):
    write(tmp_path, {
        "src/net.c": '#include "net.h"\n#include <stdio.h>\n#include "util/str.h"',
        "src/net.h": "",
        "src/util/str.h": "",
        "test.c": '#include "src/net.h"',
        "lib/app.rb": "require_relative 'app/router'\nrequire 'app/version'\nrequire 'logger'",
        "lib/app/router.rb": "",
        "lib/app/version.rb": "",
        "lib/app/middleware/logger.rb": "",
        "src/Http/Client.php": "<?php\nnamespace Acme\\Http;\nuse Acme\\Support\\Str;\nrequire_once __DIR__ . '/helpers.php';",
        "src/Support/Str.php": "<?php\nnamespace Acme\\Support;",
        "src/Http/helpers.php": "<?php",
    })
    e = edges(tmp_path)
    assert {("src/net.c", "src/net.h"), ("src/net.c", "src/util/str.h")} <= e
    assert not any(a == "test.c" for a, _ in e)
    assert {("lib/app.rb", "lib/app/router.rb"), ("lib/app.rb", "lib/app/version.rb")} <= e
    assert ("lib/app.rb", "lib/app/middleware/logger.rb") not in e   # stdlib require
    assert ("src/Http/Client.php", "src/Support/Str.php") in e
    assert ("src/Http/Client.php", "src/Http/helpers.php") in e
