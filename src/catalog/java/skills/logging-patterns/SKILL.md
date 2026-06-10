---
name: logging-patterns
description: Structured, useful logging for Spring Boot services.
recommended: true
---

# Logging Patterns (Java / Spring Boot)

Logs are an operational interface, not a debug afterthought. Every line should be
queryable, attributable to a request, free of secrets, and cheap enough to leave
on in production. This skill defines the conventions for SLF4J, structured output,
correlation, and configuration.

## Logger setup (SLF4J + Logback)

Use the SLF4J API everywhere. Never call Logback, Log4j2, or `java.util.logging`
directly — bind the implementation only at the dependency level (`spring-boot-starter`
ships Logback). Declare one private static final logger per class.

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
}
```

If Lombok is already in the project, `@Slf4j` is equivalent and preferred for brevity.
Do not mix both styles in one codebase — pick one.

**Always use parameterized logging.** It defers string building until the level is
enabled and is null-safe.

```java
log.info("Settled order {} for customer {} amount {}", orderId, customerId, amount);   // do
log.info("Settled order " + orderId + " for customer " + customerId);                   // don't — concatenates eagerly
```

The exception (a `Throwable`) is passed as the last argument with no `{}` placeholder:

```java
log.error("Failed to settle order {}", orderId, ex);   // ex stack trace is captured
```

## Levels — pick deliberately

| Level | Use for | Production default |
|-------|---------|--------------------|
| `ERROR` | Unhandled failures, broken invariants, paging-worthy events | on |
| `WARN`  | Recoverable degradation: retries, fallbacks, deprecated paths | on |
| `INFO`  | Business lifecycle events: request received, order placed, job done | on |
| `DEBUG` | Branch decisions, intermediate state, external call payload shapes | off |
| `TRACE` | Loop-level / per-record detail | off |

Rules of thumb:
- One `INFO` per significant business operation, not per method call.
- Do not log-and-rethrow at every layer — it produces duplicate stack traces. Log
  once, at the boundary that decides the outcome (usually `@RestControllerAdvice` or
  the service that handles the failure).
- `ERROR` means "a human may need to act." If it's expected (e.g. validation
  rejected), it's `WARN` or `INFO`, not `ERROR`.

```java
log.error("Order {} placed but inventory reservation failed; manual reconciliation needed",
        orderId, ex);   // genuine ERROR
log.warn("Rate limit hit calling pricing-service, retrying in {}ms (attempt {})",
        backoff, attempt);   // expected, recoverable
```

## Structured / JSON logging

Plain text is fine for local dev; production should emit JSON so logs are
machine-parseable in Loki / ELK / Datadog. Use `logstash-logback-encoder`.

```xml
<dependency>
  <groupId>net.logstash.logback</groupId>
  <artifactId>logstash-logback-encoder</artifactId>
  <version>7.4</version>
</dependency>
```

Attach typed key/value pairs instead of cramming everything into the message
string. Prefer `StructuredArguments`:

```java
import static net.logstash.logback.argument.StructuredArguments.kv;

