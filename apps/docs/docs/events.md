---
id: events
title: Events
---

The bridge protocol is intentionally explicit. Every frame carries a source tag and protocol version, and request/response pairs carry a `correlationId`.

The SDK sends frames only to the iframe's exact origin. The iframe accepts frames only from its direct parent and pins the parent origin from the first trusted SDK frame.

## Important Frames

| Frame | Direction | Purpose |
| --- | --- | --- |
| `READY` | iframe to SDK | The iframe is ready to receive auth and tool registration data. It includes the protocol version range it supports. |
| `AUTH_TOKEN` | SDK to iframe | Pushes a short-lived embedded-session token and optional trusted display settings. |
| `AUTH_ERROR` | SDK to iframe | Reports a transport or malformed token-endpoint failure. |
| `UNAVAILABLE` | SDK to iframe | Tells the iframe that the asserted email did not resolve to an active Nova tenant user. |
| `AUTH_EXPIRED` | iframe to SDK | Requests a token re-mint after a 401 or expired embedded session. |
| `REGISTER_TOOLS` | SDK to iframe | Announces SDK-defined tool specs that are currently registered by the host app. |
| `REQUEST_SNAPSHOT` | iframe to SDK | Requests fresh visible page context. |
| `SNAPSHOT_RESULT` | SDK to iframe | Returns the captured page context. |
| `SNAPSHOT_ERROR` | SDK to iframe | Reports a typed capture failure. |
| `CLIENT_TOOL_REQUEST` | iframe to SDK | Requests a built-in page action or registered integrator tool after any required confirmation. |
| `CLIENT_TOOL_RESULT` | SDK to iframe | Returns the tool result and a fresh post-action snapshot. |
| `CLIENT_TOOL_ERROR` | SDK to iframe | Returns typed failure details such as `no_handler`, `stale_handle`, `capture_error`, or `timeout`. |
| `SURFACE_THEME` | iframe to SDK | Applies trusted surface theme values to SDK-owned launcher chrome. |
| `MINIMIZE` | iframe to SDK | Closes the SDK-owned panel from the iframe header. |

## Token Refresh

Embedded-session tokens are short-lived. The SDK refreshes in two ways:

- **Proactive:** it re-fetches from `tokenEndpoint` at roughly 80 percent of `expires_in`.
- **Reactive:** when the iframe emits `AUTH_EXPIRED`, the SDK re-fetches from `tokenEndpoint` and sends a new `AUTH_TOKEN`.

The iframe cannot call your cross-origin `tokenEndpoint` directly, so the SDK is always the re-mint path.

## Error Semantics

Bridge errors are explicit frames, not empty success responses.

| Code | Meaning |
| --- | --- |
| `timeout` | A tool/navigation response exceeded the allowed round-trip time. |
| `no_handler` | The surface declared a tool, but the browser did not register a matching handler. |
| `stale_handle` | The page changed and the target handle no longer resolves. The agent can retry from a fresh snapshot. |
| `capture_error` | Snapshot capture failed while reading the page. |
| `handler_threw` | A registered tool handler threw or rejected. |

Unavailable users are not represented as transport errors. A `{ "unavailable": true, ... }` token response becomes `UNAVAILABLE` and is terminal for that mount.

## Protocol Skew

The iframe announces `minProtocolVersion` and `maxProtocolVersion` in `READY`. If a pinned customer SDK is outside the iframe's supported protocol range, the SDK refuses later bridge work and reports a visible protocol error instead of executing incompatible messages.
