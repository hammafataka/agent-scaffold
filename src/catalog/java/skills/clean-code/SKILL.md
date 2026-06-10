---
name: clean-code
description: Clean code principles applied to Java.
recommended: true
---

# Clean Code for Java / Spring Boot

Practical clean-code rules for Java services. Apply these during review and when
writing new code. The goal is code that reads top-to-bottom like prose: each name
states intent, each method does one thing, and dependencies point inward. These
rules are enforced at review time by the `code-reviewer` skill and assumed by
`spring-boot-engineer` and `java-architect` — keep them consistent.

## Small functions

A method should fit on a screen and operate at a single level of abstraction.
If you need a comment to mark "sections" inside a method, those sections are
the methods you haven't extracted yet.

- Target: most methods under ~15 lines; one reason to read top-to-bottom.
- Each method does one thing. "And" in a method name is a smell (`validateAndSave`).
- Don't mix levels: a high-level orchestration method should not also do string
  parsing or null-checking inline.

````java
// Don't: one method, three abstraction levels, hard to test in isolation
public Receipt checkout(Cart cart) {
    BigDecimal total = BigDecimal.ZERO;
    for (LineItem item : cart.getItems()) {
        if (item.getQuantity() <= 0) throw new IllegalArgumentException("qty");
        total = total.add(item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())));
    }
    if (cart.getCouponCode() != null && couponRepo.existsByCode(cart.getCouponCode())) {
        total = total.multiply(BigDecimal.valueOf(0.9));
    }
    paymentGateway.charge(cart.getCustomerId(), total);
    return receiptFactory.create(cart, total);
}
````

````java
// Do: orchestration reads as a sentence; details live one level down
public Receipt checkout(Cart cart) {
    Money subtotal = cart.subtotal();
    Money total = discounts.apply(subtotal, cart.couponCode());
    paymentGateway.charge(cart.customerId(), total);
    return receiptFactory.create(cart, total);
}
````

## Intention-revealing names

Names carry the documentation. Optimize for the reader, not the typist.

- Method names are verbs; classes and fields are nouns; booleans read as predicates
  (`isExpired`, `hasPendingInvoice`).
- No abbreviations, no Hungarian-style type suffixes (`strName`, `lstUsers`).
- Avoid noise words: `Manager`, `Helper`, `Util`, `Data`, `Info`, `Processor`
  usually mean the class has no clear responsibility — name it after what it does.
- Encode units and meaning in types/names: `Duration timeout` not `long timeout`,
  `amountInCents` not `amount`.

| Don't | Do |
|-------|-----|
| `proc(List<User> l)` | `deactivateInactiveUsers(List<User> users)` |
| `boolean flag` | `boolean eligibleForRefund` |
| `UserHelper` | `UserRegistration` / `PasswordPolicy` |
| `getData()` | `findOverdueInvoices()` |

## Single Responsibility Principle (SRP)

A class should have one reason to change. In Spring, lean on the layer boundaries:
`@RestController` translates HTTP, `@Service` holds business rules, `@Repository`
talks to the database. Don't smear concerns across them.

- Don't let controllers contain business logic or build SQL.
- Don't let services know about `HttpServletRequest`, `ResponseEntity`, or status codes.
- A "god service" with 20 injected dependencies is several services. Split by
  responsibility (e.g. `InvoiceCalculator`, `InvoiceNotifier`, `InvoicePersistence`).

````java
@RestController
@RequestMapping("/api/invoices")
class InvoiceController {
    private final InvoiceService invoices;

    @PostMapping
    ResponseEntity<InvoiceResponse> create(@Valid @RequestBody CreateInvoiceRequest req) {
        Invoice invoice = invoices.create(req.toCommand());
        return ResponseEntity.status(CREATED).body(InvoiceResponse.from(invoice));
    }
}
````

The controller maps request to command, calls the service, maps result to a DTO.
That is its one job.

## Avoid primitive obsession

Passing `String`, `long`, and `BigDecimal` everywhere loses meaning and invites
mix-ups (swapping two `String` arguments compiles fine). Wrap domain concepts in
small value types — records make this nearly free.

- Replace IDs, money, emails, and ranges with types: `CustomerId`, `Money`,
  `EmailAddress`, `DateRange`.
- Put validation in the type's constructor so an invalid value can't exist.
- Use enums instead of `String` status flags or `int` codes.

````java
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        if (amount.scale() > currency.getDefaultFractionDigits())
            throw new IllegalArgumentException("too many decimal places");
    }
    public Money add(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }
}
````

````java
// Don't: what are these three strings? order matters and nothing stops a swap
transfer(String from, String to, BigDecimal amount)

