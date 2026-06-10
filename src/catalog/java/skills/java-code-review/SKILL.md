---
name: java-code-review
description: A focused checklist for reviewing Java code quality.
recommended: true
---

# Java Code Review

A practical checklist for reviewing Java / Spring Boot code. Work top-down through each section. Flag issues with a concrete reason and a suggested fix, not a style opinion. Prefer fewer high-signal comments over nitpicks.

## How to use this

- Read the diff first, then open the surrounding classes — review in context, not line-by-line.
- For each finding, state the **risk** (correctness, leak, race, NPE) before the **fix**.
- Distinguish blocking issues (bugs, leaks, broken invariants) from suggestions (naming, style).

---

## 1. Naming

Names are the API. They should reveal intent without forcing the reader into the body.

- Classes are nouns (`OrderValidator`), methods are verbs (`validate`, `findByEmail`).
- No type noise: `userList`, `dataMap`, `strName`. Use `users`, `usersById`.
- Booleans read as predicates: `isActive`, `hasPermission`, `canRetry`.
- Spring beans: `@Service`/`@Component` names match their role; avoid `*Manager`/`*Helper`/`*Util` dumping grounds.
- Constants are `UPPER_SNAKE_CASE`; magic numbers/strings get a named constant.

Do: `Duration retryBackoff = Duration.ofSeconds(2);`
Don't: `Thread.sleep(2000); // 2s backoff`

---

## 2. Immutability

Default to immutable. Mutability is the source of most aliasing and concurrency bugs.

- Use `record` for DTOs, value objects, and config holders.
- Fields `final` unless there's a reason not to. Constructor injection over `@Autowired` fields (enables `final` and testability).
- Don't expose internal mutable collections — copy in and out, or return `List.copyOf(...)`.

```java
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
    }
}
```

- Watch for "immutable" classes that leak: `Collections.unmodifiableList(internal)` still reflects later mutations to `internal`.

Do: constructor injection with `final` fields.
Don't: `@Autowired` on a non-final field that tests can't set.

---

## 3. Optional usage

`Optional` is a return type for "maybe absent," not a field, parameter, or collection element.

- Return `Optional<T>` from lookups that can miss (`findByX`). Never return `null` from such methods.
- Don't use `Optional` for fields or method parameters — overload or accept the value.
- Don't wrap collections: return an empty `List`, not `Optional<List>`.
- Avoid `.get()` without a prior `isPresent()`; prefer `orElse`, `orElseThrow`, `map`, `ifPresent`.

```java
return repo.findByEmail(email)
    .orElseThrow(() -> new UserNotFoundException(email));
```

Do: `opt.map(User::name).orElse("anonymous")`
Don't: `if (opt.isPresent()) return opt.get();`

---

## 4. Exceptions

- Throw specific exceptions, not `RuntimeException`/`Exception`. Carry context (the bad id/value) in the message.
- Never swallow: an empty `catch {}` or `catch (Exception e) { log.error(e); }` that continues is a red flag.
- Don't catch what you can't handle. Let it propagate to a boundary.
- Preserve cause: `throw new OrderException("...", e)` — never drop the original stack trace.
- Don't use exceptions for control flow.
- Spring: map exceptions at the edge with `@ExceptionHandler` / `@ControllerAdvice`; don't leak stack traces or persistence exceptions to API clients.

```java
@ExceptionHandler(UserNotFoundException.class)
ResponseEntity<ApiError> handle(UserNotFoundException e) {
    return ResponseEntity.status(NOT_FOUND).body(ApiError.of(e.getMessage()));
}
```

Don't: catch `InterruptedException` and ignore it — re-interrupt with `Thread.currentThread().interrupt();`.

---

## 5. equals / hashCode

- If a class overrides one of `equals`/`hashCode`, it must override both, consistently.
- Use the same fields in both; base equality on identity/business keys, not derived state.
- `records` give you correct `equals`/`hashCode` for free — prefer them for value types.
- JPA `@Entity`: do **not** include mutable or generated fields naively. A common safe pattern is a stable business key or a fixed `hashCode` plus id-based `equals`; never use `Lombok @Data`/`@EqualsAndHashCode` over all fields on an entity (breaks lazy loading and Set membership before/after persist).

```java
@Override public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Customer c)) return false;
    return id != null && id.equals(c.id);
}
@Override public int hashCode() { return getClass().hashCode(); }
```

---

