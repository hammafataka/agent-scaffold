---
name: typescript-patterns
description: Strict, idiomatic TypeScript — types that model the domain, safe narrowing, and async discipline.
recommended: true
---

# TypeScript Patterns

Idiomatic, strict TypeScript. Apply when writing or reviewing TS code.

## Types model the domain

- Make illegal states unrepresentable: discriminated unions over boolean flags.

```ts
// Don't: four booleans, nine impossible combinations
type State = { loading: boolean; error?: Error; data?: User };
// Do: each state is exactly one shape
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "success"; data: User };
```

- Derive, don't duplicate: `Pick`, `Omit`, `ReturnType`, `Parameters`, `keyof typeof` keep one source of truth.
- Narrow types at function boundaries; accept the widest input you handle, return the narrowest output you produce.

## No `any` — and what to do instead

- Unknown external data → `unknown`, then validate/narrow (schema validator or type guard) before use.
- "The types are wrong" → fix the type or write a typed wrapper; a cast hides the bug it was about to catch.
- Generic code → type parameters with constraints, not `any`.
- `as T` is only for provable facts the compiler can't see (e.g. after a filter it can't follow) — and deserves a comment.

## Null discipline

- `??` for defaults (not `||`, which eats `0`, `""`, `false`).
- Optional chaining for reads; explicit early returns for logic.
- Non-null `!` only when the invariant is enforced a few lines above — otherwise restructure.

## Async discipline

- No floating promises: every promise is `await`ed, returned, or explicitly `.catch`ed.
- `return await` inside `try` — otherwise the catch never sees the rejection.
- Independent awaits → `Promise.all`; independent-and-fallible → `Promise.allSettled`.
- Never `async` inside `forEach`; use `for…of` (sequential) or `map` + `Promise.all` (parallel).

## Module hygiene

- Named exports; `const` by default; no side effects at import time beyond wiring.
- One concept per file; barrel files (`index.ts`) re-export only the public surface.
- `import type { … }` for type-only imports.
