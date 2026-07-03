---
name: react-patterns
description: React component design, hooks discipline, and render performance — the rules that prevent the classic bugs.
recommended: true
---

# React Patterns

Component design and hooks discipline. Apply when writing or reviewing React code.

## State: the four questions

For every piece of state, answer once:

1. **Is it derivable?** Then it's not state — compute it in render (memoize only if measured hot).
2. **Is it server data?** It belongs to the data-fetching layer (query library / loader), with its cache as the source of truth — don't copy it into `useState`.
3. **Is it shared?** Lift to the nearest common ancestor or the project's store — not to global "just in case".
4. **Is it URL-worthy?** Filters, tabs, pagination → the URL, so it survives refresh and sharing.

## `useEffect` is an escape hatch

- Effects synchronize with *external* systems (DOM APIs, subscriptions, analytics). They are not for transforming data (derive in render), handling events (use handlers), or resetting state on prop change (use `key`).
- Every subscription effect returns a cleanup; every async effect handles unmount/stale responses (abort or ignore flag).
- If you're setting state in an effect based on other state/props, you almost certainly want a derived value instead.

## Component design

- Components render; hooks and loaders fetch; utils compute. A component over ~150 lines or with three unrelated `useState`s wants extraction.
- Every list is keyed by a stable ID — never the array index when items reorder.
- Handle all four UI states: loading, error, empty, success. Empty is the one everyone forgets.
- Extract child components instead of helper functions returning JSX — helpers re-render with the parent and can't be memoized.

## Performance (in order of payoff)

1. Push state down: a keystroke should re-render an input, not a page.
2. Pass children through: `<Provider>{children}</Provider>` keeps subtrees stable.
3. Only then reach for `memo` / `useMemo` / `useCallback` — and keep dependency arrays honest.

## Forms

- Uncontrolled + validation on submit for simple forms; the project's form library for complex ones. Don't hand-roll controlled-input state for ten fields.
