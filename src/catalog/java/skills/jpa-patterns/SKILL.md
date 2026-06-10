---
name: jpa-patterns
description: JPA/Hibernate patterns and pitfalls (fetching, transactions, mapping).
recommended: true
---

# JPA / Hibernate Patterns

Practical patterns for entity mapping, fetching, transactions, and read models in Spring Boot + Hibernate. The default Hibernate behaviors are tuned for correctness, not for your access patterns — most production incidents trace back to lazy loading, transaction scope, and unbounded queries.

## Entity Mapping

Keep entities lean. Map only what the persistence layer owns; do not bolt on presentation concerns.

```java
@Entity
@Table(name = "orders", indexes = @Index(name = "ix_orders_customer", columnList = "customer_id"))
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private long version;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    private OrderStatus status;
}
```

Do / don't:
- DO use `GenerationType.IDENTITY` or `SEQUENCE` (prefer `SEQUENCE` with a pooled allocator for batch inserts). Avoid `AUTO` — it picks a strategy you didn't choose.
- DO store enums as `EnumType.STRING`. `ORDINAL` breaks the day someone reorders the enum.
- DO implement `equals`/`hashCode` on a stable business key, or omit them entirely. Never base them on a DB-generated `id` that is null before persist.
- DO keep both sides of a bidirectional association in sync via helper methods (`order.addLine(line)`).
- DON'T use `@Data` (Lombok) on entities — the generated `toString`/`hashCode` walk lazy associations and trigger loads or `LazyInitializationException`.
- DON'T put `cascade = CascadeType.ALL` on `@ManyToOne`. Cascades belong on the owning aggregate root toward its children.

## Fetch Types

Set `fetch = FetchType.LAZY` on every association. `@ManyToOne` and `@OneToOne` default to EAGER — override them.

- DON'T fix `LazyInitializationException` by switching to EAGER. EAGER applies to *every* query for that entity, including queries that don't need the association, and silently reintroduces N+1.
- DO fetch eagerly *per query* using fetch joins or entity graphs (below).
- DON'T rely on `spring.jpa.open-in-view` (default `true`). It hides lazy-loading bugs behind a request-scoped session and pushes DB I/O into view rendering. Set `open-in-view: false` and fetch what you need inside the service layer.

## Avoiding N+1

The classic trap: load N parents, then touch a lazy collection in a loop → 1 + N queries.

Fetch join (JPQL) — best when you need entities back:

```java
@Query("select distinct o from Order o join fetch o.lines where o.status = :status")
List<Order> findWithLines(@Param("status") OrderStatus status);
```

`@EntityGraph` — declarative, composes with derived queries and `Pageable`:

```java
@EntityGraph(attributePaths = {"lines", "customer"})
List<Order> findByStatus(OrderStatus status);
```

Rules:
- DON'T `join fetch` more than one collection in a single query — it produces a cartesian product. Fetch one collection per query, or split into multiple round trips.
- DON'T combine `join fetch` of a collection with `Pageable`. Hibernate pages in memory (`HHH000104` warning) and loads the whole result set. Use `@EntityGraph` on a paginated query, then a second query for the collection by id; or use `@BatchSize` / `hibernate.default_batch_fetch_size` to collapse N+1 into a handful of `IN` queries.
- DO set `spring.jpa.properties.hibernate.default_batch_fetch_size: 100` as a global safety net for lazy collections and proxies.
- DO verify with `spring.jpa.show-sql` or `datasource-proxy` / `p6spy` in tests — count queries, don't assume.

## @Transactional Boundaries

The transaction is the unit of consistency and the lifetime of the persistence context. Put it at the service layer, not the repository or controller.

```java
@Service
public class OrderService {

    @Transactional(readOnly = true)
    public OrderView get(long id) { ... }

    @Transactional
    public Order place(PlaceOrderCommand cmd) { ... }
}
```

Do / don't:
- DO mark read paths `@Transactional(readOnly = true)` — Hibernate skips dirty checking and flushing, and the driver may route to a replica.
- DO keep transactions short. Never do remote/HTTP calls or long computation inside one; you hold a DB connection and locks the entire time.
- DON'T call a `@Transactional` method from within the same class — Spring's proxy is bypassed and the annotation does nothing. Move it to another bean or inject self.
- DON'T swallow exceptions and expect rollback. Rollback fires on unchecked exceptions only by default; for checked exceptions use `@Transactional(rollbackFor = ...)`.
- BE CAREFUL with `@Transactional` propagation. After any persistence exception the transaction is marked rollback-only; continuing to use the `EntityManager` throws.