// Do: impossible to pass them in the wrong order
transfer(AccountId from, AccountId to, Money amount)
````

## Function arguments

The fewer parameters, the easier a method is to call correctly and to read.

- Aim for 0–3 parameters. A longer list is usually a missing parameter object —
  collapse related arguments into a value type (`DateRange` over two `LocalDate`s,
  a `CreateOrderCommand` over eight loose fields). This is primitive obsession at
  the call site.
- No boolean flag arguments. `report(true)` tells the reader nothing and packs two
  behaviors into one method; split into named methods, or take an enum.
- No output arguments — don't mutate a passed-in collection as a side channel.
  Return the result instead.
- Return `Optional<T>` for "might be absent" and an empty collection for "none";
  never return `null`. (Don't use `Optional` for fields or parameters, though.)

````java
// Don't: a flag argument hiding two behaviors
List<User> findUsers(boolean includeInactive);

// Do: two methods that say what they return
List<User> findActiveUsers();
List<User> findAllUsers();
````

## Magic numbers and strings

A bare literal dropped into logic forces the reader to reverse-engineer its meaning.
Name it.

- Extract numeric/string literals into named constants or externalized config; the
  name does the explaining. The `0.9` and `0.15` discount rates used in the examples
  above would be a named `LOYALTY_DISCOUNT` constant (or config) in real code.
- Status and kind literals belong in enums, not `String`/`int` (see primitive obsession).
- The forgivable cases are the genuinely self-evident ones — `0`, `1`, `-1`, empty
  string — and only where the meaning is obvious from context.

````java
// Don't
if (order.ageInDays() > 30) archive(order);
total = total.multiply(BigDecimal.valueOf(0.9));

// Do
private static final int ARCHIVE_AFTER_DAYS = 30;
if (order.ageInDays() > ARCHIVE_AFTER_DAYS) archive(order);
Money total = subtotal.applyDiscount(LOYALTY_DISCOUNT);
````

## Guard clauses

Handle the exceptional and invalid cases first, then return. Flat code beats
nested code. Avoid the "arrow anti-pattern" of deep `if` nesting.

- Validate inputs at the top; fail fast with a clear exception.
- Prefer early `return`/`throw` over `else`. The happy path stays unindented.
- Use `Objects.requireNonNull`, Spring's `Assert`, or bean validation at the edge.

````java
// Don't
public Discount discountFor(Customer customer) {
    if (customer != null) {
        if (customer.isActive()) {
            if (customer.tier() == GOLD) {
                return Discount.of(0.15);
            }
        }
    }
    return Discount.none();
}
````

````java
// Do
public Discount discountFor(Customer customer) {
    Objects.requireNonNull(customer, "customer");
    if (!customer.isActive()) return Discount.none();
    if (customer.tier() != GOLD) return Discount.none();
    return Discount.of(0.15);
}
````

## Comments vs self-documenting code

Code says *how*; comments should say *why*. A comment that restates the code is
debt — it drifts out of date and lies.

- Do comment: non-obvious *why*, a workaround for an external bug (link the issue),
  a deliberate tradeoff, public API contracts via Javadoc.
- Don't comment: what a well-named method already says; commented-out code (delete
  it, git remembers); section dividers inside long methods (extract instead).
- Replace explanatory comments with an extracted, well-named method.

````java
// Don't
// check if the subscription is still valid (not expired and not cancelled)
if (sub.getEnd().isAfter(now()) && sub.getStatus() != CANCELLED) { ... }

// Do
if (sub.isActive()) { ... }

// Do (legitimate "why")
// Stripe webhooks can arrive out of order; ignore events older than the last seen.
if (event.createdAt().isBefore(lastProcessedAt)) return;
````

## Cohesion

High cohesion means a class's fields and methods belong together. If a method
doesn't use most of the class's state, it probably belongs elsewhere.

- Behavior lives with the data it operates on. Anemic entities + a fat service
  that manipulates their getters/setters is low cohesion — push logic into the entity.
- Group by feature/domain, not by technical layer alone, once the codebase grows
  (`com.acme.billing.*` over scattered `controller/`, `service/`, `repo/` packages).
- If a class splits cleanly into two groups of fields each used by a different set
  of methods, it's two classes.

````java
// Do: the rule that "an order can be cancelled only while PENDING" lives on Order
public void cancel() {
    if (status != PENDING)
        throw new IllegalStateException("cannot cancel order in status " + status);
    this.status = CANCELLED;
}
````

## Dependency direction

