# Spring Boot Project Setup

A clean setup pays off for the life of the project. Defaults below assume a
recent Boot 3.x line on Java 21 (LTS).

## Starters

Pull capabilities through starters; let Boot manage versions via its BOM.

- `spring-boot-starter-web` — MVC + embedded Tomcat (use `-webflux` for
  reactive; don't include both).
- `spring-boot-starter-data-jpa` — JPA/Hibernate + transactions.
- `spring-boot-starter-validation` — Jakarta Bean Validation (`@Valid`).
- `spring-boot-starter-actuator` — health/metrics/info.
- `spring-boot-starter-security` — auth.
- `spring-boot-starter-test` — JUnit 5, Mockito, AssertJ, MockMvc (test scope).
- DB driver (`org.postgresql:postgresql`) and migrations
  (`org.flywaydb:flyway-core`).

**Do** add a Flyway/Liquibase migration tool from day one; set
`spring.jpa.hibernate.ddl-auto=validate` (never `update`/`create` outside throw-
away dev DBs).

## Package structure

Package by feature/bounded context, then by layer inside it:

```
com.acme.app
├── AppApplication.java
├── config/                 # cross-cutting @Configuration, beans
├── orders/                 # a bounded context
│   ├── web/                # controllers, request/response records
│   ├── service/            # @Service, @Transactional
│   ├── domain/             # entities, value objects
│   └── repository/         # Spring Data repositories
├── catalog/                # another context (same internal shape)
└── shared/                 # genuinely shared kernel (small!)
```

Keep classes package-private where possible so contexts can't reach into each
other's internals. Enforce with ArchUnit or Spring Modulith.

## Configuration properties

Prefer typed `@ConfigurationProperties` over scattered `@Value`:

```java
@ConfigurationProperties(prefix = "app.payments")
@Validated
public record PaymentProperties(
        @NotBlank String apiKey,
        @DefaultValue("5s") Duration timeout,
        int maxRetries) {}
```

```java
@SpringBootApplication
@ConfigurationPropertiesScan
public class AppApplication { ... }
```

```yaml
app:
  payments:
    api-key: ${PAYMENTS_API_KEY}      # bind from env / secret manager
    timeout: 3s
    max-retries: 3
```

**Do** validate config at startup (`@Validated`) so misconfiguration fails fast.
**Don't** commit secrets — bind from env vars / a secrets manager.

## Profiles

- Use profiles for environment differences only: `application.yml` (shared) +
  `application-dev.yml`, `application-prod.yml`, `application-test.yml`.
- Activate with `SPRING_PROFILES_ACTIVE=prod`; never hard-code a default prod
  profile in the jar.
- `@Profile("dev")` on beans for dev-only wiring (e.g., a fake mailer).
- Keep prod config minimal and override via environment, not files baked into the
  image.

## Build config

- Use the Spring Boot Gradle/Maven plugin for the BOM and the runnable jar.
- Pin the Java toolchain (Gradle `java { toolchain { languageVersion = 21 } }`)
  so builds are reproducible across machines.
- Build OCI images with `bootBuildImage` (buildpacks) or a multi-stage
  Dockerfile with a layered jar for fast rebuilds.
- Add static analysis to the build: Spotless/Checkstyle, plus optionally
  ErrorProne or NullAway. Fail the build on violations in CI.

## Actuator

Expose health/metrics; lock the rest down.

```yaml
management:
  endpoints.web.exposure.include: health,info,metrics,prometheus
  endpoint.health.show-details: when-authorized
  metrics.tags.application: ${spring.application.name}
```

- Wire Micrometer to your backend (Prometheus/OTLP).
- Define readiness/liveness probes for Kubernetes
  (`management.endpoint.health.probes.enabled=true`).
- **Don't** expose `env`, `heapdump`, `threaddump`, or `configprops` publicly —
  put Actuator behind auth or a separate management port.

## Dev productivity

- `spring-boot-devtools` for auto-restart and live reload (dev scope only).
- Docker Compose support: a `compose.yaml` + the
  `spring-boot-docker-compose` dependency spins up Postgres/Redis on `bootRun`.
- Testcontainers integration (`@ServiceConnection`) for tests that mirror prod
  infra (see `testing-patterns.md`).
- Lombok is optional — Java `record`s cover most DTO/value cases without it.

## Observability hooks

- Structured (JSON) logging in prod; correlation IDs via Micrometer Tracing.
- `spring.threads.virtual.enabled=true` on Java 21 for cheap concurrency on the
  blocking stack.

## Checklist

- [ ] Java toolchain pinned; Boot BOM manages versions.
- [ ] Flyway/Liquibase present; `ddl-auto=validate`.
- [ ] Package-by-feature; boundaries enforced (ArchUnit/Modulith).
- [ ] Typed, validated `@ConfigurationProperties`; secrets from env.
- [ ] Profiles for env only; prod profile not baked in.
- [ ] Actuator exposed selectively and secured; metrics wired to a backend.
- [ ] Static analysis + formatting enforced in CI.