## DTO Projections

Don't return entities from read endpoints. Project to a DTO so you fetch exactly the columns you need and detach from the persistence context.

Constructor expression:

```java
public record OrderSummary(Long id, String customerName, BigDecimal total) {}

@Query("""
    select new com.acme.order.OrderSummary(o.id, c.name, sum(l.amount))
    from Order o join o.customer c join o.lines l
    where o.status = :status group by o.id, c.name
    """)
List<OrderSummary> summaries(@Param("status") OrderStatus status);
```

Or an interface projection (Spring derives the select list):

```java
interface OrderSummary {
    Long getId();
    String getCustomerName();
    BigDecimal getTotal();
}
List<OrderSummary> findByStatus(OrderStatus status);
```

- DO project for lists, reports, and API responses. It sidesteps lazy loading, N+1, and over-fetching in one move.
- DON'T map entities to DTOs in a loop that lazily loads associations — that's N+1 wearing a DTO costume. Project in the query.

## Optimistic Locking

Use `@Version` for last-writer-wins prevention under concurrency. Hibernate adds `where version = ?` to updates and throws `OptimisticLockException` on conflict.

```java
try {
    orderService.update(cmd);
} catch (ObjectOptimisticLockingFailureException e) {
    // reload, re-apply, or surface a 409 to the client
}
```

- DO prefer optimistic locking for typical web workloads — no held DB locks, scales well.
- DO reserve pessimistic locking (`@Lock(LockModeType.PESSIMISTIC_WRITE)`) for short, hot critical sections (e.g. inventory decrement) and always pair it with a query timeout.
- DON'T forget the `@Version` column has to exist and be selected — partial updates that bypass the entity (bulk `@Modifying` JPQL) skip version checks.

## Pagination

Never return unbounded result sets.

```java
Page<Order> page = repo.findByStatus(status, PageRequest.of(0, 50, Sort.by("createdAt").descending()));
```

- DO always sort deterministically (include a unique tiebreaker like `id`) — offset pagination over an unstable sort skips and duplicates rows.
- DO consider keyset (seek) pagination for deep pages: `where (created_at, id) < (:lastTs, :lastId) order by ... limit n`. Offset gets linearly slower as the page number grows.
- DON'T use offset pagination together with a collection `join fetch` (see N+1 above).
- BE AWARE `Page` issues a second `count(*)` query; use `Slice` when you only need "is there a next page".

## Flush & Clear (batch writes)

The persistence context accumulates managed entities and flushes at commit. For large writes this means a huge dirty-checking pass and memory growth.

```java
for (int i = 0; i < records.size(); i++) {
    em.persist(toEntity(records.get(i)));
    if (i % batchSize == 0) {
        em.flush();
        em.clear(); // detach flushed entities, free memory
    }
}
```

Enable real JDBC batching:

```yaml
spring.jpa.properties.hibernate:
  jdbc.batch_size: 50
  order_inserts: true
  order_updates: true
```

- DO `flush()` then `clear()` in chunks for bulk inserts/updates.
- DON'T use `GenerationType.IDENTITY` for batch inserts — it forces a round trip per row and disables JDBC batching. Use `SEQUENCE` with a pooled allocator.
- BE AWARE manual `flush()` runs SQL but does **not** commit; the transaction still controls visibility and rollback.

## Quick Checklist

- [ ] All associations `LAZY`; `open-in-view: false`.
- [ ] List/read endpoints return DTO projections, not entities.
- [ ] N+1 hotspots covered by fetch join or `@EntityGraph`; `default_batch_fetch_size` set.
- [ ] `@Transactional` on the service layer; reads marked `readOnly = true`.
- [ ] `@Version` on concurrently updated aggregates.
- [ ] Every repository "find all"-style method takes a `Pageable`.
- [ ] Bulk writes use `flush()`/`clear()` + `SEQUENCE` + JDBC batching.
- [ ] Query counts asserted in tests, not assumed.
