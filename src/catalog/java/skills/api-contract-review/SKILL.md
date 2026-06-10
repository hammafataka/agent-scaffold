---
name: api-contract-review
description: Reviews REST API contracts for consistency, compatibility, and clarity.
recommended: true
---

# API Contract Review (Java / Spring Boot)

Use this skill when reviewing or designing HTTP APIs: new `@RestController` endpoints, changes to request/response DTOs, OpenAPI specs, or any PR that touches a public or inter-service contract. The goal is a contract that is consistent across the surface, safe to evolve, and unambiguous to consumers.

Review against the checklist below. Flag every deviation with the specific class, field, or annotation involved. Treat anything that breaks an existing consumer as blocking. Prefer framework-native, version-current constructs (`ProblemDetail` + RFC 9457 on Spring 6+/Boot 3+, `PagedModel` for paging, springdoc-openapi v2) over deprecated or hand-rolled patterns.

## 1. Resource naming

URIs identify resources, not actions. Verbs live in the HTTP method.

- Plural nouns for collections: `/orders`, `/orders/{orderId}`, `/orders/{orderId}/line-items`.
- Lowercase, hyphenated path segments (`/line-items`, not `/lineItems` or `/line_items`).
- No verbs in paths (`POST /orders`, not `POST /createOrder`). Exception: genuine non-CRUD operations as a sub-resource, e.g. `POST /orders/{id}/cancel`.
- Identifiers in the path; query params for filtering, sorting, paging only.
- Be consistent: don't mix `/customer/{id}` and `/orders/{orderId}` casing for path variables.

````java
@RestController
@RequestMapping("/api/v1/orders")
class OrderController {
    @GetMapping("/{orderId}")
    OrderResponse get(@PathVariable UUID orderId) { ... }

    @PostMapping("/{orderId}/cancel")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void cancel(@PathVariable UUID orderId) { ... }
}
````

Don't: `@GetMapping("/getOrderById")`, `@PostMapping("/orders/delete/{id}")`.

## 2. Status codes

Map outcomes to the narrowest correct code. Don't return `200` with an error body.

- `200 OK` — successful GET/PUT/PATCH with a body.
- `201 Created` — POST that creates a resource; set the `Location` header.
- `202 Accepted` — async/queued work not yet complete.
- `204 No Content` — successful DELETE or void mutation; no body.
- `400` validation/malformed, `401` unauthenticated, `403` authorized-but-forbidden, `404` not found, `409` conflict (e.g. version/duplicate), `422` semantically invalid, `429` rate-limited.
- `5xx` only for genuine server faults — never for client input errors.

````java
@PostMapping
ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest req) {
    Order o = service.create(req);
    URI loc = URI.create("/api/v1/orders/" + o.getId());
    return ResponseEntity.created(loc).body(OrderResponse.from(o));
}
````

The `400` (syntactic/validation failure) vs `422` (semantically invalid but well-formed) split is fine — but bean-validation failures in particular must use the **same** code across the whole API. The `spring-boot-engineer` skill maps them to Spring's default `400`; if your project standardizes on `422`, configure it everywhere rather than letting two endpoints disagree. Pick one and enforce it.

Do prefer `ResponseEntity` or `@ResponseStatus` to make the code explicit. Don't blanket-catch and rethrow everything as `500`.

## 3. Error schema

One error shape across the whole API. Prefer RFC 9457 `application/problem+json` (it obsoletes the older RFC 7807); Spring Boot 3+ supports it natively via `ProblemDetail`.

````java
@ExceptionHandler(OrderNotFoundException.class)
ProblemDetail handle(OrderNotFoundException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    pd.setType(URI.create("https://errors.example.com/order-not-found"));
    pd.setProperty("orderId", ex.getOrderId());
    return pd;
}
````

