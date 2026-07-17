---
id: quickstart
title: Schnellstart
---

## Schnellstart

Wähle den Script-Tag, wenn du die kleinste Integrationsfläche möchtest, oder npm, wenn die Host-App bereits gebündelt wird.

### Script Tag

Das Queue-Snippet erlaubt dir, Tools zu registrieren, bevor die SDK-Datei geladen ist. Aufrufe werden in Reihenfolge abgespielt, sobald das globale Bundle den echten Dispatcher installiert.

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () {
      (w.WpNova.q = w.WpNova.q || []).push(arguments);
    };
    var j = d.createElement(s);
    j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/<version>/sdk.js";
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash for this version>";
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
npm install @wp-nova/chat-sdk
```

```ts
import { init, registerToolHandler } from "@wp-nova/chat-sdk";

registerToolHandler("create_ticket", async (args) => {
  return myApp.createTicket(args);
});

init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
});
```

### Token Endpoint

Dein Endpoint erhält `{ publicSurfaceId, origin }` vom SDK und sollte den authentifizierten serverseitigen Benutzer verwenden, nicht eine vom Browser behauptete E-Mail-Adresse.

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

Wenn die E-Mail-Adresse keinem aktiven Nova-Benutzer zugeordnet ist, enthält die
Antwort keinen Chat-Token:

```json
{
  "unavailable": true,
  "email": "person@example.com",
  "message": "Es wurde kein Nova-Konto gefunden.",
  "message_is_custom": false,
  "access_request_token": "<zweckgebundene Berechtigung>",
  "access_request_expires_in": 3600
}
```

Gib Status und Antworttext unverändert weiter. `message_is_custom: false` erlaubt
dem iframe, Novas integrierte Nachricht in der aktiven UI-Sprache anzuzeigen;
benutzerdefinierter Administrator-Text ist mit `true` markiert.
