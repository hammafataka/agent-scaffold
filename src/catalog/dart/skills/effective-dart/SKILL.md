---
name: effective-dart
description: Idiomatic, null-safe Dart — naming, types, and style that reads clean and analyzes clean.
recommended: true
---

# Effective Dart

Idiomatic Dart that reads cleanly and passes the analyzer. Apply when writing or reviewing
Dart code. These follow the official Effective Dart guidelines.

## Null safety

- Avoid `!` (bang). Use it only where the value is *provably* non-null; otherwise handle the
  null with `?.`, `??`, `if (x != null)`, or pattern matching. A bang is a runtime crash waiting
  to happen.
- Use `late` deliberately — only when you guarantee assignment before first read (e.g. in
  `initState`). A `late` read before assignment throws.
- Prefer nullable types with explicit handling over `late` when initialization is uncertain.

```dart
// Don't
final name = user.profile!.displayName!;        // two crash points
// Do
final name = user.profile?.displayName ?? 'Guest';
```

## Naming

- `lowerCamelCase` for members, variables, parameters, and constants.
- `UpperCamelCase` for types, enums, extensions, typedefs.
- `snake_case` for file and directory names.
- Booleans read as predicates: `isLoading`, `hasError`, `canSubmit`.
- No Hungarian prefixes, no abbreviations (`btnSbmt` → `submitButton`).

## Types

- Annotate public APIs; let local inference do the rest. Don't write `var x = <int>[]` noise,
  but don't leave a public method returning inferred `dynamic` either.
- Avoid `dynamic` when you know the type. `dynamic` disables the analyzer.
- Use `final` by default; `const` for compile-time constants. Immutability is the default posture.
- Prefer enhanced enums and sealed classes over `String`/`int` status flags — they make
  `switch` exhaustive and catch missing cases at compile time.

```dart
sealed class PaymentResult {}
class PaymentOk extends PaymentResult { PaymentOk(this.id); final String id; }
class PaymentDeclined extends PaymentResult { PaymentDeclined(this.reason); final String reason; }

String describe(PaymentResult r) => switch (r) {   // compiler enforces all cases
  PaymentOk(:final id) => 'ok $id',
  PaymentDeclined(:final reason) => 'declined: $reason',
};
```

## Collections & functional style

- Use collection literals and spreads (`[...a, ...b]`), collection-if/for.
- Prefer `map`/`where`/`fold` over manual loops when it reads clearer; don't force it.
- Return empty collections, never null, for "none".

## Async

- `async`/`await` over raw `.then()` chains.
- Don't fire-and-forget a `Future` whose error matters — `await` it or handle the error.
- `Future.wait` for independent concurrent work; don't `await` in a loop when calls are independent.

## Style

- Format with `dart format .` — don't hand-fight it.
- `///` doc comments on public APIs; comments explain *why*, not *what*.
- No `print` in production — use a logger.
- Fix lints rather than suppressing; if you must `// ignore:`, justify it inline.

## Checklist

- [ ] No gratuitous `!`; nulls handled explicitly.
- [ ] Names follow Effective Dart casing; booleans are predicates.
- [ ] `final`/`const` by default; no needless `dynamic`.
- [ ] Status modeled as enums/sealed classes, not strings.
- [ ] Returns empty collections, not null.
- [ ] `dart format` applied; `dart analyze` clean; no `print`.
