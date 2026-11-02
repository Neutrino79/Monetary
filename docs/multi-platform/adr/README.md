# Architecture Decision Records (multi-platform)

An ADR records **one** significant decision: the context, what we decided, why, what it costs, and what we rejected.
They are short and permanent: to change a decision, add a new ADR that supersedes the old one.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-single-ts-core-in-process-api.md) | One TypeScript core; API runs in-process (local) or on Node (cloud) | Proposed |
| [0002](0002-capacitor-ui-shell.md) | Capacitor around the one React UI; React Native deferred | **Accepted** |
| [0003](0003-sql-driver-port-and-migrations.md) | SQL driver port, forward-only migrations, two drivers | Proposed |
| [0004](0004-ids-money-time.md) | Ids, money and time rules for the port | Proposed |
| [0005](0005-license.md) | License | Proposed |
| [0006](0006-distribution-and-signing.md) | Distribution channels and signing | Proposed |
| [0007](0007-contract-first-zod-openapi.md) | Contract-first API with Zod and generated OpenAPI | Proposed |
| [0008](0008-web-server-backed-and-repo-restructure.md) | Web is server-backed (no browser database); repository restructured to `apps/` + `packages/` | **Accepted** |

Statuses: **Proposed** (needs owner confirmation; agents may build to it but must not do irreversible work), **Accepted**, **Superseded by NNNN**, **Rejected**.

## Template

```markdown
# ADR NNNN: <title>
- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Deciders: <owner / who>

## Context
## Decision
## Consequences
(good, bad, what becomes harder)
## Alternatives considered
## Verification / revisit when
```
