# Testing Spring Boot

Pick the narrowest test that proves the behavior. Slices are fast and focused; `@SpringBootTest` is for true integration. Most code should be covered by plain unit tests and slices, with a thin layer of full integration tests.

## The test pyramid for Spring

1. **Plain unit tests** — services with mocked collaborators, no Spring context. Fastest; the bulk of tests.
2. **Slice tests** — load one layer (`@WebMvcTest`, `@DataJpaTest`, `@JsonTest`, `@RestClientTest`).
3. **Integration tests** — `@SpringBootTest` with Testcontainers for the happy path and critical failure paths.

## Plain unit tests (no Spring)

```java
class OrderServiceTest {
    OrderRepository repo = mock(OrderRepository.class);
    OrderService service = new OrderService(repo);

    @Test
    void throws_when_missing() {
        when(repo.findById(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getById(UUID.randomUUID()))
            .isInstanceOf(EntityNotFoundException.class);
    }
}
```

- **Do** prefer this whenever logic doesn't need Spring wiring — no context startup cost.
- **Don't** reach for `@SpringBootTest` to test a single service method.

## Web slice — `@WebMvcTest`

Loads MVC infrastructure and the named controller only; mock the service with `@MockBean`. See `web.md` for full examples. Add `@Import` for advice/converters the controller relies on.

## Data slice — `@DataJpaTest`

Loads JPA, repositories, and an embedded DB by default. Point it at a real DB with Testcontainers to catch dialect-specific issues.

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class OrderRepositoryTest {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @Autowired OrderRepository repo;

    @Test
    void finds_by_status() {
        repo.save(newOrder(OrderStatus.OPEN));
        assertThat(repo.findByStatus(OrderStatus.OPEN)).hasSize(1);
    }
}
```

`@DataJpaTest` is transactional and rolls back per test — good for isolation, but it hides flush/commit bugs. Use `@SpringBootTest` for flows that depend on commit behavior.

## Full integration — `@SpringBootTest`

Loads the whole context. Use `webEnvironment = RANDOM_PORT` with `TestRestTemplate`/`WebTestClient` to exercise the real HTTP stack.

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class OrderFlowIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @Autowired TestRestTemplate http;

    @Test
    void creates_and_reads_order() {
        var created = http.postForEntity("/api/v1/orders", sampleRequest(), OrderResponse.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }
}
```

- **Do** name integration tests `*IT` and run them in a separate (failsafe) phase from fast `*Test` unit tests.
- **Don't** start a full context for assertions a slice could make.

## Testcontainers

Run real Postgres/Kafka/Redis in Docker for fidelity. `@ServiceConnection` (Boot 3.1+) auto-wires the datasource — no manual `@DynamicPropertySource`.

```java
@Container @ServiceConnection
static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
```

For older Boot, wire manually:

```java
@DynamicPropertySource
static void props(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", pg::getJdbcUrl);
    r.add("spring.datasource.username", pg::getUsername);
    r.add("spring.datasource.password", pg::getPassword);
}
```

- **Do** make containers `static` so they're reused across test methods in a class (and across classes with singleton pattern) — startup is the slow part.
- **Do** pin image tags; never `:latest`.
- **Don't** mock the DB with H2 if production is Postgres — dialect drift causes false greens.

## Mocking boundaries

Mock at the **edge of your system**, not internal collaborators you could exercise for real.

- **Do** mock external HTTP/third-party clients. Use `@MockBean` for context tests, plain Mockito for unit tests. For HTTP, prefer WireMock or `MockRestServiceServer` over mocking your own client interface.
- **Do** use real DB (Testcontainers) and real repositories in integration tests.
- **Don't** mock `JpaRepository` in an integration test — that's what the test is supposed to verify.
- **Don't** mock value objects or your own DTOs; just build them.

## Test profiles & config

Keep test config separate. `src/test/resources/application-test.yml` activated with `@ActiveProfiles("test")`.

```java
@SpringBootTest
@ActiveProfiles("test")
class SomethingIT { }
```

- **Do** override only what differs (e.g. disable scheduled jobs, fast retry settings).
- **Do** keep secrets out — use Testcontainers-generated credentials, not real ones.
- **Don't** let tests depend on a developer's local DB or shared environment; they must be hermetic.

## Speed & flakiness checklist

- [ ] Context cached: identical `@SpringBootTest` config reuses one context — avoid gratuitous `@MockBean`/`@TestPropertySource` variations that fragment the cache.
- [ ] Containers static and reused.
- [ ] No `Thread.sleep`; use Awaitility for async assertions.
- [ ] Clock injected (`Clock` bean) so time-based logic is deterministic.
- [ ] Tests independent and order-agnostic; no shared mutable state.
