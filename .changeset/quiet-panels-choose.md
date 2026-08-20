---
"@wp-nova/chat-sdk": patch
---

Add a `ui` config option that picks which chat design the embedded iframe renders. It defaults to `"classic"`, the design every existing embed already shows, so a surface only moves to the reworked panel when its host upgrades and asks for `"current"` by name. The design is chosen when the iframe is built, so changing it re-creates the frame rather than restyling a live conversation.
