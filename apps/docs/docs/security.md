---
id: security
title: Security & permissions
---

The SDK is designed around a narrow browser trust boundary.

- The browser never receives the Nova integration secret.
- The browser never calls Nova `POST /embed/session` directly.
- The SDK posts messages only to the iframe's exact origin.
- Inbound frames must match both `event.origin` and `event.source`.
- Tool errors are explicit typed frames, not silent empty results.
- Mutating tool classification is server-side; the SDK only executes requests the iframe has already approved.
- Field values are default-deny and sensitivity checks cannot be bypassed by opt-in selectors.

## Token Endpoint Responsibilities

Your backend token endpoint is the security boundary. It must:

1. Authenticate the current platform user.
2. Read the user's email from trusted server-side auth state.
3. Reject unauthenticated requests.
4. Require `publicSurfaceId` and `origin` from the SDK request.
5. Verify `publicSurfaceId` matches the surface configured for this app.
6. Verify both the body origin and browser `Origin` header match the expected host origin.
7. Call Nova `POST /embed/session` with `Authorization: Bearer <integration secret>`.
8. Pass Nova's response through, including the unavailable-user response.
9. Set `Cache-Control: no-store`.

Do not trust an email, user id, tenant id, or integration secret supplied by browser code. The integration secret belongs only in server-side configuration. Do not proxy an arbitrary surface id or origin merely because the browser sent it.

The SDK's token request includes cookies but does not inherit the host app's
custom bearer header. Bearer-authenticated SPAs should create a minimal,
short-lived `HttpOnly` server session through a separately authenticated
bootstrap endpoint, then let `tokenEndpoint` resolve that session. Revoke it on
logout. See [Plan your integration](./planning.md#select-the-authentication-pattern).

## Origin Checks

Production surfaces enforce `allowedOrigins` during token minting. The origin must match exactly, including scheme and port.

Examples:

| Page URL | Origin to allow |
| --- | --- |
| `https://app.example.com/dashboard` | `https://app.example.com` |
| `https://app.example.com:8443/dashboard` | `https://app.example.com:8443` |
| `http://127.0.0.1:4308/customers` | `http://127.0.0.1:4308` |

The SDK sends `origin` in the token request body. Your backend should also forward it as the `Origin` header when calling Nova. Nova validates the body origin and, when present, the request `Origin` or `Referer` header.

Development origin mode is useful for temporary local review, but production embeds should use the allowlist.

## User Resolution

Nova resolves the email asserted by your backend to an active, non-deleted tenant user. If no user matches, Nova returns:

```json
{
  "unavailable": true,
  "email": "person@example.com",
  "message": "We could not find an account for person@example.com.",
  "message_is_custom": false,
  "access_request_token": "<purpose-scoped capability>",
  "access_request_expires_in": 3600
}
```

No user is provisioned, no thread is created, and no chat token is issued. The
access-request capability is separately purpose-scoped and cannot authenticate
chat APIs. Pass the complete response and status through unchanged so the iframe
can show the configured message and administrator-notification action.
The `message_is_custom` discriminator lets the iframe localize Nova's built-in
message while preserving administrator-authored surface copy.

## Tool Permissions

The SDK declares tools with `registerTool`; the surface Page Tools gate decides
whether Nova accepts them. Nova's relayed `mutating` flag is authoritative and
controls iframe confirmation. Register only tools the current user may use, and
enforce the same permission again in the backend. See
[Tools and guided workflows](./tools.md).

## Page Snapshot Privacy

Field values are default-deny and sensitivity checks override opt-ins. Mark
private subtrees with `data-wp-nova-ignore`; opt in only required safe values.
See [Giving the agent DOM access](./dom-access.md).

## CSP and Framing

Your host page must be allowed to load the SDK script and frame the Nova chat app.

Typical host-page CSP additions:

```http
script-src 'self' https://chat.wp-nova.ai;
frame-src https://chat.wp-nova.ai;
connect-src 'self' https://chat.wp-nova.ai https://chat.wp-nova.ai/api;
```

Adjust `connect-src` to include your own `tokenEndpoint` and the Nova API origin used by your deployment. If you use the version-pinned CDN URL, keep the `integrity` attribute on the script tag.

The Nova iframe route is frameable only by allowed customer origins. The token gate is still the real authorization boundary: without a valid surface, origin, secret, and mapped user, no embedded-session token is minted.

Embedded voice mode is opt-in through `voiceMode: true`. When enabled, the SDK
adds iframe microphone delegation for the Nova chat frame. If your host page
sends a restrictive Permissions Policy, allow the Nova iframe origin:

```http
Permissions-Policy: microphone=(self "https://chat.wp-nova.ai")
```
