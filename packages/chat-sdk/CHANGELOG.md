# @wp-nova/chat-sdk

## 1.0.7

### Minor Changes

- Add host-controlled chat panels with fixed or resizable docked-sidebars while preserving the
  shared iframe and conversation across presentation changes.
- Add automatic page workflows with explicit page readiness, full rendered-page context,
  deterministic required evidence, and optional read-only backend research tools.
- Add SDK-defined site capability discovery, host/document/browser language signals, workflow
  evidence sources, and JIT user-creation confirmation forwarding.

### Patch Changes

- Preserve an in-flight workflow and its correlation when a host refreshes page readiness on the
  same URL, while allowing completed workflows and real navigation to start a new attempt.

## 1.0.5

### Patch Changes

- 1c059dd: Preserve the embedded conversation while minimizing, contain launcher clicks, reclaim launcher space while open, add live host-page light/dark theme and launcher-color synchronization, and reject backslash-normalized protocol-relative site routes.

## 1.0.4

### Patch Changes

- 9022b06: Add an opt-in host-navigation readiness mode so post-navigation snapshots wait for explicit route data completion instead of accepting a transient DOM quiet state.

## 1.0.3

### Patch Changes

- 7858288: Add host-declared site routes for direct agent navigation and wait for DOM quiescence before post-action snapshots.

## 1.0.2

### Patch Changes

- 1cdc249: Preserve unresolved-user access-request capabilities and recognize explicitly
  discriminated unavailable responses even when an intermediary rewrites the HTTP status.
