---
id: configuration
title: Configuration
---

## Configuration

Toutes les options sont transmises à `WpNova("init", config)` ou au helper `init(config)`.

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `publicSurfaceId` | oui | Handle de surface non secret expose au SDK. |
| `tokenEndpoint` | oui | Endpoint du backend client qui émet un token de session intégrée. |
| `baseUrl` | non | URL de base de l’iframe Nova. Par défaut : `https://chat.wp-nova.ai`. |
| `mount` | non | Sélecteur CSS ou élément dans lequel monter le widget. Par défaut : `document.body`. |
| `title` | non | Titre du lanceur et du panneau avant authentification. |
| `accent` | non | Couleur d’accent avant authentification. |
| `triggerColor` | non | Couleur du lanceur/bouton d’ouverture. Par défaut : `accent`. |
| `triggerIconColor` | non | `light`, `dark` ou une couleur hexadécimale. |
| `safeValueSelectors` | non | Sélecteurs CSS qui autorisent la capture des valeurs de champ dans les instantanés. |
| `voiceMode` | non | Active la voix et délègue le microphone à l’iframe Nova. |
| `routes` | non | Routes du site filtrées par permissions, sous forme `{ path, description }`. |
| `settle` | non | Disponibilité post-action : `quietMs`, `maxWaitMs` et `waitForNavigationSignal`. |
| `protocolVersion` | non | Override du protocole de bridge pour les tests de compatibilité. |

### Valeurs par défaut

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  baseUrl: "https://chat.wp-nova.ai",
  title: "Assistant",
  accent: "#8665e3",
  triggerIconColor: "light",
});
```

### Routes et navigation asynchrone

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/clients", description: "Liste des clients avec recherche" },
    {
      path: "/clients/:customerId",
      description: "Détail client ; customerId provient de /clients",
    },
  ],
  settle: {
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
});
```

Les routes commencent par un seul `/`, sont dédupliquées et limitées à 100.
Le chemin et la description sont limités à 300 caractères chacun. N’envoyez
que celles que l’utilisateur courant peut atteindre.

Par défaut, après une action, le SDK attend 200 ms sans mutation DOM, avec une
limite de 1600 ms. Si la limite est atteinte, l’instantané porte
`unsettled: true`. Pour les routes SPA asynchrones,
`waitForNavigationSignal` attend `wp-nova:settled` après une navigation gérée
par l’hôte. N’émettez l’événement qu’après le rendu de la route et de ses données.

### Réponse pour un utilisateur indisponible

L’endpoint de token doit également transmettre la réponse complète pour les
utilisateurs non associés :

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

Nova utilise `message_is_custom: false` pour son message intégré traduisible et
`true` pour le texte de surface rédigé par un administrateur.

### Reinitialisation

Le SDK est compatible singleton. Relancer `init` pendant le HMR ou un remount au niveau d’une route réutilise le Custom Element existant. Si `publicSurfaceId`, `baseUrl`, `voiceMode` ou `protocolVersion` change, l’élément reconstruit l’iframe et le bridge, puis récupère un nouveau token avant de poster l’authentification.
