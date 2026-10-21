<!--
PR TITLE (required): Conventional Commits, because we squash-merge and the title becomes the commit subject.
    <type>(<scope>): <lowercase imperative subject, no period, max 72 chars>
    e.g.  feat(api): add budget alerts      fix(web): keep the date filter after a refresh
Types : feat fix docs style refactor perf test build ci chore revert
Scopes: backend web api db config ci deps dev docs tests release repo   (optional)
Breaking change: add "!" after the type/scope AND a "BREAKING CHANGE: ..." line in the description.
Branch: <type>/<kebab-case-description>, e.g. feat/add-budget-alerts

All four sections below are required and checked by CI. Delete the comments as you fill them in.
-->

## Summary
<!-- 1-3 sentences: WHAT this changes and, above all, WHY. Link the issue if there is one. -->

## Changes
<!-- Bullet list of the notable changes, grouped by area if it is large. -->
-

## Testing
<!-- Exactly how you verified this: commands run and results, or manual steps. "n/a: <reason>" only for docs-only changes. -->

## Risk and rollout
- [ ] API contract unchanged (or: `docs/API.md` and `web/src/lib/api/` updated in this PR)
- [ ] Database schema unchanged (or: stated here that existing databases must be recreated -- there are no migrations yet)
- [ ] No new/changed environment variables (or: `backend/.env.example` and README updated)
- [ ] Not a breaking change (or: title has `!` and the description has a `BREAKING CHANGE:` line)

## Related
<!-- Refs: #123   or   Fixes: #123   (leave blank if none) -->

## Checklist
- [ ] `./scripts/check.sh` passes (backend) and/or `npm run typecheck && npm run lint && npm test && npm run build` pass (`web/`)
- [ ] New behaviour has tests in the matching layer (`backend/tests/unit`, `service`, `infrastructure`, `api`, `web/src/test`)
- [ ] Docs updated where behaviour, setup, config or structure changed
- [ ] No secrets, `.env` files, databases or generated files committed
