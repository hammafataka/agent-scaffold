# JPA / Hibernate Performance

Most JPA performance problems are query-count problems, not query-speed problems.
Start by counting queries, then fix fetching, then consider caching.

## Step 1: See the queries

Enable SQL logging and statistics in non-prod profiles:

```properties
spring.jpa.properties.hibernate.generate_statistics=true
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.orm.jdbc.bind=TRACE   # bound params (Hibernate 6)
```

For automated detection, add **datasource-proxy** or the
`com.vladmihalcea:hypersistence-utils` library and fail tests when a request
exceeds an expected query count. In tests you can assert with
`Statistics.getQueryExecutionCount()`.

## N+1: the default failure mode

A `findAll()` that loads 100 `Order`s and then touches `order.getCustomer()`
fires 1 + 100 queries. Lazy associations are correct by default — the bug is
accessing them in a loop.

### Fix A: fetch join (JPQL)

```java
@Query("select o from Order o join fetch o.customer where o.status = :s")
List<Order> findWithCustomer(@Param("s") Status s);
```

- Use for **to-one** and a **single** to-many.
- Do NOT fetch-join two collections in one query (Cartesian product). Split into
  multiple queries or use `@BatchSize`.
- Fetch-join + pagination on a collection forces in-memory paging (Hibernate
  warns `HHH000104`). Use `@EntityGraph` on a to-one, or batch fetching instead.

### Fix B: @EntityGraph (declarative, composable with derived queries)

```java
@EntityGraph(attributePaths = {"customer", "lineItems"})
List<Order> findByStatus(Status status);
```

`@EntityGraph` keeps Spring Data's derived query naming and pagination while
eager-loading named paths. Prefer it over hand-written fetch joins for simple
cases.

### Fix C: batch fetching (best for collections + paging)

```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=50
```

Or per-association `@BatchSize(size = 50)`. Hibernate then loads lazy
associations in `IN (...)` batches: 100 orders → ~2-3 queries instead of 101,
and pagination still works correctly.

## Projections: don't load what you won't use

Reading whole entities to render a list is wasteful and risks lazy access.
Project straight into a DTO/record.

```java
public record OrderSummary(Long id, String customerName, BigDecimal total) {}

@Query("""
    select new com.acme.orders.OrderSummary(o.id, c.name, o.total)
    from Order o join o.customer c where o.status = :s
    """)
List<OrderSummary> summaries(@Param("s") Status s);
```

- Interface-based projections work too and can use `@Value` SpEL, but
  constructor/record (DTO) projections are clearer and avoid proxies.
- Projections are read-only and not managed — exactly what list/report endpoints
  want.

## Read-only transactions

Mark query paths read-only so Hibernate skips dirty-checking and flushes:

```java
@Transactional(readOnly = true)
public List<OrderSummary> list(Status s) { ... }
```

This also lets the driver/route reads to replicas in some setups. Make
`readOnly = true` the default for all query services.

## Pagination

- Use `Pageable` + `Slice`/`Page`. `Page` runs an extra `count(*)`; if you don't
  need a total, return `Slice` to skip it.
- For deep paging, avoid `OFFSET` on large tables — use **keyset (seek)
  pagination** (`where id > :lastId order by id limit :n`).
- Never paginate over a fetch-joined collection (see Fix A).

## Second-level cache

Only after you've fixed fetching. Good for small, read-mostly reference data
(country lists, config), not hot transactional tables.

```java
@Entity
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
class Country { ... }
```

```properties
spring.jpa.properties.hibernate.cache.use_second_level_cache=true
spring.jpa.properties.hibernate.cache.region.factory_class=jcache
```

Pair with the query cache (`hibernate.cache.use_query_cache=true`) only for
stable queries. Watch invalidation carefully; a stale cache is worse than a slow
query.

## Writes

- Enable JDBC batching for bulk inserts/updates:
  `spring.jpa.properties.hibernate.jdbc.batch_size=50`,
  `order_inserts=true`, `order_updates=true`.
- For sequence IDs, prefer `SEQUENCE` with a pooled allocation over `IDENTITY`
  (`IDENTITY` disables JDBC batching).
- For large bulk operations, a single JPQL `update`/`delete` or native SQL beats
  loading-then-saving entities.

## Checklist

- [ ] SQL + statistics logging on in dev/test.
- [ ] No association access inside a loop without fetch join / `@EntityGraph` /
      batch fetch.
- [ ] List/report endpoints use DTO projections, not entities.
- [ ] Query services are `@Transactional(readOnly = true)`.
- [ ] `default_batch_fetch_size` set globally.
- [ ] Pagination uses `Slice` or keyset where totals aren't needed.
- [ ] Second-level cache only on read-mostly reference data.

## Do / Don't

- **Do** keep associations `LAZY` and fetch explicitly per use case.
- **Do** assert query counts in integration tests to catch N+1 regressions.
- **Don't** set `fetch = EAGER` to "fix" N+1 — it just moves the problem and
  ruins unrelated queries.
- **Don't** add a cache before you've fixed query counts.
- **Don't** use `OpenEntityManagerInView` (it's on by default in Boot — turn it
  off: `spring.jpa.open-in-view=false`) to mask lazy access in the view layer.
