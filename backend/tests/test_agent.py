import pytest

from richter import agent

MODEL = {
    "repo": {"name": "demo", "head": "abc123"}, "summary": {},
    "nodes": [
        {"id": "pkg/core.py", "importance": 1.0, "magnitude": 0.9, "structural": 0.9, "human": 0.9, "blast_size": 1,
         "blast": [[1, 1]], "churn": 20, "fixes": 8, "fix_ratio": 0.36, "authors": 1, "bus_factor": True},
        {"id": "pkg/app.py", "importance": 0.0, "magnitude": 0.2, "structural": 0.0, "human": 0.5, "blast_size": 0,
         "blast": [], "churn": 3, "fixes": 0, "fix_ratio": 0.1, "authors": 2, "bus_factor": False},
    ],
    "cochange": [],
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
