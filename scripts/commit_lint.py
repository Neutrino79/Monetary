#!/usr/bin/env python3
"""Enforce the repository's git conventions (see CONTRIBUTING.md). Standard library only.

    commit_lint.py msg FILE [--local]    lint a commit message file (the commit-msg hook)
    commit_lint.py title "TEXT"          lint a PR title (it becomes the squash-commit subject)
    commit_lint.py branch NAME|--current lint a branch name
    commit_lint.py body FILE             lint a PR description (required, filled-in sections)
    commit_lint.py range BASE HEAD       lint every non-merge commit in BASE..HEAD (CI)

Exit status is 0 when everything passes, 1 when a rule is broken (one message per problem), 2 on misuse.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys

TYPES = ("feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert")
SCOPES = ("backend", "web", "api", "db", "config", "ci", "deps", "dev", "docs", "tests", "release", "repo")
BODY_REQUIRED_FOR = ("feat", "fix", "perf", "refactor")

SUBJECT_MAX = 72
BODY_LINE_MAX = 100

HEADER_RE = re.compile(r"^(?P<type>[a-z]+)(?:\((?P<scope>[^()\s]+)\))?(?P<bang>!)?: (?P<subject>.+)$")
FOOTER_RE = re.compile(r"^(?:[A-Za-z][A-Za-z-]*|BREAKING[ -]CHANGE)(?::\s|\s#)\S")
BRANCH_RE = re.compile(r"^(?:%s)/[a-z0-9]+(?:-[a-z0-9]+)*$" % "|".join(TYPES))
# Branches that tools create and that we do not rename.
BRANCH_EXEMPT_RE = re.compile(r"^(?:main|dependabot/.+|release-please--.+)$")

# AI / bot attribution is not allowed in commits: the committer is the author of record.
AI_ATTRIBUTION_RE = re.compile(
    r"(?im)^\s*(?:co-authored-by:.*(?:claude|anthropic|copilot|chatgpt|openai|gpt|cursor|gemini|codex|\[bot\]|"
    r"noreply@anthropic\.com)|"
    r"claude-session:|generated (?:with|by) .*(?:claude|copilot|chatgpt|gemini|cursor)|🤖\s*generated)"
)

PR_REQUIRED_SECTIONS = ("Summary", "Changes", "Testing", "Risk and rollout")
PR_CONTENT_SECTIONS = ("Summary", "Changes", "Testing")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)


def _lint_header(header: str) -> tuple[list[str], re.Match[str] | None]:
    errors: list[str] = []
    m = HEADER_RE.match(header)
    if not m:
        errors.append(
            f"header must look like 'type(scope): subject' (scope optional), got: {header!r}. "
            f"Types: {', '.join(TYPES)}"
        )
        return errors, None
    if m["type"] not in TYPES:
        errors.append(f"unknown type {m['type']!r}; use one of: {', '.join(TYPES)}")
    if m["scope"] and m["scope"] not in SCOPES:
        errors.append(f"unknown scope {m['scope']!r}; use one of: {', '.join(SCOPES)} (or omit the scope)")
    subject = m["subject"]
    if len(header) > SUBJECT_MAX:
        errors.append(f"header is {len(header)} characters; keep it to {SUBJECT_MAX} or fewer")
    if subject[0].isupper():
        errors.append("subject must start with a lowercase letter (write 'add x', not 'Add x')")
    if subject.endswith("."):
        errors.append("subject must not end with a period")
    if subject != subject.strip():
        errors.append("subject has leading/trailing whitespace")
    return errors, m


def _split_footers(lines: list[str]) -> tuple[list[str], list[str]]:
    """Split a message body into (body, footers). Footers are the last blank-line-separated paragraph when
    every line in it is 'Token: value' (or an indented continuation of one)."""
    end = len(lines)
    start = end
    while start > 0 and lines[start - 1].strip():
        start -= 1
    block = lines[start:end]
    if block and FOOTER_RE.match(block[0]) and all(FOOTER_RE.match(x) or x.startswith(" ") for x in block):
        return lines[:start], block
    return lines, []


def lint_title(title: str) -> list[str]:
    errors, _ = _lint_header(title.strip())
    return errors


def lint_message(message: str, *, local: bool = False) -> list[str]:
    """Lint a full commit message. With local=True, git-generated messages (merge, fixup!, ...) pass."""
    lines = [ln.rstrip("\n") for ln in message.splitlines() if not ln.startswith("#")]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ["commit message is empty"]

    header = lines[0]
    if local and re.match(r"^(Merge |Revert \"|fixup! |squash! |amend! )", header):
        return []

    errors, m = _lint_header(header)
    rest = lines[1:]
    if rest and rest[0].strip():
        errors.append("leave a blank line between the header and the body")
    body_lines = rest[1:] if rest and not rest[0].strip() else rest

    body_lines, footers = _split_footers(body_lines)
    body_text = "\n".join(body_lines).strip()

    if m and m["type"] in BODY_REQUIRED_FOR and not body_text:
        errors.append(
            f"a '{m['type']}' commit needs a body explaining WHY the change was made (not just what)"
        )
    for ln in body_lines:
        if len(ln) > BODY_LINE_MAX and "://" not in ln:
            errors.append(f"body line longer than {BODY_LINE_MAX} characters: {ln[:50]!r}...")
            break
    if m and m["bang"] and not any(re.match(r"^BREAKING[ -]CHANGE: \S", f) for f in footers):
        errors.append("a '!' (breaking change) needs a 'BREAKING CHANGE: <what breaks and how to migrate>' footer")
    if AI_ATTRIBUTION_RE.search(message):
        errors.append(
            "remove AI/bot attribution (Co-Authored-By: <AI>, 'Generated with ...', Claude-Session ...): "
            "commits carry only the human author's identity"
        )
    return errors


def lint_branch(name: str) -> list[str]:
    if BRANCH_EXEMPT_RE.match(name) or BRANCH_RE.match(name):
        return []
    return [
        f"branch name {name!r} is invalid; use '<type>/<kebab-case-description>' with type one of "
        f"{', '.join(TYPES)} (example: feat/add-budget-alerts)"
    ]


def _sections(body: str) -> dict[str, str]:
    body = HTML_COMMENT_RE.sub("", body)
    out: dict[str, list[str]] = {}
    current: str | None = None
    for ln in body.splitlines():
        h = re.match(r"^##\s+(.+?)\s*$", ln)
        if h:
            current = h.group(1)
            out[current] = []
        elif current is not None:
            out[current].append(ln)
    return {k: "\n".join(v).strip() for k, v in out.items()}


def lint_body(body: str) -> list[str]:
    errors: list[str] = []
    sections = _sections(body)
    for name in PR_REQUIRED_SECTIONS:
        if name not in sections:
            errors.append(f"PR description is missing the '## {name}' section (see the PR template)")
    for name in PR_CONTENT_SECTIONS:
        text = sections.get(name)
        if text is not None and len(re.sub(r"[-*\s]|\[[ xX]\]", "", text)) < 3:
            errors.append(f"the '## {name}' section is empty; fill it in (write 'n/a: <reason>' if it truly does not apply)")
    if AI_ATTRIBUTION_RE.search(body):
        errors.append("remove AI/bot attribution lines ('Generated with ...', Claude-Session ...) from the PR description")
    return errors


def lint_range(base: str, head: str) -> list[str]:
    shas = subprocess.run(
        ["git", "rev-list", "--no-merges", "--reverse", f"{base}..{head}"],
        check=True, capture_output=True, text=True,
    ).stdout.split()
    errors: list[str] = []
    for sha in shas:
        msg = subprocess.run(
            ["git", "log", "-1", "--format=%B", sha], check=True, capture_output=True, text=True
        ).stdout
        errors += [f"{sha[:7]}: {e}" for e in lint_message(msg)]
    return errors


def _report(errors: list[str], what: str) -> int:
    if not errors:
        print(f"ok: {what}")
        return 0
    print(f"FAILED: {what}", file=sys.stderr)
    for e in errors:
        print(f"  - {e}", file=sys.stderr)
    print("See CONTRIBUTING.md for the full conventions.", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("msg"); s.add_argument("file"); s.add_argument("--local", action="store_true")
    s = sub.add_parser("title"); s.add_argument("text")
    s = sub.add_parser("branch"); s.add_argument("name", nargs="?"); s.add_argument("--current", action="store_true")
    s = sub.add_parser("body"); s.add_argument("file")
    s = sub.add_parser("range"); s.add_argument("base"); s.add_argument("head")
    a = p.parse_args(argv)

    if a.cmd == "msg":
        with open(a.file, encoding="utf-8") as fh:
            return _report(lint_message(fh.read(), local=a.local), "commit message")
    if a.cmd == "title":
        return _report(lint_title(a.text), "PR title")
    if a.cmd == "branch":
        name = a.name
        if a.current or not name:
            name = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"], check=True, capture_output=True, text=True
            ).stdout.strip()
        if name == "HEAD":  # detached (e.g. CI checkout): nothing to check
            return 0
        return _report(lint_branch(name), f"branch name {name!r}")
    if a.cmd == "body":
        with open(a.file, encoding="utf-8") as fh:
            return _report(lint_body(fh.read()), "PR description")
    if a.cmd == "range":
        return _report(lint_range(a.base, a.head), f"commits in {a.base}..{a.head}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
