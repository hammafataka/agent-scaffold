---
name: design-patterns
description: Common design patterns in a Spring/Java context with when-to-use guidance.
recommended: true
---

# Design Patterns for Java / Spring Boot

Patterns are tools, not goals. In Spring, the container already solves wiring, lifecycle, and configuration — so reach for a GoF pattern only when the framework doesn't already give you a cleaner mechanism. This skill maps the classic patterns to idiomatic Spring usage and flags the ones that become anti-patterns inside a managed container. It leans on the same principles as the `clean-code` skill (composition over inheritance, dependency direction) and the boundaries the `java-architect` skill defines (ports/adapters, hexagonal); keep them consistent.

## How to choose

- Prefer **dependency injection** over hand-rolled factories and singletons.
- Prefer **`ApplicationEvent`** over hand-rolled observer registries when decoupling within a process.
- Reach for a GoF pattern when behavior varies along an axis the framework doesn't model: algorithm selection (Strategy), object construction (Builder), incompatible interfaces (Adapter), layered behavior (Decorator).
- Don't introduce a pattern to satisfy a checklist. One concrete implementation is fine until a second variant actually exists.

## Strategy

Use when one operation has several interchangeable algorithms selected at runtime (payment processors, pricing rules, export formats). In Spring, inject all implementations as a collection or map — no manual registry.

```java
public interface PaymentStrategy {
    PaymentResult charge(Money amount, Card card);
    PaymentMethod supports(); // discriminator
}

@Component
class StripePaymentStrategy implements PaymentStrategy { /* ... */ }

@Service
public class PaymentService {
    private final Map<PaymentMethod, PaymentStrategy> strategies;

    // Spring injects a Map keyed by bean name, or build your own key:
    PaymentService(List<PaymentStrategy> impls) {
        this.strategies = impls.stream()
            .collect(toMap(PaymentStrategy::supports, identity()));
    }

    public PaymentResult charge(PaymentMethod method, Money amount, Card card) {
        PaymentStrategy s = strategies.get(method);
        if (s == null) throw new UnsupportedPaymentMethodException(method);
        return s.charge(amount, card);
    }
}
```

- Do: let `@Component` discovery register strategies; add a new variant by adding a class.
- Don't: write a `switch` on an enum that you must edit for every new variant.

## Factory

Use when construction logic is non-trivial or the concrete type depends on runtime input. In Spring, most "factories" are just `@Bean` methods or `@Configuration` classes — let the container be your factory.

```java
@Configuration
class ClientConfig {
    @Bean
    HttpClient httpClient(ClientProps props) {
        return HttpClient.newBuilder()
            .connectTimeout(props.connectTimeout())
            .build();
    }
}
```

- Use a `@Bean` method for stateless, config-driven construction.
- Use `ObjectProvider<T>` / `FactoryBean<T>` when you need lazy or per-call creation inside the container.
- Use a plain factory class only for prototype objects built from request data, not framework collaborators.
- Don't: re-implement DI with a static `XxxFactory.getInstance()` — it hides dependencies and breaks testability.

## Builder

Use for immutable objects with many optional fields, or to make test fixtures readable. Prefer Lombok or records-with-builder over hand-written setters.

```java
@Builder
public record OrderRequest(
    CustomerId customerId,
    List<LineItem> items,
    @Nullable DiscountCode discount,
    ShippingMethod shipping
) {}

OrderRequest req = OrderRequest.builder()
    .customerId(id)
    .items(items)
    .shipping(ShippingMethod.STANDARD)
    .build();
```

- Do: use builders for value objects, DTOs, and test data builders (`anOrder().withItems(...)`).
- Don't: put `@Builder` on JPA `@Entity` classes — it conflicts with the no-arg constructor JPA requires and encourages mutable half-constructed entities. Use a factory method on the entity instead.

## Adapter

Use to bridge an external/legacy interface to the one your domain expects. The adapter lives at the boundary (an outbound port implementation), keeping third-party types out of your core.

```java
// Domain port
public interface NotificationSender {
    void send(Notification n);
}

// Adapter to a vendor SDK
@Component
class TwilioSmsAdapter implements NotificationSender {
    private final TwilioRestClient twilio;
    public void send(Notification n) {
        twilio.messages().create(toTwilioMessage(n)); // translate types here
    }
}
```

- Do: keep vendor types (`TwilioRestClient`, generated gRPC stubs) behind the adapter.
- Don't: leak the vendor's exceptions or DTOs into service/controller layers.

## Decorator

