"""The git-convention linter (scripts/commit_lint.py) that backs the commit-msg hook and the PR checks."""
from __future__ import annotations

import importlib.util
import pathlib
import subprocess

import pytest

_spec = importlib.util.spec_from_file_location(
    "commit_lint", pathlib.Path(__file__).resolve().parents[2] / "scripts" / "commit_lint.py"
)
cl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cl)

BODY = "Explain why this change was needed.\n"


def msg(header, body=None, footer=None):
    out = header
    if body is not None:
        out += "\n\n" + body
    if footer is not None:
        out += "\n\n" + footer
    return out + "\n"


# ---------------------------------------------------------------- commit messages

@pytest.mark.parametrize("m", [
    msg("docs: fix typo in readme"),
    msg("chore(deps): bump fastapi from 0.110 to 0.111"),
    msg("feat(api): add budget alerts", BODY),
    msg("fix(web)!: drop the legacy token key", BODY, "BREAKING CHANGE: clients must log in again"),
    msg("refactor(backend): split repositories by aggregate", BODY, "Refs: #12"),
    msg("test: cover the rate limiter"),
    msg("ci(ci): cancel stale runs"),
])
def test_valid_messages(m):
    assert cl.lint_message(m) == []


@pytest.mark.parametrize("m,needle", [
    (msg("Update stuff"), "header must look like"),
    (msg("feature: add x"), "unknown type"),
    (msg("feat(frontend): add x", BODY), "unknown scope"),
    (msg("docs: Fix typo"), "lowercase"),
    (msg("docs: fix typo."), "period"),
    (msg("docs: " + "x" * 80), "characters"),
    (msg("feat: add budget alerts"), "needs a body"),
    (msg("fix: handle empty list"), "needs a body"),
    ("docs: fix typo\nbody without blank line\n", "blank line"),
    (msg("feat!: new auth", BODY), "BREAKING CHANGE"),
    (msg("docs: fix typo", None, "Co-Authored-By: Claude <noreply@anthropic.com>"), "AI/bot attribution"),
    (msg("docs: fix typo", None, "Co-authored-by: Copilot <copilot@github.com>"), "AI/bot attribution"),
    (msg("docs: fix typo", "Generated with Claude Code"), "AI/bot attribution"),
    (msg("docs: fix typo", None, "Claude-Session: https://claude.ai/code/session_1"), "AI/bot attribution"),
    ("", "empty"),
])
def test_invalid_messages(m, needle):
    errors = cl.lint_message(m)
    assert errors and any(needle in e for e in errors), errors


def test_human_co_author_is_allowed():
    assert cl.lint_message(msg("docs: fix typo", None, "Co-authored-by: Jane Doe <jane@example.com>")) == []


def test_long_url_lines_are_allowed_in_the_body():
    assert cl.lint_message(msg("docs: link the spec", "See " + "https://example.com/" + "a" * 120)) == []


def test_comment_lines_are_ignored():
    assert cl.lint_message("docs: fix typo\n# Please enter the commit message\n") == []


def test_git_generated_messages_pass_only_locally():
    assert cl.lint_message("Merge branch 'main' into x\n", local=True) == []
    assert cl.lint_message("fixup! docs: fix typo\n", local=True) == []
    assert cl.lint_message("fixup! docs: fix typo\n") != []


# ---------------------------------------------------------------- PR title / branch

def test_title_uses_header_rules_without_requiring_a_body():
    assert cl.lint_title("feat(api): add budget alerts") == []
    assert cl.lint_title("Add budget alerts") != []


@pytest.mark.parametrize("name", [
    "feat/add-budget-alerts", "fix/rate-limiter-reset", "chore/repo-basics", "docs/readme", "ci/pin-actions",
    "main", "dependabot/pip/fastapi-0.111", "release-please--branches--main",
])
def test_valid_branches(name):
    assert cl.lint_branch(name) == []


@pytest.mark.parametrize("name", [
    "feature/add-x", "Feat/add-x", "feat/Add-X", "feat/add_x", "feat/", "add-budget-alerts", "feat/add--x", "fix/x/y",
])
def test_invalid_branches(name):
    assert cl.lint_branch(name) != []


# ---------------------------------------------------------------- PR description

GOOD_PR = """## Summary
Adds budget alerts so users notice overspending early.

## Changes
- new endpoint
- new card on the dashboard

## Testing
`./scripts/check.sh` passes; added tests/api/test_alerts.py

## Risk and rollout
- [x] API contract unchanged
"""


def test_good_pr_description_passes():
    assert cl.lint_body(GOOD_PR) == []


def test_pr_description_needs_every_section():
    errs = cl.lint_body(GOOD_PR.replace("## Testing", "## Tests"))
    assert any("'## Testing'" in e for e in errs)


def test_untouched_template_is_rejected():
    template = (pathlib.Path(__file__).resolve().parents[2] / ".github" / "pull_request_template.md").read_text()
    errs = cl.lint_body(template)
    assert any("'## Summary' section is empty" in e for e in errs)


def test_pr_description_rejects_ai_footer():
    assert cl.lint_body(GOOD_PR + "\n🤖 Generated with Claude Code\n") != []


# ---------------------------------------------------------------- git range + CLI

def test_range_lints_each_commit(tmp_path):
    def git(*a):
        subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True)
    git("init", "-q", "-b", "main")
    git("config", "user.name", "T"); git("config", "user.email", "t@example.com")
    (tmp_path / "f").write_text("1"); git("add", "."); git("commit", "-q", "-m", "chore: init")
    (tmp_path / "f").write_text("2"); git("commit", "-qam", "docs: fine change")
    (tmp_path / "f").write_text("3"); git("commit", "-qam", "Bad message")
    import os
    cwd = os.getcwd()
    os.chdir(tmp_path)
    try:
        errs = cl.lint_range("HEAD~2", "HEAD")
    finally:
        os.chdir(cwd)
    assert len(errs) == 1 and "header must look like" in errs[0]


def test_cli_exit_codes(tmp_path):
    f = tmp_path / "m.txt"
    f.write_text("docs: fix typo\n")
    assert cl.main(["msg", str(f)]) == 0
    f.write_text("nonsense\n")
    assert cl.main(["msg", str(f)]) == 1
    assert cl.main(["title", "feat(api): add x"]) == 0
    assert cl.main(["branch", "bad name"]) == 1


# ---------------------------------------------------------------- docs cannot drift from the linter

ROOT = pathlib.Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("doc", ["AGENTS.md", ".github/pull_request_template.md", ".gitmessage"])
def test_short_docs_list_the_exact_types_and_scopes(doc):
    text = (ROOT / doc).read_text()
    assert " ".join(cl.TYPES) in text, f"{doc}: types list differs from scripts/commit_lint.py"
    assert " ".join(cl.SCOPES) in text, f"{doc}: scopes list differs from scripts/commit_lint.py"


def test_contributing_documents_every_type_and_scope():
    text = (ROOT / "CONTRIBUTING.md").read_text()
    missing = [w for w in (*cl.TYPES, *cl.SCOPES) if f"`{w}`" not in text]
    assert not missing, f"CONTRIBUTING.md does not document: {missing}"


def test_documented_limits_match_the_linter():
    contributing = (ROOT / "CONTRIBUTING.md").read_text()
    assert f"at most {cl.SUBJECT_MAX} characters" in contributing
    assert f"about {cl.BODY_LINE_MAX} characters" in contributing
    for t in cl.BODY_REQUIRED_FOR:
        assert f"`{t}`" in contributing
