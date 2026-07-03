---
name: flutter-performance
description: Keep Flutter UIs at 60/120fps — minimize rebuilds, build lazily, and profile jank.
recommended: true
---

# Flutter Performance

Most Flutter jank comes from rebuilding too much, building eagerly, or doing work on the UI
isolate. Apply these when building UI and when chasing a dropped-frame report.

## Minimize rebuilds

- **`const` everything you can.** A `const` widget is canonicalized and skipped on rebuild.
  Make constructors `const` and pass `const` children.
- **Extract widgets, don't write `Widget` helper methods.** A `_buildHeader()` method rebuilds
  with its parent every time; a separate `const HeaderWidget()` rebuilds only when its inputs
  change.
- **Push `setState`/state down.** Rebuild the smallest subtree. A `setState` at the top of a
  screen rebuilds the whole screen; move the stateful piece into a small child.
- **Scope subscriptions.** With Provider/Bloc/Riverpod, watch the narrowest slice
  (`select`/`BlocSelector`) so an unrelated field change doesn't rebuild the widget.

```dart
// Don't: helper method — whole subtree rebuilds with the parent
Widget _buildBadge() => Container(/* ... */);

// Do: a const widget — rebuilds only when its inputs change
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status});
  final OrderStatus status;
  @override
  Widget build(BuildContext context) => /* ... */;
}
```

## Build lazily

- Long/unbounded lists: `ListView.builder` / `GridView.builder` / `SliverList`, never a
  `ListView(children: [...])` that builds every item up front.
- Use `const` separators and item widgets so off-screen recycling is cheap.
- For very large or variable lists, set `itemExtent`/`prototypeItem` to skip layout passes.
- Add keys (`ValueKey`) to list items that reorder so element state follows the data.

## Keep the UI isolate free

- `build()` can run every frame — no sorting, JSON parsing, regex, or I/O inside it. Compute
  derived values in the view-model/state, not in `build`.
- Offload CPU-bound work (parsing big payloads, image processing) to `Isolate.run` / `compute`.
- Decode/resize images appropriately (`cacheWidth`/`cacheHeight`, `ResizeImage`); don't load
  full-resolution images into thumbnails.

## Animations & effects

- Animate with `AnimatedBuilder`/implicit animations that rebuild only the animated widget, not
  a `setState` loop over the screen.
- `Opacity`/`ClipRRect`/`BackdropFilter` are expensive — prefer cheaper alternatives
  (`AnimatedOpacity` sparingly, `borderRadius` on the decoration instead of a clip).
- `RepaintBoundary` around frequently-repainting subtrees isolates their raster work.

## Profile, don't guess

- Run in **profile mode** (`flutter run --profile`) — debug mode is not representative.
- Use the DevTools performance view; look for frames over budget and the "rebuild" / "raster"
  cost. Turn on "Track widget rebuilds" to find rebuild storms.
- Fix the measured hot spot; don't pre-optimize cold paths.

## Checklist

- [ ] `const` constructors/widgets used wherever legal.
- [ ] Widgets extracted instead of `Widget`-returning helpers.
- [ ] Lists built lazily with `.builder`; keys on reorderable items.
- [ ] No parsing/sorting/I/O in `build()`; heavy work in isolates.
- [ ] Rebuilds scoped with selectors.
- [ ] Jank verified in profile mode with DevTools, not guessed.