Use to add cross-cutting behavior (caching, retry, metrics, logging) around an existing interface without modifying it. Often Spring AOP or a `@Cacheable`/`@Retryable` annotation is the better answer; hand-write a decorator when the behavior is domain-specific. (On reactive return types, neither AOP annotation behaves as you'd expect — see the Reactive section.)

```java
@Primary
@Component
class CachingRateProvider implements RateProvider {
    private final RateProvider delegate;
    private final Cache cache;

    CachingRateProvider(@Qualifier("liveRateProvider") RateProvider delegate, Cache cache) {
        this.delegate = delegate; this.cache = cache;
    }
    public Rate rateFor(Currency c) {
        return cache.get(c, () -> delegate.rateFor(c));
    }
}
```

- Use `@Primary` + `@Qualifier` to inject the wrapped bean cleanly.
- Prefer `@Cacheable`, `@Retryable`, `@Timed` for generic concerns — less code, observable config.
- Don't: stack five hand-written decorators when an AOP aspect expresses the same concern once.

## Template Method

Use when a multi-step algorithm has a fixed skeleton but variable steps. Spring's own `JdbcTemplate`, `RestTemplate`, and `AbstractController` are template methods. In your code, prefer composition (Strategy) over deep inheritance unless the steps are genuinely tied together.

```java
public abstract class ImportJob<T> {
    public final ImportResult run(InputStream in) {  // skeleton, final
        var rows = parse(in);
        var valid = rows.stream().filter(this::isValid).toList();
        persist(valid);
        return summarize(valid);
    }
    protected abstract List<T> parse(InputStream in);
    protected abstract boolean isValid(T row);
    protected abstract void persist(List<T> rows);
}
```

- Do: mark the template method `final` so subclasses can't break the skeleton.
- Don't: use template method when subclasses share almost no skeleton — that's just inheritance for reuse, which couples unrelated classes.

## Chain of Responsibility

Use when a request passes through an ordered series of handlers, each able to handle, transform, or pass it along (validation pipelines, request filters, enrichment steps). In Spring this is an ordered `List<T>` of beans or the servlet/WebFlux filter chain — not a hand-linked `next` pointer.

```java
public interface OrderValidator {
    void validate(OrderRequest request);   // throw to reject (or accumulate errors)
}

@Component @Order(1)
class StockValidator implements OrderValidator { /* ... */ }

@Component @Order(2)
class CreditValidator implements OrderValidator { /* ... */ }

@Service
class OrderValidation {
    private final List<OrderValidator> validators;   // injected in @Order sequence

    OrderValidation(List<OrderValidator> validators) { this.validators = validators; }

    void validate(OrderRequest request) {
        validators.forEach(v -> v.validate(request));
    }
}
```

- Do: let Spring inject the chain as an ordered `List<T>` (`@Order` sets sequence); add a link by adding a bean — same idiom as Strategy.
- Do: reach for `Filter`/`HandlerInterceptor` (or `WebFilter` in WebFlux) for HTTP-level cross-cutting steps.
- Don't: hand-wire a `setNext()` linked list — it hides both the order and the membership; the bean list *is* the chain.

## Observer

Use to decouple a producer from consumers within the same process. Spring's `ApplicationEventPublisher` is the idiomatic observer — no manual listener lists.

```java
public record OrderPlaced(OrderId id, Money total) {}

@Service
class OrderService {
    private final ApplicationEventPublisher events;
    public void place(OrderRequest r) {
        // ... persist ...
        events.publishEvent(new OrderPlaced(order.id(), order.total()));
    }
}

@Component
class InventoryListener {
    @EventListener
    @Async // optional; needs @EnableAsync
    void on(OrderPlaced e) { /* reserve stock */ }
}
```

- Use `@TransactionalEventListener(phase = AFTER_COMMIT)` to react only after the producing transaction commits.
- Don't: use in-process events as a durable message bus — they are lost on crash. For cross-service or at-least-once delivery use Kafka/RabbitMQ + an outbox.
- Don't: build side-effect chains where listeners trigger listeners; it becomes impossible to trace.

## Reactive (Project Reactor)

In a WebFlux/Reactor service the structural patterns above are unchanged — Strategy, Factory, and Adapter simply return `Mono`/`Flux`. What shifts is the cross-cutting layer: several concerns Spring normally expresses as AOP annotations are blocking-oriented and misbehave on reactive return types, and Reactor's operators are the idiomatic replacement. Whether the service is reactive at all is a `java-architect` decision; `code-reviewer` enforces that nothing blocks the event loop.

- **Cross-cutting via operators, not blocking aspects.** `@Cacheable`, `@Retryable`, and `@Timed` were built for blocking returns. On a method returning `Mono`/`Flux` they wrap the *publisher*, not the emitted value — `@Cacheable` caches the `Mono` rather than its result, `@Retryable` "retries" the cheap assembly call. Use the operator the framework already gives you:
  - retry → `.retryWhen(Retry.backoff(maxAttempts, minBackoff))`
  - timeout → `.timeout(Duration)`
  - cache → `.cache(ttl)` for a shared `Mono`, or a reactive-aware cache (`CacheMono`), not `@Cacheable`
  - metrics → `.name(...).metrics()` / `.tap(...)` over `@Timed`
- **Decorator still works, in reactive form.** A hand-written decorator over a reactive port is fine when the behavior is domain-specific — just keep the wrapped call non-blocking and return the publisher.
- **Observer → `Sinks`.** For in-process reactive fan-out, a `Sinks.Many<T>` (e.g. `Sinks.many().multicast().onBackpressureBuffer()`) is the reactive observer; subscribers consume the resulting `Flux`. The `ApplicationEvent` caveats still hold — it's in-process and lost on crash, so cross-service or at-least-once still means a broker + outbox.
- **Template Method → operator composition.** A reactive pipeline expresses a fixed skeleton with variable steps as a chain of named operators (`flatMap(this::parse).flatMap(this::persist)`), not an abstract base class. Compose functions instead of inheriting a template.
- **Don't block to bridge patterns.** Calling `.block()` to fit a reactive collaborator into a blocking pattern (or vice-versa) defeats the model — adapt with operators, or keep the two stacks separate (a `java-architect` call).

```java
// Don't: blocking-oriented annotations on a reactive return type
@Cacheable("rates") @Retryable
public Mono<Rate> rateFor(Currency c) { return client.fetchRate(c); } // caches/retries the Mono, not the value

// Do: Reactor operators express the same concerns correctly
public Mono<Rate> rateFor(Currency c) {
    return client.fetchRate(c)
        .retryWhen(Retry.backoff(3, Duration.ofMillis(200)))
        .timeout(Duration.ofSeconds(2))
        .cache(Duration.ofMinutes(5));   // shares one result for the TTL
}
```

## Spring-idiomatic alternatives at a glance

| Classic pattern | Spring-native form |
| --- | --- |
| Singleton | Default bean scope (`@Component`/`@Service`) |
| Factory | `@Bean` method, `ObjectProvider`, `FactoryBean` |
| Strategy registry | Inject `List<T>` / `Map<String,T>` of beans |
| Chain of responsibility | Ordered `List<T>` of beans (`@Order`), `Filter`/`WebFilter` chain |
| Observer | `ApplicationEventPublisher` + `@EventListener`; `Sinks.Many` when reactive |
| Proxy/Decorator (cross-cutting) | AOP aspect, `@Cacheable`, `@Retryable`, `@Transactional` (blocking); Reactor operators when reactive |
| Template method (infra) | `*Template` classes (`JdbcTemplate`, `RestTemplate`) |

## Anti-patterns to avoid

- **Manual singletons** (`getInstance()` + static state): fights the container, hides dependencies, leaks across tests. Use a bean.
- **Service Locator** (`context.getBean(Foo.class)` in business code): inverts the benefit of DI and hides the dependency graph. Inject what you need via the constructor.
- **`@Autowired` field injection**: not final, not testable without reflection, hides required dependencies. Use constructor injection (it also enables `final` fields and catches cycles at startup).
- **Anemic domain model + God service**: when every pattern is a `@Service` and entities are bare getters/setters, behavior piles into one class. Push invariants into domain types.
- **Pattern for one variant**: a Strategy interface with a single implementation, or a Factory that constructs one type. Add the abstraction when the second case appears (YAGNI).
- **`@Builder` on entities**: see Builder section — breaks JPA and encourages mutability.
- **Blocking-oriented AOP on reactive types**: `@Cacheable`/`@Retryable`/`@Timed` on a `Mono`/`Flux` wrap the publisher, not the value. Use Reactor operators — see the Reactive section.
- **Events as durable messaging**: see Observer section.
- **Deep inheritance for reuse**: prefer composition; inheritance is for genuine "is-a" with a shared skeleton.

## Checklist before adding a pattern

- [ ] Does Spring already provide this (DI, events, AOP, `*Template`)?
- [ ] Is there a real second variant, or am I speculating?
- [ ] Are dependencies injected via the constructor and `final`?
- [ ] Do framework/vendor types stay behind a boundary (adapter)?
- [ ] Can I unit-test the result without the Spring context?
- [ ] On reactive types, are cross-cutting concerns done with Reactor operators (`retryWhen`/`timeout`/`cache`), not blocking `@Cacheable`/`@Retryable`?