## 6. Streams vs loops

Streams for transformation pipelines; loops when there are side effects, early exit, or complex control flow.

- Don't force imperative logic into streams (`forEach` with mutation, nested `flatMap` no one can read).
- No side effects inside `map`/`filter`. `forEach` is for terminal side effects only.
- Prefer `toList()` (Java 16+) over `collect(Collectors.toList())`.
- Watch for hidden N+1 / O(n²): `.filter(x -> list.contains(x))` over a `List` is quadratic — use a `Set`.
- Don't `.parallelStream()` casually — it uses the common pool and rarely helps for small or IO-bound work.

Do: `users.stream().filter(User::isActive).map(User::email).toList();`
Don't: a stream that mutates an external `List` inside `forEach` — use a loop or `collect`.

---

## 7. Concurrency

- Shared mutable state needs a strategy: confinement, immutability, or synchronization. Name it.
- Prefer `java.util.concurrent` (`ConcurrentHashMap`, `AtomicLong`, `ExecutorService`) over `synchronized` blocks and `volatile` hacks.
- `volatile` gives visibility, not atomicity — `count++` on a volatile is still a race.
- Spring singletons (`@Service`, `@Component`) are shared across threads: **no mutable instance state** unless it's thread-safe.
- Don't block in reactive/async code; don't `.join()`/`.get()` on the request thread without a timeout.
- Always shut down executors you create; prefer try-with-resources on `ExecutorService` (Java 19+) or a managed bean.

Do: `private final Map<Key, Val> cache = new ConcurrentHashMap<>();`
Don't: a mutable `private int counter;` field on a singleton `@Service`.

---

## 8. Resource handling

- Every `Closeable`/`AutoCloseable` (streams, `Connection`, `JdbcTemplate` raw resources, HTTP clients, files) goes in try-with-resources.
- Don't rely on finalizers or manual `finally { close(); }` when try-with-resources fits.
- Streams from `Files.lines`, `Files.walk`, `DirectoryStream` are closeable — close them.
- Connection pools: don't hold connections across slow calls; keep transactions short.

```java
try (var lines = Files.lines(path)) {
    return lines.filter(s -> !s.isBlank()).toList();
}
```

Don't: open an `InputStream` and return it from a `@Transactional` method that closes the session.

---

## 9. Null-safety

- Validate inputs at boundaries: `Objects.requireNonNull(arg, "arg")` in constructors and public methods.
- Return empty collections, never `null` collections.
- Prefer `Optional` for absent return values over `null` (see §3).
- Use `Map.getOrDefault` / `computeIfAbsent` instead of null checks on map reads.
- Annotate intent with `@Nullable`/`@NonNull` (JSpecify or `org.springframework.lang.*`) so tooling can catch violations.
- Compare constants safely: `"ADMIN".equals(role)` or `Objects.equals(a, b)`.

Do: `return results == null ? List.of() : results;`
Don't: chain `a.getB().getC().getD()` without knowing each link is non-null.

---

## 10. Test coverage

Coverage of behavior, not lines. A green suite that asserts nothing is worse than none.

- Each branch / error path has a test, including the exception cases reviewed in §4.
- Tests assert outcomes, not implementation: avoid over-mocking that just restates the code.
- Use JUnit 5 + AssertJ; `assertThatThrownBy` for exceptions, not `try/fail`.
- Spring: prefer slice tests (`@WebMvcTest`, `@DataJpaTest`) over full `@SpringBootContext` where possible — faster, more focused.
- Use Testcontainers for real DB behavior instead of H2 when the SQL is non-trivial.
- No logic in tests (no `if`/loops deciding assertions); no time/order/network flakiness.

```java
assertThatThrownBy(() -> service.charge(badCard))
    .isInstanceOf(PaymentException.class)
    .hasMessageContaining("declined");
```

Do: one clear arrange-act-assert per test, named for the behavior.
Don't: `verify(mock).save(any())` as the only assertion on a method that computes a value.

---

## Review wrap-up checklist

- [ ] No swallowed exceptions or lost stack traces
- [ ] No mutable state on Spring singletons
- [ ] All `Closeable` resources in try-with-resources
- [ ] Lookups return `Optional`/empty collections, never `null`
- [ ] `equals`/`hashCode` paired and entity-safe
- [ ] DTOs/value objects are `record`s or otherwise immutable
- [ ] New branches and error paths are tested with real assertions
