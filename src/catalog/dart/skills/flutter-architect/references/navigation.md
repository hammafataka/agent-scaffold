# Navigation & routing

Use a declarative router once the app has deep links, web URLs, or auth-guarded routes.
The two common choices are `go_router` (config-driven) and `auto_route` (codegen-driven).

## When imperative `Navigator` is enough

For a small app with a handful of screens and no deep linking, `Navigator.push`/`pop` is
fine. Reach for a router when you need: URL-based routing (web), deep links, declarative
guards (auth/onboarding), or nested/tab navigation with independent stacks.

## go_router

```dart
final router = GoRouter(
  initialLocation: '/',
  redirect: (context, state) {
    final loggedIn = context.read<AuthState>().isLoggedIn;
    final goingToLogin = state.matchedLocation == '/login';
    if (!loggedIn && !goingToLogin) return '/login';
    if (loggedIn && goingToLogin) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(
      path: '/orders/:id',
      builder: (_, state) => OrderScreen(id: state.pathParameters['id']!),
    ),
  ],
);
```

- Guards go in `redirect` — centralized, declarative, testable.
- Type the params: read `state.pathParameters` / `state.uri.queryParameters` once and pass typed values in.
- Use `StatefulShellRoute` for bottom-nav tabs with independent stacks.

## auto_route

Codegen-based: annotate screens, run build_runner, get a typed router and typed navigation
calls (`context.router.push(OrderRoute(id: id))`). Good when you want compile-checked routes
and nested routing; the cost is the codegen step.

## Rules

- One source of truth for routes — don't mix imperative `Navigator.push` with the router for
  the same flows.
- Guards/redirects centralized, not scattered `if (!loggedIn) Navigator...` in widgets.
- Pass typed arguments; don't smuggle objects through `extra` without a type.
- Handle unknown routes (`errorBuilder`/`onUnknownRoute`).
- Keep navigation logic out of `build()` — trigger it from callbacks/listeners.
