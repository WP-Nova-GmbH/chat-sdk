---
id: quickstart
title: Quickstart
---

## Quickstart

Choose the script tag when you want the smallest integration surface, or npm when the host app is already bundled.

### Script Tag

The queued snippet lets you register tools before the SDK file has loaded. Calls are replayed in order when the global bundle installs the real dispatcher.

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () {
      (w.WpNova.q = w.WpNova.q || []).push(arguments);
    };
    var j = d.createElement(s);
    j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/1.0.0/sdk.js";
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash>";
    d.head.appendChild(j);
  })(window, document, "script");

  WpNova("registerToolHandler", "create_ticket", function (args) {
    return window.app.createTicket(args);
  });

  WpNova("init", {
    publicSurfaceId: "srf_live_...",
    tokenEndpoint: "/api/nova-token"
  });
</script>
```

### npm

```bash
npm install @wp-nova/sdk
```

```ts
import { init, registerToolHandler } from "@wp-nova/sdk";

registerToolHandler("create_ticket", async (args) => {
  return myApp.createTicket(args);
});

init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
});
```

### Token Endpoint

Your endpoint receives `{ publicSurfaceId, origin }` from the SDK and should use the authenticated server-side user, not a browser-asserted email.

```ts
app.post("/api/nova-token", async (req, res) => {
  const user = await requireUser(req);
  const response = await fetch("https://api.wp-nova.ai/embed/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NOVA_INTEGRATION_SECRET}`,
      Origin: req.body.origin,
    },
    body: JSON.stringify({
      email: user.email,
      publicSurfaceId: req.body.publicSurfaceId,
      origin: req.body.origin,
      externalUserId: user.id,
    }),
  });

  res.status(response.status).type(response.headers.get("content-type") || "application/json");
  res.send(await response.text());
});
```
