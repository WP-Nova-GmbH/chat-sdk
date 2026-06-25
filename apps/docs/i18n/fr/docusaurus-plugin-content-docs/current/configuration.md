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

### Reinitialisation

Le SDK est compatible singleton. Relancer `init` pendant le HMR ou un remount au niveau d’une route réutilise le Custom Element existant. Si `publicSurfaceId`, `baseUrl` ou `protocolVersion` change, l’élément reconstruit l’iframe et le bridge, puis récupère un nouveau token avant de poster l’authentification.
