# Layered architecture — rules and a worked feature

The recommended Flutter architecture separates an app into three layers with a strict
inward dependency direction.

## The layers

### UI layer

Widgets and their view-models/controllers. Responsible for rendering state and turning user
input into calls on the logic layer. No business rules, no network/db access.

- Widgets are as dumb as possible — given state, they render it.
- A view-model/bloc/notifier holds the screen's UI state and calls use-cases or repositories.
- The view-model exposes immutable state and intent methods (`load()`, `submit()`); the widget
  watches the state and calls the methods.

### Logic layer (optional but valuable as apps grow)

Use-cases / services expressing business rules in plain Dart. No `package:flutter` imports.
For small apps this can collapse into the view-model; introduce it when rules get shared or
complex.

### Data layer

Repositories behind interfaces, backed by data sources (REST client, database, platform
channels, cache). Repositories return **domain models** — they map DTOs/JSON internally.

## Dependency rule

```
Widget → ViewModel → UseCase → Repository(interface) → DataSource
                                      ↑ implemented in data layer
```

Inner layers never import outer ones. The repository interface is defined where it's used
(logic/domain), implemented in data. This keeps the domain swappable and testable.

## Worked feature: order list

```dart
// data layer — model + repository
@freezed
class Order with _$Order {
  const factory Order({required String id, required String title, required OrderStatus status}) = _Order;
  factory Order.fromJson(Map<String, dynamic> json) => _$OrderFromJson(json);
}

abstract interface class OrderRepository {
  Future<List<Order>> fetchOrders();
}

class HttpOrderRepository implements OrderRepository {
  HttpOrderRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Order>> fetchOrders() async {
    final res = await _client.get('/orders');               // DTO/JSON stays here
    return (res as List).map((j) => Order.fromJson(j)).toList();
  }
}
```

```dart
// UI layer — view-model holds immutable state, calls the repository
sealed class OrderListState {}
class OrderListLoading extends OrderListState {}
class OrderListData extends OrderListState { OrderListData(this.orders); final List<Order> orders; }
class OrderListError extends OrderListState { OrderListError(this.message); final String message; }

class OrderListViewModel extends ... {  // ChangeNotifier / Cubit / Notifier — project's choice
  OrderListViewModel(this._repo);
  final OrderRepository _repo;

  Future<void> load() async {
    emit(OrderListLoading());
    try {
      emit(OrderListData(await _repo.fetchOrders()));
    } catch (e) {
      emit(OrderListError('Could not load orders'));
    }
  }
}
```

```dart
// UI layer — widget renders state, never touches the network
@override
Widget build(BuildContext context) {
  final state = watch(viewModel);
  return switch (state) {
    OrderListLoading() => const Center(child: CircularProgressIndicator()),
    OrderListError(:final message) => ErrorView(message: message, onRetry: viewModel.load),
    OrderListData(:final orders) => ListView.builder(
        itemCount: orders.length,
        itemBuilder: (_, i) => OrderTile(order: orders[i]),
      ),
  };
}
```

## Why this pays off

- **Testable:** the view-model tests with a mock repository; no widget tree, no network.
- **Swappable:** replace `HttpOrderRepository` with a cached or fake one without touching UI.
- **Readable:** each file has one job; the data shape is converted once, at the edge.
