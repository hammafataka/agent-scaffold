---
name: flutter-code-review
description: Review checklist for Dart/Flutter changes — correctness, rebuilds, state, null-safety.
recommended: true
---

# Flutter Code Review

A concrete checklist for reviewing Dart/Flutter diffs. Used at review time; the
`flutter-reviewer` agent applies it line by line. Lead with correctness, then performance,
then idioms.

## Correctness & lifecycle

- [ ] Every `AnimationController` / `StreamSubscription` / `TextEditingController` /
      `ScrollController` is **disposed**.
- [ ] No `setState`/state update after `await` without a `mounted` check.
- [ ] No `BuildContext` used across an async gap without `if (!context.mounted) return;`.
- [ ] `FutureBuilder`/`StreamBuilder`/`AsyncValue` handle the **error** and **empty** branches.
- [ ] No fire-and-forget `Future` whose error matters.

## Rebuild performance

- [ ] `const` used on widgets that can be `const`.
- [ ] Widgets extracted rather than `Widget`-returning helper methods.
- [ ] No expensive work (sort/parse/regex/I/O) inside `build()`.
- [ ] Long lists use `.builder`, not eager `children: [...]`.
- [ ] Consumers watch a narrow slice (`select`/`BlocSelector`) — no rebuild storms.

## State management

- [ ] State is immutable; updates via `copyWith`/`freezed`, not in-place mutation.
- [ ] Provider read with the right method (`watch` to react, `read` in callbacks).
- [ ] Business logic lives in the view-model/bloc, not the widget.
- [ ] Ephemeral UI state kept local; only shared state in the store.

## Null-safety & Dart idioms

- [ ] No gratuitous `!`; nulls handled explicitly.
- [ ] No `late` that can be read before assignment.
- [ ] No `dynamic` where a real type is known.
- [ ] Status modeled as enums/sealed classes; `switch` exhaustive.
- [ ] No `print` in production; no unjustified `// ignore:`.

## Data & architecture

- [ ] Network/DB access behind a repository — widgets don't call `dio`/`http` directly.
- [ ] Models immutable; JSON parsed at the edge via `fromJson`, not raw `Map` in the UI.
- [ ] Generated files (`*.g.dart`, `*.freezed.dart`) not hand-edited; codegen re-run.

## Tests & build

- [ ] New logic unit-tested; new UI widget-tested; error/empty branches covered.
- [ ] `dart analyze` clean; `dart format .` applied.

## How to report

For each finding give **`path:line`**, the failure mode, and a small fix snippet. Lead with the
highest-severity issues; if the diff is clean, say so and note any follow-ups.
