---
name: flutter-testing
description: How to test Flutter/Dart code — unit, widget, golden, and integration tests.
recommended: true
---

# Flutter Testing

Pick the narrowest test that proves the behavior. Keep tests fast and deterministic. This is
the working guide; the `test-automator` agent applies it when writing suites.

## The four levels

| Level | Tool | Speed | Use for |
|-------|------|-------|---------|
| Unit | `package:test` | fast | logic, models, view-models/blocs |
| Widget | `testWidgets` + `WidgetTester` | fast | a widget/screen in isolation |
| Golden | `matchesGoldenFile` | fast | pixel-stable, design-critical UI |
| Integration | `integration_test/` | slow | full flows on a device/emulator |

Most tests are unit and widget tests. Integration tests are few and high-value.

## Unit tests

```dart
test('cart total sums line items with discount', () {
  final cart = Cart([LineItem(price: 1000, qty: 2)], coupon: tenPercentOff);
  expect(cart.total, 1800);
});
```

Mock collaborators at the boundary. `mocktail` needs no codegen:

```dart
class MockOrderRepository extends Mock implements OrderRepository {}

test('emits failure when repo throws', () async {
  final repo = MockOrderRepository();
  when(() => repo.fetchOrders()).thenThrow(NetworkException());
  final cubit = OrderCubit(repo);
  await cubit.load();
  expect(cubit.state, isA<OrderError>());
});
```

## Widget tests

```dart
testWidgets('tapping retry reloads', (tester) async {
  await tester.pumpWidget(wrap(const OrderScreen()));   // wrap() injects theme/providers/router
  await tester.pumpAndSettle();

  expect(find.text('Could not load orders'), findsOneWidget);
  await tester.tap(find.text('Retry'));
  await tester.pump();

  expect(find.byType(CircularProgressIndicator), findsOneWidget);
});
```

- `pump` advances one frame; `pumpAndSettle` runs until no frames are scheduled — it **hangs on
  infinite animations**, so use `pump(duration)` there.
- Find by semantics/text/key, not by widget internals.
- Build a shared `wrap()` helper that provides the theme, providers, and router a screen needs.

## Golden tests

```dart
await expectLater(find.byType(OrderTile), matchesGoldenFile('goldens/order_tile.png'));
```

Regenerate intentionally with `flutter test --update-goldens` and review the image diff in the
PR. Keep goldens for design-critical, stable UI — not for everything.

## Integration tests

Live under `integration_test/`, driven by `flutter test integration_test/...`. Cover a few
real flows (login, checkout). Keep them deterministic — stub the network, inject clocks.

## Rules

- Deterministic: inject clocks/seeds; never `Future.delayed`/`sleep` to "wait".
- Mock at boundaries (repositories/clients), not the unit under test.
- Cover error and empty branches, not just the happy path.
- `dart test` / `flutter test` green and `dart analyze` clean is the bar for "done".