Dependencies point inward, toward the domain. The domain must not depend on the
web framework, the ORM, or external clients. Depend on abstractions you own, not
on concrete infrastructure.

- Domain/service code defines interfaces (ports); infrastructure implements them.
- Don't import `jakarta.servlet.*`, `org.springframework.web.*`, or JPA annotations
  into core business types when you can keep them out.
- Inject via constructors (no field `@Autowired`) so dependencies are explicit and
  the class is testable without Spring.

````java
// domain package — owns the contract, knows nothing about JDBC or Spring
public interface PaymentGateway {
    PaymentResult charge(CustomerId customer, Money amount);
}

// infrastructure package — depends on domain, not the reverse
@Component
class StripePaymentGateway implements PaymentGateway { /* ... */ }
````

````java
// Do: constructor injection, final fields, no framework leak into the signature
@Service
class CheckoutService {
    private final PaymentGateway paymentGateway;
    private final OrderRepository orders;

    CheckoutService(PaymentGateway paymentGateway, OrderRepository orders) {
        this.paymentGateway = paymentGateway;
        this.orders = orders;
    }
}
````

## Reactive (Project Reactor)

In a WebFlux/Reactor service the same principles apply to operator chains. Whether
a service is reactive at all is a `java-architect` decision, and `code-reviewer`
catches the correctness traps (blocking the event loop, lost context, missing
subscription). This skill is about keeping the chain *readable*.

- **A chain is an orchestration method.** Same rule as "small functions": one
  operation per line, one level of abstraction, reading top-to-bottom as verbs.
- **Name the steps.** Prefer method references (`.flatMap(this::reserveInventory)`)
  over fat inline lambdas. A `flatMap` whose lambda is fifteen lines is an
  un-extracted method — pull it out and give it a name.
- **Keep operators pure; place side effects deliberately.** `map`/`filter` are pure
  transformations — don't mutate external state or log inside them. Side effects go
  in `doOnNext`/`doOnSuccess`/`doOnError`, which announce themselves. This is
  command-query separation applied to streams.
- **Flatten, don't nest.** Nested `flatMap`s are the reactive arrow anti-pattern.
  Compose sequentially, and handle empty/error branches up front with
  `switchIfEmpty`/`onErrorResume` — the guard-clause idea for streams.
- **Domain types still apply.** Return `Mono<Receipt>`, not `Mono<Map<String,Object>>`.
  Reactive is not a licence for primitive obsession.
- **Keep business rules reactor-free where you can.** Express domain logic as plain,
  pure methods and *call* them from the chain. The rules stay unit-testable without
  `StepVerifier`, and the chain stays thin — dependency direction, again.

````java
// Don't: one fat flatMap, mixed levels, side effect buried in the body, deep nesting
public Mono<Receipt> checkout(CartId id) {
    return cartRepo.findById(id).flatMap(cart -> {
        Money total = cart.subtotal();
        log.info("charging {}", total);                       // side effect inside the chain body
        return gateway.charge(cart.customerId(), total)
            .flatMap(payment -> receiptRepo.save(Receipt.of(cart, total)));  // nesting
    });
}

// Do: each step named, flat, guards up front, side effects labeled
public Mono<Receipt> checkout(CartId id) {
    return cartRepo.findById(id)
        .switchIfEmpty(Mono.error(() -> new CartNotFoundException(id)))   // guard clause
        .map(Cart::total)                                                 // pure
        .flatMap(this::charge)                                            // named steps
        .flatMap(this::saveReceipt)
        .doOnSuccess(receipt -> log.info("checkout complete: {}", receipt.id())); // labeled effect
}
````

## Review checklist

- [ ] Every method does one thing at one level of abstraction.
- [ ] Names reveal intent; no `Util`/`Helper`/`Manager`/`Data` without justification.
- [ ] Controllers map HTTP only; services hold rules; no logic in repositories.
- [ ] Domain concepts are value types/enums, not bare `String`/`long`/`int`.
- [ ] Few parameters (≤3); related args collapsed into value types; no boolean flag args.
- [ ] No magic numbers/strings; literals named or externalized; status as enums.
- [ ] Methods return `Optional`/empty collections, never `null`.
- [ ] Guard clauses up front; happy path is not nested.
- [ ] Comments explain *why*; no commented-out code or restated logic.
- [ ] Behavior sits with its data; no anemic-entity + god-service pairing.
- [ ] Domain depends on abstractions; no framework imports in core types.
- [ ] Constructor injection with `final` fields; no field `@Autowired`.
- [ ] Reactive chains read as named steps at one level; operators pure, side effects in `doOn*`; no deep `flatMap` nesting.