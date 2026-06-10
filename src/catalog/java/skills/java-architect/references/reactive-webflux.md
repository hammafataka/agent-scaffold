# Spring WebFlux

WebFlux is a non-blocking, event-loop web stack built on Project Reactor
(`Mono`/`Flux`) and Netty. It scales I/O-bound workloads on few threads. It is
**not** faster for CPU-bound work and adds real complexity. Choose deliberately.

## When to use reactive vs MVC

Use **WebFlux** when:
- The service is I/O-bound and fans out to many slow downstreams (gateways,
  aggregators, BFFs).
- You need streaming (SSE, large/infinite responses) or very high concurrent
  connection counts with limited threads.
- The whole call chain can stay non-blocking (reactive driver/clients end to
  end).

Stay on **Spring MVC** when:
- You use JDBC/JPA, most blocking libraries, or a normal request/response CRUD
  app.
- The team isn't fluent in reactive debugging.
- You're on Java 21+ with virtual threads — `spring.threads.virtual.enabled=true`
  gives much of the scalability of reactive on the simpler blocking model. This
  is the right default for most new I/O-bound services now.

One blocking call in a reactive chain can stall the event loop and tank the
whole service. Don't go half-reactive.

## Mono / Flux basics

- `Mono<T>` — 0..1 element. `Flux<T>` — 0..N.
- Nothing runs until subscribed; returning the publisher from a controller is the
  subscription.
- Compose, don't block: `map`, `flatMap` (async, ordered-ish), `concatMap`
  (ordered), `zip` (combine), `switchIfEmpty`, `defaultIfEmpty`.

```java
@GetMapping("/users/{id}")
Mono<UserView> get(@PathVariable String id) {
    return users.findById(id)                         // Mono<User>
        .flatMap(u -> orders.totalFor(u.id())          // async call
            .map(total -> new UserView(u, total)))
        .switchIfEmpty(Mono.error(new NotFoundException(id)));
}
```

Streaming:

```java
@GetMapping(value = "/prices", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
Flux<Price> stream() {
    return priceFeed.flux().delayElements(Duration.ofMillis(200));
}
```

## Backpressure

Reactive Streams lets a slow consumer signal a fast producer. With a cold,
demand-aware source (DB driver, `Flux.generate`) backpressure is automatic. For
hot/external sources, choose an overflow strategy:

- `onBackpressureBuffer(n)` — bounded buffer, then error/drop.
- `onBackpressureDrop()` / `onBackpressureLatest()` — shed load.
- `Flux.create(sink, OverflowStrategy.BUFFER)` when bridging callbacks.

Never use an unbounded buffer on an unbounded source — that's an OOM waiting to
happen.

## R2DBC

Reactive relational access. There is **no reactive JPA**; R2DBC is repositories
+ a `DatabaseClient`, with explicit relations.

```java
public interface OrderRepository extends ReactiveCrudRepository<Order, Long> {
    Flux<Order> findByStatus(Status status);
}
```

- Transactions: `@Transactional` works with `R2dbcTransactionManager`, or use
  `TransactionalOperator` for programmatic control.
- No lazy loading / no `@OneToMany` graph magic — load related data with explicit
  queries and combine with `flatMap`/`zip`.
- If you need rich ORM mapping or heavy transactional writes, JPA on MVC (with
  virtual threads) is often the better trade.

## Error handling

```java
mono.onErrorResume(NotFoundException.class, e -> Mono.empty())
    .onErrorMap(SQLException.class, e -> new DataAccessException(e))
    .timeout(Duration.ofSeconds(2))
    .retryWhen(Retry.backoff(3, Duration.ofMillis(100)));
```

Centralize HTTP mapping with `@RestControllerAdvice` + `@ExceptionHandler`
returning `Mono<ResponseEntity<...>>`, or implement `ErrorWebExceptionHandler`.
`doOnError` is for side effects (logging) only — it does not handle the error.

## Calling other services

Use the reactive `WebClient` (not `RestTemplate`):

```java
webClient.get().uri("/x/{id}", id)
    .retrieve()
    .onStatus(HttpStatusCode::is4xxClientError, r -> Mono.error(new NotFoundException(id)))
    .bodyToMono(Thing.class)
    .timeout(Duration.ofSeconds(1));
```

## Testing with StepVerifier

```java
@Test
void emitsTwoThenCompletes() {
    StepVerifier.create(service.stream())
        .expectNext(first)
        .expectNext(second)
        .verifyComplete();
}

@Test
void errorsOnMissing() {
    StepVerifier.create(service.get("nope"))
        .expectError(NotFoundException.class)
        .verify();
}
```

Use `StepVerifier.withVirtualTime(() -> Mono.delay(...))` to test time-based
operators without real sleeping. For endpoints, use `WebTestClient`.

## Pitfalls

- **Blocking calls in the chain** — JDBC, `RestTemplate`, `Thread.sleep`,
  `.block()`, file I/O. They starve the event loop. If unavoidable, isolate on
  `Schedulers.boundedElastic()` via `subscribeOn`/`publishOn` — but that erodes
  the reason to use WebFlux at all. Add the BlockHound agent in tests to catch
  blocking on event-loop threads.
- **Calling `.block()`** in production reactive code — almost always a bug.
- **Mutable shared state** across operators — keep pipelines pure; use the
  Reactor `Context` to pass request-scoped data (security, MDC), not ThreadLocal.
- **Lost stack traces** — enable `Hooks.onOperatorDebug()` in dev or use
  `reactor-tools` for readable assembly traces.

## Checklist

- [ ] The entire call chain is non-blocking (reactive driver + WebClient).
- [ ] Backpressure strategy chosen for any hot source.
- [ ] Timeouts and retry/backoff on every external call.
- [ ] Errors mapped centrally; no business logic in `doOnError`.
- [ ] BlockHound enabled in tests; no `.block()` in prod code.
- [ ] You actually need reactive — otherwise MVC + virtual threads.
