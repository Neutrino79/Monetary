# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub:
**Security → Report a vulnerability** on this repository (private vulnerability reporting).

Include what you found, steps to reproduce, the affected version (`GET /api/v0.5/meta`) and the impact you
expect. You will get an acknowledgement as soon as the maintainer can, and a fix or a decision after triage.
Please allow reasonable time to fix an issue before disclosing it publicly.

## Supported versions

Only the latest release and `main` receive security fixes.

## Scope notes

- Monetary is a self-hosted, single-owner application. Run it behind HTTPS in production and keep
  `MONETARY_ENV=production` (the default).
- Demo mode (`MONETARY_DEMO_MODE`) is for evaluation only. Never use it with real data or expose it to
  the internet without understanding that it lets anyone in without a password.
- Never post secrets, tokens or real financial data in issues or pull requests.
