# Testing Strategy

Aim for a healthy distribution: many fast unit tests, fewer slice tests, a small
number of full integration tests. Optimize for fast feedback and confidence, not
a coverage number.

## The three layers

| Type | Spring context | Speed | Use for |
|---|---|---|---|
| Unit | none | ms | business logic, mappers, validators, pure services |
| Slice | partial (`@WebMvcTest`, `@DataJpaTest`) | fast | one layer wired to its collaborators (mocked elsewhere) |
| Integration | full (`@SpringBootTest`) | slow | wiring, transactions, real DB, end-to-end paths |

### Unit tests — the bulk

No Spring. Construct the class, mock collaborators, assert. Fast and stable.

```java
class PricingServiceTest {
    PricingService service = new PricingService(new FlatTaxPolicy());

    @Test
    void appliesTax() {
        assertThat(service.total(money("100")))
            .isEqualTo(money("110"));
    }
}
```

Put the transaction/orchestration logic in a service and test the rules here,
without a database.

### Slice tests — one layer at a time

`@WebMvcTest` — controller + MVC infra, everything else mocked:

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean OrderService service;   // @MockBean on older Boot

    @Test
    void returns201() throws Exception {
        when(service.create(any())).thenReturn(new OrderResponse(1L));
        mvc.perform(post("/api/orders").contentType(APPLICATION_JSON).content("{...}"))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.id").value(1));
    }
}
```

`@DataJpaTest` — repositories + an in-memory or (better) Testcontainers DB.
Tests mappings, queries, and constraints; rolls back per test by default.

For WebFlux, use `@WebFluxTest` + `WebTestClient` instead of MockMvc.

### Integration tests — the real thing

`@SpringBootTest(webEnvironment = RANDOM_PORT)` boots the app. Keep these few
and targeted at wiring/transaction behavior you can't trust from slices.

## Testcontainers

Test against the same database you run in prod — not H2. Boot's
`@ServiceConnection` auto-wires the datasource:

```java
@SpringBootTest
@Testcontainers
class OrderIntegrationTest {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16");

    @Autowired OrderRepository repo;
    // ... real Postgres, real SQL dialect, real migrations
}
```

- Reuse containers across the suite (singleton container or
  `testcontainers.reuse.enable=true`) to cut startup cost.
- Use it for Kafka, Redis, S3 (LocalStack) too — anything stateful your code
  talks to.

## MockMvc vs WebTestClient

- `MockMvc` — servlet stack, no real port; ideal in `@WebMvcTest`.
- `WebTestClient` — works against MockMvc, WebFlux, or a running port
  (`@SpringBootTest` + `RANDOM_PORT`); the better choice for full HTTP tests and
  reactive endpoints.

## Test data builders

Avoid brittle, repetitive setup. Use builders/object mothers with sensible
defaults and override only what the test cares about:

```java
static Order.OrderBuilder anOrder() {
    return Order.builder().status(NEW).total(money("10")).customer(aCustomer().build());
}

@Test void shipsPaidOrders() {
    var order = anOrder().status(PAID).build();
    ...
}
```

This keeps tests readable and resilient to model changes.

## Coverage

- Treat coverage (JaCoCo) as a signal, not a target. ~70-80% line coverage with
  meaningful assertions beats 100% of trivial getters.
- Cover branches and error paths, not just the happy path.
- Don't write tests that only assert mocks were called — assert observable
  behavior/output.

## Contract tests

For service-to-service APIs, verify the contract instead of standing up the whole
dependency graph:

- **Spring Cloud Contract** — provider publishes a contract; consumer gets a
  generated stub. Both sides verified against the same source of truth.
- **Pact** — consumer-driven contracts; good across polyglot teams.
- For OpenAPI-first APIs, validate responses against the spec
  (`spring-restdocs` can also generate docs from tests).

## Do / Don't

- **Do** push logic into pure units; keep Spring out of most tests.
- **Do** use Testcontainers + real Postgres for repository/integration tests.
- **Do** test the deny/error paths, especially for security and validation.
- **Don't** boot the full context (`@SpringBootTest`) for what a slice can cover.
- **Don't** use H2 to test Postgres-specific SQL — dialect gaps hide bugs.
- **Don't** chase a coverage percentage with assertion-free tests.

## Checklist

- [ ] Logic-heavy code has plain unit tests (no Spring).
- [ ] Controllers via `@WebMvcTest`, repositories via `@DataJpaTest`.
- [ ] Integration tests use Testcontainers, not in-memory DBs.
- [ ] Full-context tests are few and justified.
- [ ] Test data builders instead of copy-pasted setup.
- [ ] Happy + error/deny paths both covered.
- [ ] Contract tests for cross-service APIs.
