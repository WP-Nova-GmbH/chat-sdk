---
id: navigation
title: Navigation and async pages
---

The SDK can navigate from visible links or from a host-declared route manifest. After a page action it waits before capturing the next snapshot so the agent sees the destination, not the screen that was just left.

## Declare the site topology

Without `routes`, the agent knows only links visible in the current snapshot. Declare useful routes so it can go directly to a known destination.

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/customers", description: "Customer lookup list with search." },
    {
      path: "/customers/:customerId",
      description: "Customer detail; obtain customerId from /customers or list_customers.",
    },
    { path: "/settings/profile", description: "Signed-in user's profile settings." },
  ],
});
```

Route rules:

- Paths are same-origin and start with one `/`; absolute URLs and
  protocol-relative variants such as `//host/path` or `/\host/path` are rejected.
- Duplicate paths are removed and at most 100 entries are carried.
- Keep each path and description within Nova's 300-character bound.
- Use `:param` placeholders in patterns. Never put fake ids in the path.
- The description states where a real id comes from. The agent opens an index route rather than inventing one.
- Describe user-facing purpose, not hidden instructions.
- Declare only routes the current user can reach. Filter by tenant, role, module, feature, and resource permissions.
- Re-initialize when the accessible route set changes.
- Routes are available to Nova only when Page Reading is enabled on the surface.

Build the manifest from central route constants where possible. A manually copied route list drifts as the router changes; add a parity test for important routes.

## Prefer semantic URLs and controls

Nova prefers a captured `href` or declared route because it survives DOM re-renders. Use real anchors for navigation and real labeled buttons for actions.

A framework event on a non-interactive container may be usable by a person but invisible to the page snapshot. For example, a React `onClick` on a table row is not a semantic control. Add a labeled anchor/button that runs the same action and remains accessible to assistive technology.

## Connect an SPA router

Before the SDK changes a same-origin URL, it dispatches a cancelable `wp-nova:navigate` event. Intercept it once near the persistent app root:

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  const destination = new URL(url, window.location.href);
  if (destination.origin !== window.location.origin) return;

  event.preventDefault();
  router.navigate(`${destination.pathname}${destination.search}${destination.hash}`);
});
```

Call `preventDefault()` only when the router accepts the navigation. Otherwise the SDK falls back to normal document navigation.

Preserve the full path, query, and hash. Track the exact requested destination so an unrelated route change cannot satisfy the pending Nova action.

## Understand post-action settling

SDK 1.0.3 and later waits for a mutation-free window before recapturing after actions and tools.

- `quietMs` is the required DOM mutation-free window. Default `200`; clamped to `0–1000`.
- `maxWaitMs` is the hard cap. Default `1600`; clamped between `quietMs` and `5000`.
- If the cap is reached, the snapshot contains `unsettled: true`. Nova can call `refresh_context` before concluding the action failed.
- Ordinary user-message snapshot requests are immediate; the settle wait applies to post-action recapture.
- The host may dispatch `wp-nova:settled` during a pending wait to finish early.

DOM quiet is sufficient for synchronous pages and many simple client-side actions. It is not a reliable signal for a router that commits a shell, goes briefly quiet, and then renders async data.

## Require an explicit async-route signal

SDK 1.0.4 adds host-navigation readiness mode:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  settle: {
    quietMs: 1000,
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
});
```

When the host cancels `wp-nova:navigate`, the SDK ignores transient DOM quiet and waits for `wp-nova:settled`. Full-document navigation and ordinary tool results continue to use normal settling. If no signal arrives before the cap, the SDK captures and marks the result unsettled rather than hanging the tool loop.

Dispatch the event only after:

1. the router location equals the requested destination;
2. the destination component has committed;
3. required route data has loaded or reached its intended error/empty state;
4. the rendered view has remained ready for a short continuous window.

```ts
function signalNovaReady() {
  window.dispatchEvent(new CustomEvent("wp-nova:settled"));
}
```

The SDK listens only while a post-navigation settle is pending. Signals sent at navigation dispatch time or outside that window are ignored. Do not use a single global “no requests anywhere” check if unrelated polling can keep it busy; prefer route-specific loader/query readiness.

### React Router with data queries

A robust adapter keeps the pending destination in a ref, waits until `useLocation()` matches it, then observes only the destination's required queries. After they are ready, allow the final render to commit and dispatch `wp-nova:settled`. Clean up polling/listeners on unmount and when a new Nova navigation replaces the old one.

Keep the provider above the route outlet so it remains mounted during this sequence.

## After custom tools

Custom tools also receive a settled post-action snapshot. After mutations, wait
for the API, refresh visible data, and return a stable URL. Do not report a
successful mutation as failed solely because a later cache refresh failed. See
[Tools and guided workflows](./tools.md).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| URL changes but snapshot shows the previous page | Enable `waitForNavigationSignal` and dispatch `wp-nova:settled` after route data renders. |
| Every navigation waits for `maxWaitMs` | The signal is never sent, is sent too early, or readiness watches unrelated global requests. |
| Snapshot is `unsettled` | The hard cap was reached. Fix readiness or let Nova call `refresh_context`. |
| Tool receives `stale_handle` | The DOM changed. Capture/refresh context and use a handle from the latest snapshot, or prefer a URL. |
| User sees confirmation for opening a record | `open_record` is conservatively confirmation-gated because its handle fallback clicks host UI. |

## Browser checks

Test direct navigation to:

- a static page;
- a lazy-loaded route;
- a route with async data;
- a detail route using an observed id;
- a denied route for a restricted user;
- a route whose loader returns empty/error state.

For each accepted navigation, verify the returned snapshot contains the destination's loaded content rather than only the new URL or old screen.