- Centralize in one `@RestControllerAdvice`; don't hand-roll error bodies per controller.
- Include a stable machine-readable code/type, a human `detail`, and field-level errors for `400`/`422`.
- Never leak stack traces, SQL, or internal class names to clients.
- Validation errors must list each rejected field and reason, not a single opaque message.

Checklist: same field names everywhere, stable error codes, no PII in messages.

## 4. Versioning

Pick one strategy and apply it uniformly.

- Preferred: URI prefix `/api/v1/...` — visible, cacheable, trivial to route.
- Alternative: media-type versioning (`Accept: application/vnd.example.v2+json`).
- Don't version per-endpoint ad hoc, and don't ship `v2` for a backward-compatible change.
- Keep the previous major version running through a documented deprecation window; signal it with a `Deprecation` and `Sunset` header.

## 5. Pagination, filtering, sorting

Any collection that can grow unbounded MUST paginate. Decide page-based vs cursor-based and keep it consistent.

- Page-based: `?page=0&size=20`. Cap `size` (e.g. max 100) server-side.
- Cursor-based for large/changing datasets: `?cursor=...&limit=...` — more stable under inserts.
- Filtering via explicit query params (`?status=OPEN&createdAfter=2026-01-01`), not free-form query languages.
- Sorting: `?sort=createdAt,desc`. Whitelist sortable fields.
- Response envelope must expose total/next consistently.

````java
@GetMapping
PagedResponse<OrderResponse> list(
        @RequestParam(defaultValue = "OPEN") OrderStatus status,
        @PageableDefault(size = 20) Pageable pageable) {
    Page<Order> page = service.find(status, pageable);
    return PagedResponse.from(page.map(OrderResponse::from));
}
````

Don't expose Spring's `Page`/`PageImpl` JSON shape directly — it is not a stable contract, and Spring Data itself now warns against serializing it. Wrap it in your own envelope, or use Spring Data's `PagedModel<T>` (the framework-native stable wrapper) instead of the raw `PageImpl`.

## 6. Idempotency

- `GET`, `PUT`, `DELETE` must be idempotent by definition; verify the implementation actually is (e.g. repeated DELETE returns `204`/`404`, not `500`).
- `POST` is not idempotent. For create endpoints exposed to retrying clients, support an `Idempotency-Key` header and dedupe server-side.
- `PUT` replaces the full resource; `PATCH` applies a partial change (use JSON Merge Patch or explicit nullable fields, and document which).

````java
@PostMapping
ResponseEntity<OrderResponse> create(
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @Valid @RequestBody CreateOrderRequest req) { ... }
````

## 7. Backward compatibility

Non-breaking (safe) changes:
- Add a new optional request field (with a default).
- Add a new response field.
- Add a new endpoint or a new optional query param.
- Relax a validation constraint.

Breaking (require a new version):
- Remove or rename a field; change its type or semantics.
- Make a previously optional request field required.
- Tighten validation, change an enum's meaning, or remove an enum value.
- Change a status code, error shape, or pagination style.
- Change default behavior of an existing param.

Do treat enums as a compatibility hazard: clients may not know new values. Document how unknown values are handled and avoid removing existing ones.

## 8. OpenAPI

The spec is part of the contract, not an afterthought.

- Generate it from code (springdoc-openapi v2 for Spring Boot 3+) so it can't drift from the implementation.
- Every endpoint documents request/response schemas, status codes, and examples.
- Run a spec diff in CI to catch breaking changes before merge (e.g. `openapi-diff`).
- Annotate intent that code can't express:

````java
@Operation(summary = "Cancel an order")
@ApiResponse(responseCode = "202", description = "Cancellation accepted")
@ApiResponse(responseCode = "409", description = "Order already shipped")
@PostMapping("/{orderId}/cancel")
void cancel(@PathVariable UUID orderId) { ... }
````

## 9. DTO vs entity

Never serialize JPA entities directly on the API boundary.

