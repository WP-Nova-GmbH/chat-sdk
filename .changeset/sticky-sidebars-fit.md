---
"@wp-nova/chat-sdk": patch
---

Dock the sidebar presentation to the viewport instead of stretching it to the document. Stretching handed the element its grid row's height, so on a long host page the panel became a column taller than the window and the composer sat below the fold. It is sticky and viewport-tall now, with `--wpn-sidebar-offset` to clear a fixed host header, and a mount that already has a definite height still wins.
