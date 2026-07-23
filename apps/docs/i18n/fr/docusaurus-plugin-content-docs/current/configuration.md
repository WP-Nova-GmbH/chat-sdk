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
| `triggerColorLight` | non | Couleur du lanceur en mode clair ; remplace alors `triggerColor`. |
| `triggerColorDark` | non | Couleur du lanceur en mode sombre ; remplace alors `triggerColor`. |
| `triggerIconColor` | non | `light`, `dark` ou une couleur hexadécimale. |
| `theme` | non | Mode actuel de la page hôte : `light` ou `dark`. Par défaut : `light`. |
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
  theme: "light",
});
```

Si ni `accent`, ni `triggerColor`, ni la couleur propre au mode actif ne sont
définis, le SDK peut masquer le lanceur jusqu’à la réception des données de
thème fiables de la surface. Sa couleur est résolue dans cet ordre :
`triggerColorLight` ou `triggerColorDark`, `triggerColor`, `accent`, puis le
violet Nova. Seule une couleur définie pour le mode actif permet un premier
affichage immédiat.

`theme` est distinct des réglages d’affichage de la surface Nova. Transmettez
explicitement le mode actuel de l’application hôte ; le SDK ne lit pas de
cookie WP Chat et ne déduit pas ce mode. Un nouvel appel à `init` avec un
`theme` différent met à jour le lanceur, le panneau et l’iframe existante sans
récupérer de nouveau token ni réinitialiser la conversation. Il en va de même
si la valeur de configuration change dans un wrapper de framework.

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

Les routes commencent par un seul `/`. Les URL absolues et les variantes
relatives au protocole telles que `//host/path` ou `/\host/path` sont rejetées.
Les routes sont dédupliquées et limitées à 100 ; le chemin et la description
sont limités à 300 caractères chacun. N’envoyez que celles que l’utilisateur
courant peut atteindre.

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

### Réinitialisation

Le SDK est compatible singleton. Relancer `init` pendant le HMR ou un remontage
au niveau d’une route réutilise le Custom Element existant. Si
`publicSurfaceId`, `baseUrl`, `voiceMode` ou `protocolVersion` change, l’élément
reconstruit l’iframe et le bridge, puis récupère un nouveau token. Une
modification de `tokenEndpoint` récupère de nouvelles données
d’authentification pour l’iframe existante. Les changements de `theme` ou de
couleurs du lanceur s’appliquent en direct ; un nouveau `theme` est également
transmis à l’iframe existante via `HOST_THEME`.

### Cycle de vie du panneau

À l’ouverture, le lanceur est masqué et le panneau utilise l’espace ainsi
libéré en bas à droite. Réduire le panneau depuis l’en-tête de l’iframe le
masque sans démonter l’iframe, ce qui conserve sa route et la conversation. Le
SDK contient aussi les événements pointer, souris et clic du lanceur dans son
Shadow DOM afin que les handlers de clic extérieur de la page hôte ne réagissent
pas à la même activation. Aucun code d’intégration n’est requis.
