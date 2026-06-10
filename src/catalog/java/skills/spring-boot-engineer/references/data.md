# Data Layer

Persistence with Spring Data JPA / Hibernate. The data layer owns entities, repositories, and transactions. It must not depend on web or DTO types.

## Entities

Map carefully — the defaults bite. Always set fetch type explicitly and avoid eager collections.

```java
@Entity
@Table(name = "orders")
class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String customerId;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true,
               fetch = FetchType.LAZY)
    private List<OrderLine> lines = new ArrayList<>();

    @Version
    private long version; // optimistic locking
}
```

- **Do** use `EnumType.STRING`, never `ORDINAL` (reordering corrupts data).
- **Do** add `@Version` for optimistic locking on concurrently-edited rows.
- **Don't** use `FetchType.EAGER` on collections — it causes N+1 and cartesian blowups.
- **Don't** put business logic in entities beyond simple invariants.

## Repositories

Extend `JpaRepository`. Derived query methods for simple cases, `@Query` (JPQL) for anything non-trivial.

```java
interface OrderRepository extends JpaRepository<Order, UUID> {

    List<Order> findByCustomerIdAndStatus(String customerId, OrderStatus status);

    @Query("select o from Order o where o.createdAt < :cutoff and o.status = :status")
    List<Order> findStale(@Param("cutoff") Instant cutoff, @Param("status") OrderStatus status);

    @Modifying
    @Query("update Order o set o.status = :status where o.id = :id")
    int updateStatus(@Param("id") UUID id, @Param("status") OrderStatus status);
}
```

- **Do** use `@EntityGraph` or `join fetch` to solve N+1 deliberately.
- **Don't** write `findByX` methods that return huge unbounded lists — page or stream them.
- Use native SQL (`nativeQuery = true`) only when JPQL can't express it (e.g. DB-specific functions).

### Solving N+1

```java
@EntityGraph(attributePaths = "lines")
List<Order> findByStatus(OrderStatus status);
```

## Transactions

`@Transactional` belongs on service methods, not repositories or controllers. Default propagation `REQUIRED` is right most of the time.

```java
@Service
class OrderService {

    @Transactional(readOnly = true)
    public Order getById(UUID id) {
        return repo.findById(id).orElseThrow(() -> new EntityNotFoundException("order " + id));
    }

    @Transactional
    public Order create(CreateOrderCommand cmd) { ... }
}
```

- **Do** mark read-only methods `@Transactional(readOnly = true)` — enables driver/Hibernate optimizations.
- **Do** remember rollback is only automatic on unchecked exceptions; use `rollbackFor` for checked ones.
- **Don't** call a `@Transactional` method from within the same bean — the proxy is bypassed and the annotation is ignored. Split into another bean or use self-injection.
- **Don't** do remote calls or long sleeps inside a transaction; you hold a DB connection the whole time.

## Migrations

Schema is owned by versioned migrations (Flyway or Liquibase), never by Hibernate `ddl-auto` outside local dev.

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate   # validate in all real envs; never update/create
  flyway:
    enabled: true
    locations: classpath:db/migration
```

Flyway files: `src/main/resources/db/migration/V3__add_order_status_index.sql`.

- **Do** make migrations forward-only and idempotent where possible; never edit a migration that has shipped.
- **Do** keep `ddl-auto: validate` so app startup fails loudly if entities drift from schema.
- **Don't** mix DDL and large data backfills in one migration that locks tables in prod — batch backfills separately.

## Projections

Fetch only what you need. Interface or DTO projections avoid loading full entities.

```java
interface OrderSummary {
    UUID getId();
    String getStatus();
}

interface OrderRepository extends JpaRepository<Order, UUID> {
    List<OrderSummary> findByCustomerId(String customerId);

    // DTO/constructor projection
    @Query("select new com.acme.OrderSummaryDto(o.id, o.status) from Order o")
    List<OrderSummaryDto> summaries();
}
```

## Auditing

Enable JPA auditing to populate created/modified fields automatically.

```java
@Configuration
@EnableJpaAuditing
class JpaConfig {}

@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
abstract class Auditable {
    @CreatedDate    private Instant createdAt;
    @LastModifiedDate private Instant updatedAt;
    @CreatedBy      private String createdBy;
}
```

Provide an `AuditorAware<String>` bean to source `@CreatedBy` from the security context.

## Multi-datasource

Two datasources require explicit, non-autoconfigured wiring. Mark one `@Primary`, scope each `EntityManagerFactory` and `TransactionManager` to its own package of repositories.

```java
@Configuration
@EnableJpaRepositories(
    basePackages = "com.acme.billing.repo",
    entityManagerFactoryRef = "billingEmf",
    transactionManagerRef = "billingTx")
class BillingDataSourceConfig {

    @Bean @ConfigurationProperties("app.datasource.billing")
    DataSource billingDataSource() { return DataSourceBuilder.create().build(); }
    // billingEmf + billingTx beans, each bound to billingDataSource
}
```

- **Do** keep each datasource's repositories/entities in separate packages — the routing is by package.
- **Do** give each its own migration location/history table.
- **Don't** expect a single `@Transactional` to span both datasources; that needs XA/JTA, which is a different commitment.
