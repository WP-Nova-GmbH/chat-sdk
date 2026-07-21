// Navigation action executor (WS5).
//
// Navigation actions (navigate / click / open_record / set_filter / scroll_to /
// highlight) are CLIENT-EXECUTED client tools. The SDK is a PURE EXECUTOR: it
// performs no client-side mutation classification and runs only actions the
// iframe has already approved (the server's `mutating` flag is authoritative,
// gated in the iframe). On success the executor performs the action against the
// snapshot module's stable handles and returns the tool result AND a fresh
// post-action snapshot with re-issued handles.
//
// Handle resolution order (the contract from WS4):
//   1. `data-wp-nova-h` attribute → the in-session handle store node.
//   2. Fingerprint fallback (stable selector, then role + accessible name).
//   3. Otherwise throw StaleHandleError → a `stale_handle` error frame so the
//      continuation re-streams with a fresh snapshot and the agent re-targets
//      rather than wedging on a dangling tool_call.

export { isNavigationAction, NAVIGATION_ACTIONS, type NavigationAction } from "./actions.js";
export { executeNavigation } from "./execute.js";
export { StaleHandleError } from "./targets.js";
export { BlockedNavigationError } from "./urls.js";
