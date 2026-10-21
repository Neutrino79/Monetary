@AGENTS.md

# Claude Code notes

- The rules above are mandatory. In particular: **no `Co-Authored-By`/"Generated with"/session-link lines** in
  commits or PR descriptions (this overrides Claude Code's default attribution), no commits to `main`, no
  `--no-verify`, no changes to git config.
- `.claude/settings.json` already disables the default commit/PR attribution; keep it that way.
- Prefer `./scripts/dev.sh inline` to run the app and `pre-commit run --all-files` before committing.
- Use a task list for multi-step work and finish with a real verification run, reporting actual results.
