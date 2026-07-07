---
"@wp-nova/chat-sdk": minor
---

Add login-only surfaces (WP-104). `tokenEndpoint` is now optional: omit it to boot a login-only surface (`authMode: "none"`) whose host page does no authentication of its own. The SDK skips host token acquisition, never arms the proactive refresh timer, and after the READY handshake sends `AUTH_ERROR { code: "NO_HOST_AUTH" }` so the iframe pins the origin and opens its in-widget login screen. An explicitly empty-string `tokenEndpoint` is still rejected as a typo.

A new inbound `LOGIN_STATE { selfManaged }` frame lets the iframe pause host re-minting while it manages its own in-widget session and resume it on logout (in host mode, resume triggers one immediate re-mint so the widget recovers instantly). All wire changes are additive; `PROTOCOL_VERSION` stays 2. Requires a platform release that includes WP-104 — an older `/embed/chat` shows a generic auth error instead of the login screen.
