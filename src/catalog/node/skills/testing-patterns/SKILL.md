---
name: testing-patterns
description: Testing discipline for Node/TypeScript — the right level, boundary mocking, determinism, and honest assertions.
recommended: true
---

# Testing Patterns

How tests are written in this ecosystem so they catch bugs without freezing the implementation.

## Pick the right level

- **Unit** — pure logic: parsing, calculations, reducers, mapping. Fast, no I/O, the bulk of the suite.
- **Integration** — modules wired together: route → service → (test) DB, component + store + fake API. The level where most real bugs live.
- **E2E** — a handful of critical user flows through the running app. Expensive; keep the list short and stable.

When a bug slips through, add the test at the *lowest* level that would have caught it.

## Test behavior, not implementation

- Call the public surface; assert on outputs and observable effects. Asserting "function X was called with Y" couples the test to today's internals — reserve spies for true boundaries (emails sent, events published).
- A behavior-preserving refactor should keep the suite green. If a rename breaks twenty tests, they were testing structure, not behavior.

## Mock at boundaries only

- Mock: network, clock, randomness, filesystem, third-party services.
- Don't mock: your own services/repositories inside integration tests — that's testing the mock.
- Prefer fakes with behavior (in-memory repo) over stub-everything setups; prefer MSW/undici interceptors over patching your HTTP wrapper.

## Determinism

- Fake timers for anything time-based; fixed seeds/UUID stubs; no `sleep`-based waiting — await the actual condition.
- Each test builds its own state (factories/builders); no dependence on execution order or shared mutable fixtures.

## Honest assertions

- Assert the value, not just the shape: `expect(result.total).toBe(42)` beats `toBeDefined()`.
- One behavior per test; name it as the behavior: `rejects expired tokens with 401`.
- Test the failure paths: the throw, the 4xx, the empty list. The happy path alone is half a test.
- Never weaken an assertion, add a `skip`, or widen a mock to get to green — diagnose whether the code or the test is wrong first.
