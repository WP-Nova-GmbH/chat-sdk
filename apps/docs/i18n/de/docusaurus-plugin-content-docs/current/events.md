---
id: events
title: Events
---

## Events

The bridge protocol is intentionally explicit. Every frame carries a source tag and protocol version, and request/response pairs carry a `correlationId`.

### Important Frames

| Frame | Direction | Purpose |
| --- | --- | --- |
| `READY` | iframe to SDK | The iframe is ready to receive token and tool registration data. |
| `AUTH_TOKEN` | SDK to iframe | Pushes a short-lived embedded-session token. |
| `AUTH_EXPIRED` | iframe to SDK | Requests a token re-mint after a 401. |
| `REQUEST_SNAPSHOT` | iframe to SDK | Requests fresh visible page context. |
| `CLIENT_TOOL_REQUEST` | iframe to SDK | Requests a built-in navigation action or registered tool. |
| `CLIENT_TOOL_RESULT` | SDK to iframe | Returns the tool result and fresh snapshot. |
| `CLIENT_TOOL_ERROR` | SDK to iframe | Returns typed failure details such as `no_handler` or `timeout`. |

### Token Refresh

The SDK refreshes proactively at roughly 80 percent of `expires_in` and reactively when the iframe emits `AUTH_EXPIRED`.

Transport failures retry with backoff and cooldown. An unavailable user response is terminal and is sent to the iframe as `UNAVAILABLE`.
