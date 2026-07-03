---
name: node-api-patterns
description: Server-side patterns for Node APIs — boundary validation, layering, error contracts, and async safety.
recommended: true
---

# Node API Patterns

Server-side discipline for HTTP APIs. Apply when writing or reviewing route/service/data-access code.

## The boundary rule

Everything from outside — request bodies, params, headers, env vars, queue messages — is `unknown` until validated.

```ts
// Don't: trust + cast
const { email } = req.body as { email: string };
// Do: validate at the edge, typed from then on
const body = createUserSchema.parse(req.body); // 400s on failure, typed after
```

Validate once at the boundary; internals take typed parameters and never re-check.

## Layering

- **Route/controller**: parse input → call service → map result to response. No business logic, no DB access.
- **Service**: business rules, orchestration, transactions. No `req`/`res` types — services take domain inputs.
- **Data access**: queries live here, behind functions named for intent (`findActiveUsersByTeam`), not leaked query builders.

## Error contract

- One error-handling middleware / exception filter maps domain errors → status codes. Handlers throw; they don't build error responses inline.
- Error body is consistent: `{ code, message, details? }`. No stack traces, no ORM error text, no internal identifiers to clients.
- Expected failures (not found, conflict, validation) are typed domain errors, not generic `Error` with string matching.

## Async safety on the server

- Every outbound call (HTTP, DB, queue) has a timeout; long chains propagate cancellation (AbortSignal).
- Fire-and-forget needs an error sink and a comment — an unhandled rejection takes the process down.
- Don't hold a transaction open across external calls.
- Batch lookups in collection handlers: N+1 queries are the default failure mode of "map + await".

## Operational hygiene

- Structured logs with request correlation; log the decision, not the payload; never log secrets/PII.
- Health endpoint that checks real dependencies; graceful shutdown (stop accepting, drain, close pools).
- Env config read and validated once at startup — a missing var fails boot, not the first request that needs it.
