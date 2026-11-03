# ADR 0007: Contract-first API with Zod schemas and generated OpenAPI

- Status: **Proposed**
- Date: 2026-11-02
- Deciders: repository owner

## Context

Today the API contract is defined by Pydantic models in Python and documented in `docs/API.md`; the web app mirrors types by hand. With one TypeScript core, in-process and HTTP callers, and a parity requirement, the contract must be a single machine-readable source shared by server, client and tests.

## Decision

1. `packages/contract` holds **Zod** schemas for every request, response, query parameter and error body; TypeScript types are inferred from them.
2. `packages/api` validates input and shapes output with these schemas (Hono with a Zod-OpenAPI integration or equivalent).
3. An **OpenAPI 3.1** document is generated to `docs/openapi/v1.json`; CI fails on drift. `docs/API.md` stays as the human guide.
4. The web client imports types from `contract`; no hand-copied wire types.
5. API compatibility is expressed by `apiVersion` (breaking changes only) and `minClientApi` in `GET /meta`.

## Consequences

- (+) One source of truth; client, server and tests cannot disagree; third-party clients get OpenAPI.
- (+) The same schemas validate archive import (MP-19).
- (-) Zod/OpenAPI tooling becomes a dependency (bundle size on mobile; checked in spike S6).
- (-) Generated OpenAPI is only as good as the schema annotations; needs discipline.

## Alternatives considered

- **OpenAPI-first with code generation**: also valid; more tooling, less ergonomic TypeScript; could be reconsidered.
- **tRPC**: great DX for TS-only stacks, but not a plain HTTP contract for scripts and third-party clients; rejected.
- **Hand-written types** (status quo): drift risk; rejected.
- **JSON Schema + Ajv**: workable; Zod gives inference with less glue.

## Verification / revisit when

Spike S6 (bundle size) and the first parity run.
