---
name: flutter-architect
description: Architecture patterns for Flutter apps — layering, state, navigation, modularization.
recommended: true
---

# Flutter Architecture

How to structure a Flutter app so it stays testable and changeable as it grows. Apply when
starting a feature, refactoring, or deciding where code belongs. The companion references go
deeper on each axis.

## The layered shape

```
UI layer      widgets + view-models/controllers   presentation only
Logic layer   use-cases / services                business rules, pure Dart
Data layer    repositories -> data sources        network, db, platform channels
```

- **Dependencies point inward.** UI depends on Logic depends on Data. Nothing in the data
  layer imports `package:flutter`; nothing in the logic layer knows about widgets.
- **Repositories return domain models**, not JSON/DTOs. The mapping happens in the data layer.
- **The logic layer is plain Dart** — unit-testable with no widget tree.

Full rules + a worked feature in `references/layered-architecture.md`.

## Where things go

| Concern | Layer | Notes |
|--------|-------|-------|
| `build()`, layout, theming | UI | no business logic, no I/O |
| view-model / bloc / notifier | UI ↔ Logic | holds UI state, calls use-cases |
| business rules, validation | Logic | pure Dart, no Flutter |
| network / db / cache | Data | behind a repository interface |
| models | shared | immutable (`freezed`), no behavior tied to UI |

## State management

Pick one approach for the whole app and stay consistent. The trade-offs and a chooser are in
`references/state-management.md`. The invariants hold regardless of choice:

- Keep ephemeral UI state local (`StatefulWidget`). Lift only shared/business state.
- State is immutable; replace via `copyWith`.
- Logic lives in the view-model/bloc/notifier, never in the widget.

## Navigation

Use a declarative router (`go_router`/`auto_route`) once you have deep links, web URLs, or
auth guards. Route structure, guards, and nested navigators are in `references/navigation.md`.

## Modularization

- Feature-first folders inside one package by default.
- Split into packages (or a melos monorepo) only for real reuse or build-isolation needs.
- Keep a `core`/`shared` for primitives and a `design_system` for theming/widgets.

## Checklist

- [ ] UI / Logic / Data boundaries respected; dependencies point inward.
- [ ] Logic layer is Flutter-free and unit-tested.
- [ ] One state-management approach, used consistently.
- [ ] Immutable state; logic out of widgets.
- [ ] Declarative routing where deep links / guards exist.
- [ ] Packages introduced only when justified.
