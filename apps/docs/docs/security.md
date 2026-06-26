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
5. Call Nova `POST /embed/session` with `Authorization: Bearer <integration secret>`.
6. Pass Nova's response through, including the unavailable-user response.
7. Set `Cache-Control: no-store`.

Do not trust an email, user id, tenant id, or integration secret supplied by browser code. The integration secret belongs only in server-side configuration.

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
  "message": "We could not find an account for person@example.com."
}
```

No user is provisioned, no thread is created, and no token is issued. Pass this response through unchanged so the iframe can show the configured unavailable-user message.

## Tool Permissions

Integrator-defined tools are declared on the Embedded Chat Surface. Browser code cannot add new model-callable tools by registering extra handlers.

For each tool:

- `name` must match the registered browser handler.
- `description` and `inputSchema` tell the agent when and how to call it.
- `mutating` is server-authoritative. When true, the iframe confirms with the user before sending `CLIENT_TOOL_REQUEST` to the SDK.
- `confirmationCopy` should name the action in user-facing language.

When in doubt, declare a tool as mutating. A conservative confirmation is better than letting an ambiguous host-page action run without user approval.

## Page Snapshot Privacy

The SDK captures visible structure and labels by default, but field values are default-deny.

Always exclude:

- Passwords, one-time codes, hidden inputs, and file inputs.
- Payment, card, CVC/CVV, SSN, token, secret, account, IBAN, routing, and PIN fields.
- Any region marked with `data-wp-nova-ignore`.

Only opt in values that are safe for the agent to read, such as case numbers, filters, visible record IDs, or public statuses.

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
