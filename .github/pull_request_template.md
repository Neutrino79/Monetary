## What and why
<!-- What does this change, and why? Link the issue if there is one. -->

## Type
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / chore
- [ ] Docs

## Checklist
- [ ] Backend: `./scripts/check.sh` passes (and new behaviour has a test in the matching `tests/` layer)
- [ ] Web: `npm run typecheck && npm run lint && npm test && npm run build` pass in `web/`
- [ ] API contract changed? Updated `web/src/lib/api/` and `docs/API.md` in this PR
- [ ] Schema changed? Called out below (there are no migrations yet: existing databases must be recreated)
- [ ] No secrets, `.env` files or databases committed
- [ ] Docs / README updated if setup, config or structure changed

## Notes for the reviewer
<!-- Risks, follow-ups, screenshots of UI changes. -->
