---
id: quickstart
title: Démarrage rapide
---

## Démarrage rapide

Choisissez la balise script si vous voulez la surface d’intégration la plus petite, ou npm si l’app hôte est déjà bundlee.

### Balise script

Le snippet en file d’attente permet d’enregistrer des outils avant que le fichier du SDK soit chargé. Les appels sont rejoués dans l’ordre lorsque le bundle global installe le vrai dispatcher.

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

### Endpoint de token

Votre endpoint reçoit `{ publicSurfaceId, origin }` depuis le SDK et doit utiliser l’utilisateur authentifié côté serveur, pas une adresse e-mail déclarée par le navigateur.

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
