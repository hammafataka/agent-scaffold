# Cloud-Native Spring Boot

Make the service configurable, observable, resilient, and disposable. Follow the 12-factor app principles; Spring Boot supports them out of the box if you don't fight them.

## Configuration (12-factor III)

Externalize everything that varies between environments. Config precedence (later wins): defaults in `application.yml` → profile files → env vars → command-line args.

```yaml
# application.yml — sane defaults, no secrets
app:
  payment:
    base-url: ${PAYMENT_BASE_URL:http://localhost:8081}
    api-key: ${PAYMENT_API_KEY}   # required; fail fast if absent
```

Bind config to typed records with `@ConfigurationProperties` and validate it:

```java
@ConfigurationProperties(prefix = "app.payment")
@Validated
public record PaymentProps(@NotBlank String baseUrl, @NotBlank String apiKey) {}
```

- **Do** inject config via `@ConfigurationProperties` records, not scattered `@Value`.
- **Do** keep secrets in env vars / a secrets manager (Vault, AWS/GCP secret stores) — never in `application.yml` or git.
- **Don't** hard-code per-environment values or use profiles to smuggle secrets into the jar.
- **Don't** mutate config at runtime; treat it as immutable per process.

### Spring Cloud Config (optional)

For centralized config across many services, `spring-cloud-config` serves properties from a git-backed server. Use it only when you actually have many services; for a handful, env vars are simpler. Pair with `/actuator/refresh` + `@RefreshScope` for runtime reloads.

## Service discovery (basics)

In Kubernetes, prefer **platform DNS/Services** over a discovery client — call `http://payment-service` and let the cluster route. Reach for Eureka/Consul (`spring-cloud-netflix`/`spring-cloud-consul`) only outside an orchestrator that provides discovery.

```yaml
# k8s-native: just a URL, resolved by cluster DNS
app:
  payment:
    base-url: http://payment-service.payments.svc.cluster.local
```

- **Don't** add Eureka to a Kubernetes deployment "because microservices" — it duplicates what k8s already does.

## Resilience (retry / circuit breaker)

Protect outbound calls with Resilience4j. Wrap third-party/network calls; never wrap pure local logic.

```java
@Retry(name = "payment")
@CircuitBreaker(name = "payment", fallbackMethod = "chargeFallback")
public ChargeResult charge(ChargeRequest req) {
    return paymentClient.charge(req);
}

private ChargeResult chargeFallback(ChargeRequest req, Throwable t) {
    return ChargeResult.deferred();   // degrade gracefully
}
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      payment:
        sliding-window-size: 20
        failure-rate-threshold: 50
        wait-duration-in-open-state: 10s
  retry:
    instances:
      payment:
        max-attempts: 3
        wait-duration: 200ms
        exponential-backoff-multiplier: 2
```

- **Do** set sensible HTTP connect/read timeouts on every client — a missing timeout defeats every circuit breaker.
- **Do** make retried operations idempotent (use an idempotency key) so retries don't double-charge.
- **Don't** retry non-idempotent writes blindly, and don't retry 4xx client errors.
- **Don't** stack long retries behind a synchronous user request — fail fast and degrade.

## Actuator & observability (12-factor XI: logs as streams)

Expose health, metrics, and info. Lock down what's public.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, metrics, prometheus
  endpoint:
    health:
      probes:
        enabled: true            # liveness + readiness groups for k8s
      show-details: when_authorized
  metrics:
    tags:
      application: ${spring.application.name}
```

- **Health probes:** k8s liveness → `/actuator/health/liveness`, readiness → `/actuator/health/readiness`.
- **Metrics:** Micrometer is built in; scrape `/actuator/prometheus`. Add custom timers/counters via `MeterRegistry`.
- **Tracing:** Micrometer Tracing + OpenTelemetry propagates trace IDs across services. Put the trace/span ID in the log pattern so logs correlate.
- **Logging:** write to stdout as structured JSON; let the platform collect it. Don't write log files inside the container.

- **Do** restrict actuator to an internal port or secure it; `/actuator/heapdump` and `/env` leak sensitive data.
- **Don't** expose `*` (all endpoints) publicly.

## 12-factor checklist

- [ ] **Codebase:** one repo, many deploys.
- [ ] **Dependencies:** declared (Maven/Gradle), no system-installed assumptions.
- [ ] **Config:** in the environment, not code.
- [ ] **Backing services:** DB/cache/queue attached via URL config, swappable.
- [ ] **Build/release/run:** strictly separated; image is immutable, config injected at run.
- [ ] **Processes:** stateless; no in-memory session — use Redis/DB for shared state.
- [ ] **Port binding:** self-contained (embedded server), exports HTTP.
- [ ] **Concurrency:** scale out by process/replica count.
- [ ] **Disposability:** fast startup, graceful shutdown (below).
- [ ] **Dev/prod parity:** same backing services in test (Testcontainers) as prod.
- [ ] **Logs:** event streams to stdout.
- [ ] **Admin processes:** run migrations/one-offs as separate jobs, not on app boot under load.

## Graceful shutdown

Let in-flight requests finish before the process dies (critical for zero-downtime rollouts).

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

- **Do** ensure the readiness probe flips to DOWN on `SIGTERM` so the load balancer stops sending traffic before shutdown completes.
- **Do** set the k8s `terminationGracePeriodSeconds` longer than the shutdown timeout.
- **Do** close pools, flush buffers, and stop schedulers/consumers cleanly via `@PreDestroy` or `SmartLifecycle`.
- **Don't** rely on `kill -9`; it severs in-flight requests and connections.
- **Don't** start long background work that can't survive a restart without idempotency/checkpointing.
