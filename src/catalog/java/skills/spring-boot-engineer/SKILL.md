---
name: spring-boot-engineer
description: Implementation playbook for Spring Boot features, with reference material.
recommended: true
---

# Spring Boot Engineer

Use this skill when implementing, extending, or reviewing features in a Java/Spring Boot service. It is an index: start here for the end-to-end flow, then open the focused reference file for the layer you are touching.

Assume Spring Boot 3.x (Jakarta namespace, Java 17+). If the repo is on Boot 2.x / `javax.*`, adapt imports but the patterns hold.

## How to implement a feature end-to-end

Work outside-in, one thin vertical slice at a time. Do not build all repositories first, then all services. Build one path from HTTP to DB and make it green, then iterate.

1. **Clarify the contract.** Nail down the HTTP method, path, request/response shape, status codes, and error cases before writing code. Write request/response DTOs as `record` types. See `references/web.md`.
2. **Model the domain & persistence.** Add or extend the JPA entity and the Spring Data repository. Decide ownership of relationships and fetch strategy now, not later. See `references/data.md`.
3. **Write the service.** Keep business logic in a `@Service` bean. Controllers translate HTTP; services own transactions and rules. Inject dependencies via constructor (no field injection).
4. **Wire the controller.** Map DTO ↔ domain at the edge. Validate input with `@Valid`. Never leak entities across the HTTP boundary.
5. **Secure it.** Decide who can call this endpoint and enforce it with `SecurityFilterChain` rules and/or `@PreAuthorize`. See `references/security.md`.
6. **Add a migration.** Schema changes go through Flyway/Liquibase, never `ddl-auto=update` in anything but local. See `references/data.md`.
7. **Test the slice.** A `@WebMvcTest` (or `@DataJpaTest`) for the unit, plus one `@SpringBootTest` + Testcontainers integration test for the happy path and a key failure. See `references/testing.md`.
8. **Make it operable.** Externalize config, expose health/metrics, add resilience on outbound calls, confirm graceful shutdown. See `references/cloud.md`.

### Layering rules (do / don't)

- **Do** keep the dependency direction `web → service → data`. The data layer must not import web types.
- **Do** return DTOs from controllers; map with a mapper (MapStruct) or explicit factory methods.
- **Don't** put `@Transactional` on controllers. Put it on service methods.
- **Don't** expose JPA entities as request or response bodies — lazy-loading and serialization bugs follow.
- **Don't** catch-and-swallow exceptions; let a `@RestControllerAdvice` translate them.

### Definition of done

- [ ] Endpoint documented (OpenAPI annotations or spec) with all status codes.
- [ ] Input validated; bad input returns `400` with a structured error body (RFC 7807 `ProblemDetail`).
- [ ] AuthZ enforced and covered by a test (allowed + forbidden).
- [ ] DB change shipped as a versioned migration.
- [ ] Web-slice test + one integration test against a real DB (Testcontainers) pass.
- [ ] No secrets in source; config externalized; health endpoint green.

## References

- `references/web.md` — Web layer: controllers, request/response DTOs, validation, content negotiation, error handling, pagination, file upload, MockMvc tests.
- `references/data.md` — Data layer: Spring Data JPA repositories, queries, transactions, migrations, projections, auditing, multi-datasource.
- `references/security.md` — Securing endpoints: Spring Security setup, method security, JWT/OAuth2, role/permission model, testing.
- `references/testing.md` — Testing: slices, `@SpringBootTest`, Testcontainers, mocking boundaries, test profiles.
- `references/cloud.md` — Cloud-native: config, service discovery, resilience (retry/circuit breaker), Actuator/observability, 12-factor, graceful shutdown.
