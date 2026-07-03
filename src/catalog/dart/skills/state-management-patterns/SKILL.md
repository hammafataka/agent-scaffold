---
name: state-management-patterns
description: Practical state-management patterns for Flutter, agnostic to the chosen library.
recommended: true
---

# State Management Patterns

Library-agnostic rules for managing state in Flutter. Apply whatever the project uses
(Riverpod, Bloc, Provider, GetX, signals). The goal: predictable rebuilds, testable logic,
and no state mutation in the wrong place.

## Ephemeral vs. app state

- **Ephemeral (local) state** — a checkbox toggle, a text field, an animation, the current
  tab. Lives in a `StatefulWidget`. Don't push it into a global store.
- **App (shared) state** — auth, cart, fetched data, settings. Lives in the state-management
  solution so multiple widgets can read and react.

If only one widget and its subtree care, keep it local.

## Immutable state, replace don't mutate

State objects are immutable. Produce a new value with `copyWith` (or `freezed`) and emit it.
Mutating a held object in place defeats change detection and causes missed or stale rebuilds.

```dart
// Don't: mutate in place
state.items.add(order);            // listeners may not see it
// Do: replace
emit(state.copyWith(items: [...state.items, order]));
```

## Model async as data, not flags

Represent async results as a single state, not a tangle of `isLoading`/`error`/`data` booleans
that can contradict each other.

```dart
sealed class Result<T> {}
class Loading<T> extends Result<T> {}
class Data<T> extends Result<T> { Data(this.value); final T value; }
class Failure<T> extends Result<T> { Failure(this.message); final String message; }
```

The UI then renders one of three exhaustive cases (`switch`), and the impossible "loading and
error at once" state can't exist. Riverpod's `AsyncValue` and Bloc states do this for you — use them.

## Keep logic out of widgets

Business rules, validation, and orchestration live in the view-model/bloc/notifier. The widget
watches state and calls intent methods. A widget that fetches, transforms, and decides is doing
three jobs that can't be unit-tested without a widget tree.

## Narrow your rebuilds

Subscribe to the smallest slice that drives the widget.

- Riverpod: `ref.watch(provider.select((s) => s.field))`.
- Bloc: `BlocSelector` / `context.select`.
- Provider: `context.select`.

Watching the whole object rebuilds on every unrelated change — the most common cause of jank.

## Dispose & cancel

Anything you subscribe to or create — `StreamSubscription`, controllers, timers — is cancelled
in `dispose`/`close`. Leaks here cause "setState after dispose" and growing memory.

## Checklist

- [ ] Ephemeral state local; only shared state in the store.
- [ ] State immutable; updates via `copyWith`/`freezed`.
- [ ] Async modeled as one exhaustive state, not loose booleans.
- [ ] Logic in the view-model/bloc, not the widget.
- [ ] Rebuilds scoped with selectors.
- [ ] Subscriptions/controllers disposed.
