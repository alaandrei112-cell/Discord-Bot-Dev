---
name: Wouter query navigation
description: Wouter path subscriptions do not refresh components for query-only navigation.
---

When a Wouter component renders active navigation or other UI state from query parameters, subscribe to `useSearch()` as well as `useLocation()`.

**Why:** Switching between tabs on the same pathname updated the browser URL but left the shared sidebar rendered with the previous active item.

**How to apply:** Use the search hook value for query matching and include it in effects that derive state from the current route. Test consecutive query-only tab changes, not just direct page loads.