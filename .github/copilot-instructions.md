# Copilot instructions

Follow [`AGENTS.md`](../AGENTS.md) (rules for AI agents) and [`CONTRIBUTING.md`](../CONTRIBUTING.md) (conventions).

The essentials:

- Branch `<type>/<kebab-case>`; commits and PR titles in Conventional Commits form
  `type(scope): lowercase imperative subject` (max 72 chars); `feat`/`fix`/`perf`/`refactor` commits need a body
  that explains why.
- PR descriptions use `.github/pull_request_template.md` with real content in Summary, Changes, Testing and
  Risk and rollout.
- Never add AI attribution (`Co-Authored-By`, "Generated with ...") to commits or PRs; never commit to `main`.
- Backend layering: `presentation → application → infrastructure → domain`; SQL only in `infrastructure/`; the
  web app contains no ledger logic.
- Run `./scripts/check.sh` (backend) and `npm run typecheck && npm run lint && npm test && npm run build` (in
  `web/`) and report the real results.
