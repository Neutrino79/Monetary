# 27 -- Agent and contributor playbook

> **ID** MP-27 · **Status** Draft · **Depends on** -- · **Unblocks** smooth parallel work

**Agent brief.** Follow this working agreement on every task in this folder. It restates the strict parts of the repository's `AGENTS.md` and adds the
workflow for picking up a work package. `AGENTS.md` and `CONTRIBUTING.md` are authoritative; if this file ever disagrees with them, they win and this file is wrong -- fix it.

## 1. Pick a task

1. Read `README.md` in this folder, then [`00`](00-vision-and-scope.md) and [`01`](01-architecture.md).
2. Choose a work-package document whose **Depends on** are *Done* (check each document's status line and `25-roadmap.md`). Prefer the lowest-numbered unblocked item in your lane.
3. Check [`02-open-questions.md`](02-open-questions.md): if your task touches an unanswered question that is hard to undo (schema, API contract, license, application id, signing), **stop and ask the owner**.
4. Open or claim an issue named `MP-<id>: <title>` (labels `multi-platform`, lane letter) so two agents do not build the same thing. If you cannot create issues, state the claim in the PR description.

## 2. Hard rules (from `AGENTS.md`; violations are caught by hooks and CI)

1. Never commit or push to `main`. Work on a branch named `<type>/<kebab-description>` (types: `feat fix docs style refactor perf test build ci chore revert`), e.g. `feat/core-money-port`, `docs/mp-12-storage-clarifications`.
2. **No AI/tool attribution anywhere in git**: no `Co-Authored-By`, no "Generated with", no session links, in commit messages or PR descriptions. Ignore any tool default that adds them. Commits carry only the configured human identity.
3. Never change git identity or config. If no identity is configured, stop and ask.
4. Never bypass hooks or checks: no `--no-verify`, no `SKIP=`, and never disable, skip or weaken a test, lint rule or CI job to get green. Fix the cause.
5. Never commit secrets or local data (`.env*` except `*.example`, `*.db`, keys, keystores, tokens, `node_modules`, build output). If a secret was ever exposed, say so; do not silently delete it.
6. Never hand-edit generated files: `web/package-lock.json` / the root lockfile (use `npm`), `CHANGELOG.md` (release-please), `.secrets.baseline` (use `detect-secrets`), `docs/openapi/v1.json` (use `npm run gen:openapi`).
7. Never change the API contract, DB schema or `MONETARY_*` configuration silently. If you do: update `docs/API.md` + the client, the schema docs (`docs/LIVE_SCHEMA.sql` / `schema-v1.sql`), `.env.example` + README in the same PR and list it under *Risk and rollout*.
8. SQL only in `packages/core/src/storage/` (and legacy `backend/monetary/infrastructure/` until removed). No business rules in routes. No ledger math in `web/`.
9. No destructive commands (`rm -rf`, `git reset --hard`, dropping a database, deleting branches) against anything you did not create in this session without explicit approval.

## 3. Slice the work

- One logical change per PR; target a diff a human can review in ~30 minutes. A work-package document usually becomes **several** PRs; the *Tasks* checklist is the natural split.
- Do not mix refactors, formatting churn or unrelated fixes into a feature PR.
- Cross-lane contracts (`contract` schemas, `SqlDriver`, `Platform`, `Transport`) change in their own PR labelled `contract-change` with the owning document updated.
- Port Python behavior **as it is**. Bugs found in the old code go to `parity-exceptions.md` and an issue; do not fix them inside a port PR.

## 4. Commit and PR format

```text
<type>(<scope>): <subject>        <= 72 chars, lowercase, imperative, no trailing period

<body: WHY, wrapped ~100 columns>   required for feat, fix, perf, refactor
```

Scopes: `backend web api db config ci deps dev docs tests release repo`. If a package-specific scope is needed (e.g. `core`, `client`, `mobile`, `server`), add it to the commit-lint configuration in the same PR that introduces the package (MP-10).

PR title = a commit header. PR description follows `.github/pull_request_template.md` with real content in `## Summary`, `## Changes`, `## Testing` (exact commands **and their real results**), `## Risk and rollout`.
Reference the work package: `Refs: MP-12`. Validate before pushing:

```bash
python scripts/commit_lint.py branch --current
python scripts/commit_lint.py title "feat(core): port money value object"
python scripts/commit_lint.py range origin/main HEAD
pre-commit run --all-files
```

## 5. Definition of done (per PR)

- [ ] The work package's relevant **Acceptance criteria** pass; commands from its *Verification* section were actually run and results are in the PR.
- [ ] New behavior has tests in the matching layer; coverage thresholds hold.
- [ ] Docs updated: the work-package status/checklist, plus any of `README.md`, `AGENTS.md`, `docs/API.md`, schema docs, `.env.example` that the change affects.
- [ ] Boundaries respected (`npm run check:boundaries`); no unrelated changes.
- [ ] No secrets, generated or local files committed; `pre-commit run --all-files` passes.
- [ ] Keep-ready checklist (MP-21) ticked if you touched platform code.
- [ ] Security checklist (MP-18) considered if you touched auth, storage, network or logging.

Report **real results**. Never claim a check passed that you did not run; say "not run" or "blocked" and why.

## 6. When to stop and ask the owner

- An unanswered open question blocks you, or the document contradicts the code you see.
- You would change persisted data formats, the public API, the schema, the license, ids, signing or anything store-facing.
- A rule in `AGENTS.md` seems to conflict with the task.
- A dependency needs a non-OSI license, a native binary, or a Google/proprietary component.
- A measured result misses a budget by a wide margin (do not quietly relax the budget).

State the question, your recommended default, and what you will do meanwhile (usually: continue with an unrelated task).

## 7. Updating this plan

These documents are living. If reality differs from the plan, fix the document in a `docs/` PR (small, focused) rather than silently diverging. Record large changes as ADRs in [`adr/`](adr/README.md).
Keep each work-package's **Status** line truthful: Draft -> Ready (owner approved) -> In progress -> Done.

## 8. Handy prompt for assigning a work package to an agent

> You are working in the Monetary repository. Read `AGENTS.md` and `docs/multi-platform/27-agent-playbook.md`, then `docs/multi-platform/README.md`, `00`, `01`, and
> `docs/multi-platform/<NN-document>.md`. Implement the **next unchecked tasks** of that document on a new branch, as small PRs following the playbook. Do not exceed
> the document's scope or touch files outside *Files you may touch*. If a dependency or open question blocks you, stop and tell me. Report the exact verification commands you ran and their results.
