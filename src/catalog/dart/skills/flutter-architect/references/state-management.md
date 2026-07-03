# Choosing & using state management

There is no universally correct choice. Pick by team familiarity and app shape, then use it
consistently. This compares the common options and the rules that apply to all of them.

## The options

### Riverpod
Compile-safe, testable, no `BuildContext` needed to read state. Good default for new apps.
- Prefer `Notifier`/`AsyncNotifier` over the legacy `StateNotifier`/`ChangeNotifier` providers.
- `ref.watch` in `build` to react; `ref.read` in callbacks.
- Keep providers small and composable; derive with `ref.watch(otherProvider)`.

```dart
final ordersProvider = AsyncNotifierProvider<OrdersNotifier, List<Order>>(OrdersNotifier.new);

class OrdersNotifier extends AsyncNotifier<List<Order>> {
  @override
  Future<List<Order>> build() => ref.read(orderRepoProvider).fetchOrders();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => ref.read(orderRepoProvider).fetchOrders());
  }
}
```

### Bloc / Cubit
Explicit, event-driven, great for complex flows and team consistency. More boilerplate.
- Model UI as events → states (Bloc) or methods → states (Cubit).
- Blocs are pure Dart — no Flutter imports — so they unit-test easily.
- Provide via `BlocProvider`; rebuild narrowly with `BlocSelector`/`context.select`.

### Provider
Simple, official, `ChangeNotifier`-based. Fine for small/medium apps.
- Expose notifiers via `Provider`/`MultiProvider`; consume with `context.watch`/`context.read`.
- Watch out for over-broad `notifyListeners()` causing wide rebuilds.

### GetX
All-in-one (state + routing + DI). Concise but opinionated and harder to test in isolation.
- Controllers extend `GetxController`; reactive rebuilds via `Obx`.

### signals
Fine-grained reactivity with minimal boilerplate; newer ecosystem.
- `signal`/`computed`; read inside `Watch`/`watch` to subscribe.

## Rules that apply to all

- **Ephemeral vs. app state.** Local UI state (text fields, toggles, animation) stays in a
  `StatefulWidget`. Only shared/business state goes into the solution.
- **Immutable state.** Replace state objects (`copyWith`/`freezed`), don't mutate in place.
- **No logic in widgets.** Business rules live in the bloc/notifier/controller.
- **Narrow rebuilds.** Select the slice you need; don't rebuild a screen because one field changed.
- **One approach per app.** Mixing paradigms makes the codebase unteachable.

## Choosing quickly

- New app, want safety + testability → **Riverpod**.
- Complex flows, larger team, want explicitness → **Bloc/Cubit**.
- Small app, minimal deps → **Provider**.
- Already invested in one → keep it; consistency beats theoretical fit.
