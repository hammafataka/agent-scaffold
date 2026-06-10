---
name: java-architect
description: Deep architecture guidance for Java/Spring Boot systems, with reference material.
recommended: true
---

# Java Architect

Architecture guidance for Java/Spring Boot systems. This file is an index: it
gives you a decision framework and points to deep-dive reference files. Load a
reference only when the task touches its area — don't read all of them up front.

## How to approach an architecture decision

1. **Name the forcing constraint.** Latency budget, read/write ratio, team
   size, deployment model, data consistency requirement. Most "best practice"
   debates dissolve once the constraint is explicit.
2. **Prefer the boring option.** Spring MVC + JPA + Postgres handles the vast
   majority of workloads. Reach for WebFlux/R2DBC, CQRS, or event sourcing only
   when a measured constraint demands it (see `references/reactive-webflux.md`).
3. **Make the change reversible.** Hide the risky choice behind an interface so
   you can swap implementations. One-way doors (data model, public API, auth
   model) deserve more scrutiny than two-way doors.
4. **Measure before optimizing.** No N+1 fix, cache, or reactive rewrite without
   a profiler trace or query log proving the bottleneck.
5. **Write it down.** For anything irreversible, capture context/decision/
   consequences in a short ADR next to the code.

## Layering

Keep a clear dependency direction: `web → service → repository → entity`. Web
depends on service; service depends on repository; nothing depends on web.

- **Web/controller** — HTTP only. Validate input (`@Valid`), map to DTOs, call
  one service method, translate exceptions. No business logic, no entities on the
  wire.
- **Service** — transactions (`@Transactional`) and business rules. The
  transaction boundary lives here, never in the controller or repository.
- **Repository** — persistence (`JpaRepository` / queries). No business rules.
- **Domain/entity** — the model. Keep JPA annotations here; never leak entities
  to controllers — use DTOs/records.

```java
@RestController
@RequestMapping("/api/orders")
class OrderController {
    private final OrderService service; // depends DOWN only

    @PostMapping
    ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest req) {
        return ResponseEntity.status(CREATED).body(service.create(req));
    }
}
```

**Do**
- Put `@Transactional` on service methods, default to `readOnly = true` for reads.
- Use DTOs/records at the web boundary; map with a dedicated mapper.
- Constructor-inject dependencies (final fields, no field injection).

**Don't**
- Don't serialize JPA entities directly (lazy-loading + `LazyInitializationException`).
- Don't open transactions in controllers or call repositories from controllers.
- Don't let a "util" or "helper" package become a dumping ground that everything
  depends on.

## Boundaries and modularization

- Organize by **feature/bounded context first**, then by layer inside it
  (`com.acme.orders.{web,service,repository,domain}`), not one giant `service`
  package. See `references/spring-boot-setup.md`.
- A module exposes a small public surface (a service interface, a few DTOs) and
  hides the rest. Use package-private visibility aggressively.
- Cross-context calls go through the public service, never directly into another
  context's repository or entities.
- For larger systems, enforce boundaries with Spring Modulith or ArchUnit tests
  so the layering can't silently rot.

## When to consult each reference

| If the task involves… | Read |
|---|---|
| Slow queries, N+1, lazy loading, paging | `references/jpa-optimization.md` |
| High-concurrency I/O, streaming, R2DBC, Mono/Flux | `references/reactive-webflux.md` |
| New project, profiles, config, Actuator, build | `references/spring-boot-setup.md` |
| Auth, the filter chain, JWT/OAuth2, CORS/CSRF | `references/spring-security.md` |
| What to test and how, Testcontainers, slices | `references/testing-patterns.md` |

## References

- [references/jpa-optimization.md](references/jpa-optimization.md) — JPA/Hibernate performance: N+1 detection, fetch joins, `@EntityGraph`, projections, batch fetching, caching, pagination, read-only tx.
- [references/reactive-webflux.md](references/reactive-webflux.md) — Spring WebFlux: Mono/Flux, reactive vs MVC, backpressure, R2DBC, error handling, StepVerifier, blocking-call pitfalls.
- [references/spring-boot-setup.md](references/spring-boot-setup.md) — Project setup: starters, `@ConfigurationProperties`, profiles, package structure, build config, Actuator, dev productivity.
- [references/spring-security.md](references/spring-security.md) — Security architecture: filter chain, authn/authz, method security, JWT/OAuth2 resource server, CORS/CSRF, testing.
- [references/testing-patterns.md](references/testing-patterns.md) — Testing strategy: unit vs slice vs integration, Testcontainers, MockMvc/WebTestClient, data builders, coverage, contract tests.
