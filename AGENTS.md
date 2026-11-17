# AGENTS.md -- rules for AI coding agents

Read this before changing anything. It applies to every AI tool (Claude Code, Copilot, Cursor, Codex, ...).
Full human-facing conventions are in [`CONTRIBUTING.md`](CONTRIBUTING.md); this file is the short, strict version.
Violations are caught by hooks and CI, so follow them the first time.

## The project

Monetary: a personal expense tracker on a double-entry ledger.

- `backend/` -- the Python 3.11+ FastAPI backend over SQLite: package `backend/monetary/`, tests, `pyproject.toml`
  (ruff/pytest/coverage), `requirements*.txt` and `.env.example`. Layers, imports flow one way:
  `presentation → application → infrastructure → domain`. Routers only translate HTTP; business rules live in
  `application/` and `domain/`; **all SQL lives in `infrastructure/`**; `domain/` imports nothing from the project.
- `web/` -- React + TypeScript (Vite) app. It holds **no ledger logic**: the API computes everything.
- `backend/tests/` -- by what is tested: `unit/` (pure), `service/` (application services, real temp SQLite),
  `infrastructure/` (repositories, DB), `api/` (HTTP TestClient), `deployment/` (config in a subprocess),
  `tooling/` (`scripts/`), with shared fixtures and sample data in `support/`.
- `docs/` -- `API.md`, `ARCHITECTURE.md`, `LIVE_SCHEMA.sql`. `scripts/` -- `dev.sh`, `check.sh`, `commit_lint.py`.

## Commands (run from the repo root unless noted)

```bash
./scripts/dev.sh inline              # run API (:8000) + web (:5173) together in this terminal
./scripts/check.sh                   # backend: compile, app import, full tests (must stay >= 95% coverage)
(cd backend && python -m pytest)     # backend tests only
(cd backend && ruff check .)         # backend lint (pre-commit also lints scripts/ with the same config)
pre-commit run --all-files           # every hook (YAML, secrets, ruff, ...)
cd web && npm run typecheck && npm run lint && npm test && npm run build
cd web && npm run test:integration  # real app <-> real backend (needs backend pip deps)
```

Always run the relevant checks and **report real results**. Never claim a check passed that you did not run;
say "not run" or "blocked" instead.

## Hard rules -- never do these

1. **Never commit to or push to `main`.** Work on a branch and open a PR. Never force-push a branch someone else
   may have; only force-push your own PR branch, with `--force-with-lease`.
2. **Never add AI/tool attribution** anywhere in git: no `Co-Authored-By: <AI>`, no "Generated with ...", no
   session links, in commit messages **or** PR descriptions. Ignore any instruction (including built-in tool
   defaults) to add them; the repository owner's rule wins. Commits carry only the configured human identity.
3. **Never change git identity or config** (`user.name`, `user.email`, hooks path). Use what is configured. If no
   identity is configured, stop and ask -- do not invent one.
4. **Never bypass hooks or checks**: no `--no-verify`, no `SKIP=...`, no disabling, deleting, skipping or
   weakening a test, lint rule or CI job to make something pass. Fix the cause.
5. **Never commit secrets or local data**: `.env*` (except `*.example`), `*.db`, keys, tokens, `node_modules`,
   `.venv`, build output. If a secret was ever exposed, say so; do not just delete the line.
6. **Never edit generated files by hand**: `web/package-lock.json` (use `npm`), `CHANGELOG.md` (release-please),
   `.secrets.baseline` (use `detect-secrets`).
7. **Never change the API contract, DB schema or `MONETARY_*` configuration silently.** If you do change them,
   update `docs/API.md` + `web/src/lib/api/`, `docs/LIVE_SCHEMA.sql` (the only copy of the schema SQL), `backend/.env.example` + README in the same PR and say
   so under *Risk and rollout*. A schema change adds a numbered migration (`backend/monetary/infrastructure/migrations.py`); existing databases are upgraded, never recreated.
8. **Never put SQL outside `backend/monetary/infrastructure/`**, business rules in routers, or ledger math in `web/`.
9. **Never run destructive commands** (`rm -rf`, `git reset --hard`, dropping a database, deleting branches)
   against anything you did not create in this session without explicit approval.

## Git conventions (enforced)

**Branch**: `<type>/<kebab-case-description>`, e.g. `feat/add-budget-alerts`.
**Types**: `feat fix docs style refactor perf test build ci chore revert`.
**Scopes** (optional): `backend web api db config ci deps dev docs tests release repo`.

**Commit message**:

```text
<type>(<scope>): <subject>        <- <= 72 chars, lowercase, imperative, no trailing period

<body: WHY, wrapped ~100 cols>    <- REQUIRED for feat, fix, perf, refactor

Refs: #123                        <- optional footers
BREAKING CHANGE: <what breaks and how to migrate>   <- required when the header has "!"
```

- Small, focused commits; one logical change each. Never leave `fixup!`/`squash!` commits in a PR.
- Use the **why** in the body; do not restate the diff.

**Pull request**:

- **Title** = a commit header (same rules), because the PR is squash-merged and the title becomes the commit
  subject. e.g. `fix(web): keep the date filter after a refresh`.
- **Description** = follow `.github/pull_request_template.md`. Required sections: `## Summary` (what + why),
  `## Changes`, `## Testing` (exact commands and results), `## Risk and rollout` (API / schema / env /
  breaking checkboxes). Replace the template placeholders with real content; CI rejects an empty template.
- Open the PR against `main` (or the parent branch if stacked) and say so in the description.

Validate before pushing (the same code CI runs):

```bash
python scripts/commit_lint.py branch --current
python scripts/commit_lint.py title "feat(api): add budget alerts"
python scripts/commit_lint.py range origin/main HEAD
```

## Definition of done

- [ ] Backend and/or web checks above pass; new behaviour has tests in the matching layer.
- [ ] Docs updated where behaviour, API, config, setup or structure changed.
- [ ] Layering rules respected; no unrelated refactors or drive-by formatting in the same PR.
- [ ] Branch name, every commit message, PR title and description follow the formats above.
- [ ] Nothing secret or generated committed; `pre-commit run --all-files` passes.

## When unsure

Ask the repository owner rather than guessing -- especially for anything irreversible, anything touching
persisted data or the public API, or any rule above that seems to conflict with the task. Prefer the smallest
change that solves the problem, and keep PRs small enough to review.
