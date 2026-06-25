---
id: security
title: Security & permissions
---

## Security & Permissions

The SDK is designed around a narrow browser trust boundary.

- The browser never receives the Nova integration secret.
- The SDK posts messages only to the iframe's exact origin.
- Inbound frames must match both `event.origin` and `event.source`.
- Tool errors are explicit typed frames, not silent empty results.
- Mutating tool classification is server-side; the SDK only executes approved requests.
- Field values are default-deny and sensitivity checks cannot be bypassed by opt-in selectors.

### Token Endpoint Responsibilities

Your backend must authenticate the current user with your own session. It should call Nova with a server-side secret and return either the token response or the unavailable-user response.

Do not trust an email or user id supplied by the browser for token minting.

### CSP and Framing

The Nova iframe route should be frameable by allowed customer origins. The current fronto deployment keeps `/sdk/v1/sdk.js` no-cache while immutable SDK URLs are long-lived and suitable for SRI.

Embedded voice mode is opt-in through `voiceMode: true`. When enabled, the SDK
adds iframe microphone delegation for the Nova chat frame. If your host page
sends a restrictive Permissions Policy, allow the Nova iframe origin:

```http
Permissions-Policy: microphone=(self "https://chat.wp-nova.ai")
```
