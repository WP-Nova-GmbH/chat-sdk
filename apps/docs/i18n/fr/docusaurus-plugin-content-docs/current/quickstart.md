---
id: quickstart
title: Démarrage rapide
---

## Démarrage rapide

Avant l’installation, décidez de l’authentification, des utilisateurs/modules,
de Page Reading/Navigation/Tools, des outils hôte, des routes, de la
confidentialité, de la disponibilité asynchrone et de la couleur primaire.
Choisissez ensuite la balise script ou npm.

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

  WpNova("registerTool", {
    name: "create_ticket",
    description: "Crée un ticket de support pour le contexte client visible.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"]
    },
    mutating: true,
    confirmationCopy: "Créer ce ticket ?",
    handler: function (args) {
      return window.app.createTicket(args);
    }
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
import { init, registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description: "Crée un ticket de support pour le contexte client visible.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  mutating: true,
  confirmationCopy: "Créer ce ticket ?",
  handler: async (args) => myApp.createTicket(args),
});

init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
});
```

Les outils sont facultatifs. Le contrat complet et le handler vivent ensemble
dans `registerTool` ; Nova Admin active/désactive seulement les Page Tools
définis par le SDK pour la surface. Enregistrez routes et outils uniquement pour
les permissions de l’utilisateur courant.

### Endpoint de token

Votre endpoint reçoit `{ publicSurfaceId, origin }` depuis le SDK et doit utiliser l’utilisateur authentifié côté serveur, pas une adresse e-mail déclarée par le navigateur. Validez l’id de surface et l’origine du corps/en-tête par rapport à la configuration attendue, avec un timeout. Pour une SPA Bearer, créez d’abord une courte session serveur opaque `HttpOnly`, car le fetch du SDK n’hérite pas de l’en-tête Bearer de l’app.

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

Si l’adresse e-mail ne correspond à aucun utilisateur Nova actif, la réponse ne
contient aucun token de chat :

```json
{
  "unavailable": true,
  "email": "person@example.com",
  "message": "Aucun compte Nova n’a été trouvé.",
  "message_is_custom": false,
  "access_request_token": "<autorisation limitée à cet usage>",
  "access_request_expires_in": 3600
}
```

Transmettez le statut et le corps sans modification. `message_is_custom: false`
permet à l’iframe d’afficher le message intégré de Nova dans la langue active de
l’interface ; le texte personnalisé d’un administrateur est marqué `true`.

### Routes et disponibilité

Transmettez si besoin des `routes` filtrées par permissions. Dans une SPA,
l’hôte intercepte `wp-nova:navigate`. Si les données de route chargent de façon
asynchrone, utilisez `settle.waitForNavigationSignal: true` et émettez
`wp-nova:settled` seulement après le rendu de la route et de ses données. Un
timeout marque l’instantané `unsettled`, afin que Nova puisse appeler
`refresh_context`.
