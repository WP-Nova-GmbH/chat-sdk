// Visible Page Snapshot capture (first-party, in the host page) — WS4.
//
// The SDK captures what the user can actually SEE: visible structure/text,
// selected text, visible links, visible interactive controls, and the labels
// of form fields — plus stable element handles the navigation/tool executors
// resolve at action time. It is dependency-free and runs entirely client-side.
//
// FIELD-VALUE POLICY — DEFAULT-DENY (privacy-critical; this is the highest-risk
// PII/secret path into the agent). By default the snapshot OMITS every
// input/textarea/contenteditable value. A value is captured ONLY when it both
//   (a) opts in via `data-wp-nova-include` (attribute on the field or an
//       ancestor) or a per-surface safe-selector allowlist, AND
//   (b) passes every sensitivity check.
// HARD-EXCLUDE regardless of opt-in:
//   - input[type] in {password, hidden, file}
//   - autocomplete in {cc-*, current-password, new-password, one-time-code}
//   - name/id/placeholder/aria-label matching
//     /(card|cc|cvv|cvc|ssn|secret|token|password|account|iban|routing|pin)/
//   - aria-hidden / off-viewport / display:none subtrees / data-wp-nova-ignore
//
// STABLE HANDLES: every captured element is stamped with a `data-wp-nova-h`
// attribute, recorded in an in-session WeakMap(id → node), and given a
// fingerprint (selector + role + accessible name) carried in the snapshot.
// Action-time resolution (navigation/index.ts) is attribute → WeakMap → fingerprint →
// STALE_HANDLE. Handles are re-indexed on each capture, but a still-live element
// keeps its existing handle id so background captures cannot invalidate handles
// the model just saw.
//
// SIZE BUDGET: enforced client-side BEFORE postMessage. Viewport-visible
// controls/links/labeled fields fill bounded budgets for handle count,
// visible-text chars, and per-field value length; anything dropped flips
// `truncated: true`.
//
// SCOPE: open shadow roots are traversed (composed). Closed shadow roots,
// cross-origin iframes, and canvas/WebGL/SVG-only regions cannot be read and
// flip `partial: true` so the agent knows context is incomplete.

export { captureVisiblePageSnapshot } from "./capture.js";
export { HANDLE_ATTR } from "./constants.js";
export { capturePageContext } from "./context.js";
export { cssEscape } from "./dom.js";
export { clearHandleStamps, resolveHandleNode } from "./handles.js";