- Map `@Entity` to dedicated request/response DTOs (Java `record`s are ideal — immutable, explicit).
- Reasons: entities leak persistence concerns, lazy-loading triggers `LazyInitializationException` during serialization, and any field added to the table silently changes the public contract.
- Validate on the request DTO with Bean Validation (`@NotNull`, `@Size`, `@Email`), not on the entity.
- Keep separate `CreateOrderRequest`, `UpdateOrderRequest`, and `OrderResponse` — they have different fields (no client-set `id`/`createdAt` on create).

````java
public record CreateOrderRequest(
        @NotNull UUID customerId,
        @NotEmpty List<@Valid LineItemRequest> items) {}

public record OrderResponse(UUID id, OrderStatus status, Instant createdAt) {
    static OrderResponse from(Order o) {
        return new OrderResponse(o.getId(), o.getStatus(), o.getCreatedAt());
    }
}
````

Don't: return `Order` (the `@Entity`), expose `@JsonIgnore` as a security control, or reuse one DTO for create + update + response.

## 10. Reactive (WebFlux) contracts

The HTTP contract is independent of whether the implementation is blocking or reactive — everything above (naming, status codes, error schema, versioning, idempotency, compatibility, DTOs) applies unchanged, and whether a service is reactive at all is a `java-architect` decision. Reactive adds a few contract-level choices worth reviewing:

- **Declare the streaming shape of a `Flux`.** A `Flux<T>` returned as the default `application/json` is buffered and serialized as a single JSON array — the same wire contract as a `List<T>`. Returning it as `application/x-ndjson` (newline-delimited) or `text/event-stream` (SSE) is a *different* contract that streams element-by-element. Choose deliberately and declare it via `produces`; don't let "it's reactive" silently change the format consumers parse.
- **Pagination over a stream.** Offset `Page`/`Pageable` doesn't map cleanly onto a streamed `Flux`; cursor-based paging (section 5) fits reactive and large datasets better. If you do page, wrap it the same way — don't leak a reactive-specific shape.
- **Functional endpoints still have a contract.** `RouterFunction`/`HandlerFunction` routes carry the same path/status/error obligations as annotated controllers, but they're invisible to springdoc by default — document them with `@RouterOperation`/`@RouterOperations` so the OpenAPI spec (section 8) stays complete.
- **Same error contract, one reactive-only hazard.** Reactive `@RestControllerAdvice` handlers return `ProblemDetail` (or `Mono<ProblemDetail>`) with the identical RFC 9457 body and status mapping. But once a `200` plus streaming headers are flushed, the status can't be changed — verify a mid-stream error (`Mono.error`/`onErrorResume` partway through a `Flux`) doesn't surface to the client as a half-written, falsely-successful `200`.

(The `spring-boot-engineer` skill emits these reactive shapes and `code-reviewer` checks the blocking/streaming boundary at the line level — keep the declared contract and the implementation in step.)

## Review summary checklist

- [ ] Resource paths are plural nouns, lowercase-hyphenated, verb-free.
- [ ] Status codes are specific and correct; `Location` set on `201`; validation code (`400`/`422`) consistent across the API.
- [ ] Single RFC 9457 `ProblemDetail` error schema via one `@RestControllerAdvice`; no internal leakage.
- [ ] Versioning strategy applied uniformly; deprecations signaled.
- [ ] All unbounded collections paginate with a stable wrapper (`PagedModel` or a custom envelope, not raw `PageImpl`); sort/filter fields whitelisted.
- [ ] Idempotency honored for `GET`/`PUT`/`DELETE`; `Idempotency-Key` for retryable `POST`.
- [ ] No breaking change without a version bump; enum evolution considered.
- [ ] OpenAPI generated from code (springdoc v2) and diffed in CI; functional routes documented.
- [ ] DTOs (records) on the boundary; entities never serialized; validation on request DTOs.
- [ ] Reactive endpoints declare their streaming media type (JSON array vs NDJSON vs SSE) and handle mid-stream errors.