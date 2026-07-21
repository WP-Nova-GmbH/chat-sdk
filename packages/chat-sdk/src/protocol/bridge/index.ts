// postMessage bridge between the SDK (host page) and the Nova-hosted iframe.
//
// Hardening vs the POC:
//   - Strict `event.origin` (must equal the iframe's exact origin) AND strict
//     `event.source` (must be the iframe's contentWindow) checks on every frame.
//   - Outbound postMessages target the validated iframe origin — NEVER "*".
//   - A bounded timeout on the tool round-trip (replacing the POC's single
//     global 1500 ms); on timeout we emit/return a typed `timeout` error rather
//     than silently dropping. Snapshot capture is synchronous, so it has no
//     timeout — a capture failure surfaces as a `capture_error` frame, not a
//     `timeout`.
//   - Typed `*_ERROR` frames distinct from a successful empty result (fixes the
//     POC's `resolve(null)` ambiguity).
//
// The bridge is transport-only: it owns frame validation, correlation, and
// timeouts. Capture/tool execution live in snapshot/index.ts / navigation/index.ts /
// tools.ts; the caller wires them in via the handler callbacks.

export { Bridge } from "./bridge.js";
export type { BridgeHandlers } from "./handlers.js";
