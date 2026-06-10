---
name: spring-boot-patterns
description: Idiomatic Spring Boot patterns for controllers, services, config, and error handling.
recommended: true
---

# Spring Boot Patterns

Conventions for building maintainable Spring Boot services. Targets Spring Boot 3.x (Jakarta EE namespace, Java 17+).

## Dependency Injection

Use **constructor injection** exclusively. It makes dependencies explicit, enables `final` fields, and keeps classes testable without the Spring context.

```java
@Service
public class OrderService {
    private final OrderRepository orders;
    private final PaymentClient payments;

    // No @Autowired needed: single constructor is auto-wired.
    public OrderService(OrderRepository orders, PaymentClient payments) {
        this.orders = orders;
        this.payments = payments;
    }
}
```

Do:
- Keep one constructor; let Spring inject it implicitly.
- Mark injected fields `final`.
- Use `@Lombok @RequiredArgsConstructor` if Lombok is already in the project — it generates the constructor over `final` fields.

Don't:
- Use `@Autowired` on fields or setters. It hides dependencies and breaks immutability.
- Inject `ApplicationContext` to look up beans manually.
- Create circular dependencies; if two services need each other, extract a third.

## Configuration with `@ConfigurationProperties`

Bind related properties into a typed, validated record instead of scattering `@Value` annotations.

```java
@ConfigurationProperties(prefix = "app.payment")
@Validated
public record PaymentProperties(
        @NotBlank String apiUrl,
        @NotNull Duration timeout,
        @Positive int maxRetries) {
}
```

Register it once and inject the record anywhere:

```java
@Configuration
@EnableConfigurationProperties(PaymentProperties.class)
public class PaymentConfig { }
```

```yaml
# application.yml
app:
  payment:
    api-url: https://pay.example.com
    timeout: 5s
    max-retries: 3
```

Do:
- Group by feature prefix; one properties class per concern.
- Use `@Validated` + Jakarta constraints so misconfiguration fails fast at startup.
- Prefer `Duration`, `DataSize`, and enums over raw strings/ints.

Don't:
- Sprinkle `@Value("${...}")` across services for the same feature.
- Read `Environment` directly in business code.

## Profiles

Use profiles for environment-specific wiring, not feature flags.

```java
@Configuration
@Profile("!prod")
public class DevDataSeeder { /* seed data for local/test */ }
```

```yaml
# application.yml
spring:
  config:
    activate:
      on-profile: prod
```

Do:
- Keep a base `application.yml` plus `application-{profile}.yml` overlays.
- Activate via `SPRING_PROFILES_ACTIVE` env var in deployments.
- Use `@ActiveProfiles("test")` in integration tests.

Don't:
- Hardcode profile checks (`if (env.equals("prod"))`) in business logic.
- Put secrets in profile YAML; use a secrets manager or env vars.

## REST Controllers

Keep controllers thin: validate, delegate, map. No business logic, no repository calls.

```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService service;

    public OrderController(OrderService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse create(@Valid @RequestBody CreateOrderRequest body) {
        return service.create(body);
    }
}
```

Conventions:
- Plural, lowercase, noun resources: `/api/v1/orders`, not `/getOrders`.
- Version the path (`/v1`). Map status codes deliberately: 201 on create, 204 on delete.
- Use `@Valid` on request bodies and let `@ControllerAdvice` translate failures.
- Use DTOs (records) for requests/responses; never expose JPA entities directly.

Don't:
- Return entities (leaks schema, triggers lazy-loading serialization issues).
- Put verbs in URLs or use GET for state changes.

## Error Handling with `@RestControllerAdvice`

Centralize exception-to-response mapping. Return a consistent error shape — `ProblemDetail` (RFC 7807) is built in.

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ProblemDetail handleNotFound(EntityNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        var pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setTitle("Validation failed");
        pd.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(FieldError::getField, FieldError::getDefaultMessage)));
        return pd;
    }
}
```

Do:
- Throw domain exceptions from services; map them in one advice class.
- Log 5xx with stack traces; log 4xx at debug. Never leak stack traces to clients.

Don't:
- Catch-and-swallow, or return raw `Exception.getMessage()` for unexpected errors.
- Use HTTP status as a control-flow mechanism inside services.

## Pagination

Accept `Pageable`, return `Page`. Let Spring Data parse `?page=&size=&sort=`.

```java
@GetMapping
public Page<OrderResponse> list(
        @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
        Pageable pageable) {
    return service.findAll(pageable).map(OrderMapper::toResponse);
}
```

Do:
- Cap page size server-side (`spring.data.web.pageable.max-page-size`) to prevent abuse.
- Default a deterministic sort so paging is stable.

Don't:
- Return unbounded `List<Entity>` from list endpoints.

## Mapping Entities to DTOs

Keep a dedicated mapping layer. For simple cases use a static mapper; for large surfaces use MapStruct.

```java
public final class OrderMapper {
    private OrderMapper() {}

    public static OrderResponse toResponse(Order o) {
        return new OrderResponse(o.getId(), o.getStatus(), o.getTotal());
    }
}
```

```java
// MapStruct alternative — compile-time generated, no reflection.
@Mapper(componentModel = "spring")
public interface OrderMapper {
    OrderResponse toResponse(Order order);
}
```

Do:
- Map at service or web boundary; keep entities inside the persistence layer.
- Use records for DTOs.

Don't:
- Reuse one DTO for both request and response when they differ.
- Add Jackson annotations to entities to "fix" serialization.

## Async

Enable async once, return `CompletableFuture` from `@Async` methods, and supply a bounded executor.

```java
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean
    public Executor taskExecutor() {
        var ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(4);
        ex.setMaxPoolSize(8);
        ex.setQueueCapacity(100);
        ex.setThreadNamePrefix("async-");
        ex.initialize();
        return ex;
    }
}
```

```java
@Async("taskExecutor")
public CompletableFuture<Receipt> sendReceipt(UUID orderId) {
    return CompletableFuture.completedFuture(mailer.send(orderId));
}
```

Do:
- Name a specific executor; never rely on the default `SimpleAsyncTaskExecutor` (unbounded).
- Call `@Async` methods from a different bean — self-invocation bypasses the proxy.

Don't:
- Return `void` from `@Async` when you need the result or to handle failures.
- Assume security/MDC context propagates automatically; configure decorators if needed.

## Scheduling

Use `@Scheduled` for periodic jobs; externalize the cron to config.

```java
@Component
public class ReportJob {
    @Scheduled(cron = "${app.jobs.report-cron}", zone = "UTC")
    public void generate() { /* ... */ }
}
```

Enable with `@EnableScheduling` on a config class.

Do:
- Pin a `zone` for cron jobs to avoid DST surprises.
- Use ShedLock (or a DB lock) so a job runs once across multiple instances.
- Keep job bodies thin — delegate to a service.

Don't:
- Run long blocking work on the single default scheduler thread; give it its own pool.
- Hardcode schedules; bind them via properties so they're tunable per environment.

## Checklist

- [ ] All beans use constructor injection; fields are `final`.
- [ ] Feature config lives in `@ConfigurationProperties` records with `@Validated`.
- [ ] Controllers are thin; entities never cross the web boundary.
- [ ] Single `@RestControllerAdvice` returns `ProblemDetail` for all errors.
- [ ] List endpoints take `Pageable` with a capped size and default sort.
- [ ] `@Async`/`@Scheduled` use named, bounded executors and externalized config.
