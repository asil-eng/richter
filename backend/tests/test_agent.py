import pytest

from richter import agent

MODEL = {
    "repo": {"name": "demo", "head": "abc123"}, "summary": {},
    "nodes": [
        {"id": "pkg/core.py", "importance": 1.0, "magnitude": 0.9, "structural": 0.9, "human": 0.9, "blast_size": 1,
         "blast": [[1, 1]], "dir": "pkg", "loc": 10, "churn": 20, "fixes": 8, "fix_ratio": 0.36, "authors": 1, "bus_factor": True},
        {"id": "pkg/app.py", "importance": 0.0, "magnitude": 0.2, "structural": 0.0, "human": 0.5, "blast_size": 0,
         "blast": [], "dir": "pkg", "loc": 5, "churn": 3, "fixes": 0, "fix_ratio": 0.1, "authors": 2, "bus_factor": False},
    ],
    "cochange": [], "edges": [[1, 0]],
}


def test_validate_files_drops_invented_paths():
    got = agent.validate_files(MODEL, ["pkg/core.py", "app.py", "pkg/ghost.py", 42, "core.py"])
    assert got == ["pkg/core.py", "pkg/app.py"]


def test_offline_fallback_is_labelled(monkeypatch, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(agent, "CACHE_DIR", tmp_path)
    note = agent.guard_note(MODEL, "pkg/core.py")
    assert note["source"] == "rules" and note["what_breaks"] == ["pkg/app.py"]
    assert agent.unblock_plan(MODEL, "pkg/core.py")["source"] == "rules"
    with pytest.raises(agent.AgentUnavailable):
        agent.ask(MODEL, "what is risky?")


def test_focus_block_describes_file_and_folder():
    block = agent.focus_block(MODEL, "pkg/core.py")
    assert "CURRENT SELECTION" in block and "file: pkg/core.py" in block
    assert "its folder pkg/ has 2 files" in block


def test_ask_cache_key_depends_on_focus(monkeypatch):
    keys = []
    monkeypatch.setattr(agent, "_chat_json", lambda kind, key, s, u, prior=None: keys.append((key, u + str(prior))) or {"answer": "", "files": []})
    agent.ask(MODEL, "is this safe?")
    agent.ask(MODEL, "is this safe?", focus="pkg/core.py")
    assert keys[0][0] != keys[1][0]
    assert "CURRENT SELECTION" not in keys[0][1] and "CURRENT SELECTION" in keys[1][1]


def test_summary_lists_low_end_and_scope():
    text = agent.summarize_model(MODEL)
    assert "ALL 2 files" in text and "pkg/app.py" in text   # the calm file is present
    big = {**MODEL, "nodes": [dict(MODEL["nodes"][1], id=f"f{i}.py", magnitude=i / 400) for i in range(300)]}
    t2 = agent.summarize_model(big)
    assert "30 riskiest and 20 calmest of 300" in t2 and "f0.py" in t2 and "f299.py" in t2 and "f150.py" not in t2


def test_ask_sends_history_and_keys_cache_on_it(monkeypatch):
    calls = []
    monkeypatch.setattr(agent, "_chat_json",
                        lambda kind, key, s, u, prior=None: calls.append((key, u, prior)) or {"answer": "", "files": []})
    agent.ask(MODEL, "and why?")
    agent.ask(MODEL, "and why?", history=[{"q": "riskiest file?", "a": "pkg/core.py is riskiest", "about": "pkg/core.py"}])
    k0, _, p0 = calls[0]; k1, _, p1 = calls[1]
    assert k0 != k1
    assert any("riskiest file?" in m["content"] for m in p1 if m["role"] == "user")
    assert any("pkg/core.py is riskiest" in m["content"] for m in p1 if m["role"] == "assistant")