log.info("Order placed {} {}", kv("orderId", orderId), kv("amountCents", amountCents));
```

This renders as a readable message in dev and as discrete JSON fields
(`orderId`, `amountCents`) in production — searchable without regex.

**Do** keep field names stable and lowerCamelCase across services (`orderId`,
not `order_id` here and `OrderID` there). Treat them as a schema.
**Don't** log large objects with `toString()`; log the few fields you'll actually
query on.

## MDC and correlation IDs

Every log line for a request must carry a trace identifier. Put it in the MDC once,
at the edge, and it propagates to every line on that thread.

```java
@Component
public class CorrelationIdFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Correlation-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
            FilterChain chain) throws ServletException, IOException {
        String id = Optional.ofNullable(req.getHeader(HEADER))
                .filter(s -> !s.isBlank())
                .orElse(UUID.randomUUID().toString());
        MDC.put("correlationId", id);
        res.setHeader(HEADER, id);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();   // critical: pooled threads are reused
        }
    }
}
```

Add the field to the encoder pattern (`%X{correlationId}`) or rely on the JSON
encoder, which includes the whole MDC automatically.

Checklist:
- [ ] `MDC.clear()` in a `finally` block — leaking MDC across pooled threads is a
      common, hard-to-spot bug.
- [ ] Propagate the ID to downstream HTTP/Kafka calls (copy it into outgoing headers).
- [ ] For `@Async` / executor work, copy the MDC into the task (`MDC.getCopyOfContextMap()`)
      — child threads do not inherit it.
- [ ] If using Micrometer Tracing / OTel, reuse its `traceId`/`spanId` instead of
      rolling your own; just ensure they land in the MDC.

## What NOT to log

Treat the log store as low-trust and broadly readable. Never log:

- Passwords, tokens, API keys, secrets, full `Authorization` headers.
- Full PANs, CVVs, raw card data (PCI), national IDs, health data.
- PII beyond what's necessary: emails, phone numbers, full names, addresses —
  log a stable surrogate (`customerId`, hashed email) instead.
- Whole request/response bodies or entity dumps "just in case."

```java
log.debug("Auth ok for {}", maskEmail(user.email()));   // do — a***@x.com
log.info("Login request {}", request);                  // don't — toString may leak password
```

Practical guards:
- Add a `toString()` to DTOs that excludes sensitive fields, or use
  `@ToString(exclude = {"password", "token"})`.
- Mask at the source with a helper, not by trusting downstream redaction.
- Keep a CI grep / Sonar rule for `password`, `secret`, `Authorization` near `log.`.

## Exception logging

- Log the exception object, never just `ex.getMessage()` — you lose the stack trace
  and the cause chain.
- Log a throwable **once**. Catch-log-rethrow at multiple layers duplicates noise.
- Don't `log.error` an exception you're rethrowing to a handler that already logs it.
- Include the business context the stack trace lacks (which order, which user).

```java
try {
    gateway.charge(card, amount);
} catch (GatewayException ex) {
    log.error("Charge failed for order {} via {}", orderId, gateway.name(), ex);  // do
    throw new PaymentFailedException(orderId, ex);
}
```

```java
catch (GatewayException ex) {
    log.error(ex.getMessage());   // don't — no stack trace, no context
    throw ex;
}
```

## Performance

- Parameterized logging already skips work for disabled levels. Only add a
  `log.isDebugEnabled()` guard when the *arguments themselves* are expensive to
  compute (serialization, DB lookup, big collection joins).

```java
if (log.isDebugEnabled()) {
    log.debug("Resolved graph {}", expensiveGraphDump(node));
}
```

- Never log inside tight loops at `INFO`+. Aggregate and log a summary line.
- Make appenders **async** in production (`AsyncAppender` or Logback's async
  config) so logging I/O does not block request threads. Set a bounded queue and
  decide drop-vs-block under pressure deliberately.
- Avoid logging in hot serialization paths and per-row JPA callbacks.

## Configuration per profile

Keep one `logback-spring.xml` (the `-spring` suffix enables `<springProfile>`).
Human-readable console for dev, JSON for deployed environments.

```xml
<configuration>
  <springProfile name="local,dev">
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
      <encoder>
        <pattern>%d{HH:mm:ss.SSS} %-5level [%X{correlationId}] %logger{36} - %msg%n</pattern>
      </encoder>
    </appender>
    <root level="INFO"><appender-ref ref="CONSOLE"/></root>
  </springProfile>

  <springProfile name="staging,prod">
    <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
      <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
    </appender>
    <root level="INFO"><appender-ref ref="JSON"/></root>
  </springProfile>
</configuration>
```

Per-package levels belong in `application-*.yml` so they're tunable without a rebuild:

```yaml
logging:
  level:
    root: INFO
    com.acme.payments: DEBUG
    org.hibernate.SQL: WARN
```

Guidance:
- In containers, log to **stdout** and let the platform ship logs — do not write
  files inside the container.
- Expose the Actuator `loggers` endpoint (secured) to flip a package to `DEBUG` at
  runtime during an incident, then revert.
- Keep third-party loggers (`org.apache`, `org.hibernate`) at `WARN` unless
  actively debugging them.

## Quick review checklist

- [ ] Parameterized messages, no string concatenation.
- [ ] Correct level; `ERROR` is actionable only.
- [ ] Exceptions passed as the throwable arg, logged once.
- [ ] No secrets/PII; sensitive fields excluded from `toString()`.
- [ ] `correlationId` in MDC, cleared in `finally`, propagated downstream.
- [ ] JSON encoder in prod, readable console in dev, levels in YAML.
- [ ] Stable, lowerCamelCase structured field names.
