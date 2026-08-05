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
| `mount` | barre latérale uniquement | Sélecteur CSS ou `HTMLElement` de montage. Le pop-over utilise `document.body` par défaut ; la barre latérale exige un conteneur de mise en page explicite. |
| `presentation` | non | `{ mode: "popover" }` (par défaut) ou `{ mode: "sidebar", width?: number, resizable?: boolean }`. |
| `title` | non | Titre du lanceur et du panneau avant authentification. |
| `accent` | non | Couleur d’accent avant authentification. |
| `triggerColor` | non | Couleur du lanceur/bouton d’ouverture. Par défaut : `accent`. |
| `triggerColorLight` | non | Couleur du lanceur en mode clair ; remplace alors `triggerColor`. |
| `triggerColorDark` | non | Couleur du lanceur en mode sombre ; remplace alors `triggerColor`. |
| `triggerIconColor` | non | `light`, `dark` ou une couleur hexadécimale. |
| `launcher` | non | Affiche le lanceur du SDK. Par défaut : `true` ; utilisez `false` pour un bouton hôte. |
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
  launcher: true,
  presentation: { mode: "popover" },
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

### Présentation

La présentation `popover` par défaut conserve le panneau fixe de
`384px × 640px` et occupe tout l’écran lorsque la largeur du viewport ne
dépasse pas `480px`. Le mode `sidebar` ancre la même iframe comme colonne
d’une mise en page appartenant à la page hôte :

```html
<div id="nova-layout">
  <main><!-- contenu de l’application --></main>
</div>

<style>
  #nova-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 100dvh;
    align-items: stretch;
  }
  #nova-layout > main {
    min-width: 0;
  }
</style>
```

```ts
let mode: "popover" | "sidebar" = "sidebar";

function applyPresentation() {
  init({
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova-token",
    mount: "#nova-layout",
    presentation:
      mode === "sidebar"
        ? { mode: "sidebar", width: 420, resizable: true }
        : { mode: "popover" },
  });
}

applyPresentation();
mode = "popover";
applyPresentation();
```

La largeur de la barre latérale vaut `384px` par défaut. Les nombres finis
sont limités à `320–640px` ; une valeur d’exécution non valide émet un
avertissement et utilise `384px`. La page hôte contrôle entièrement l’ordre
des colonnes, la hauteur disponible, les décalages sticky/header et les
animations.

La largeur de la barre latérale est fixe par défaut. `resizable: true` ajoute
un séparateur accessible sur son bord inline-start. Il prend en charge le
glisser au pointeur, les flèches gauche/droite par pas de `16px`, Origine pour
`320px` et Fin pour la plus grande largeur autorisée par le conteneur courant.
Le redimensionnement respecte toujours `320–640px` et réserve `384px` au
contenu principal.

Après validation d’un glisser et après chaque modification au clavier, le
séparateur émet l’événement bubbling et composed `wp-nova:sidebar-resize` avec
`{ width: number }` dans `detail`. Le SDK applique immédiatement la largeur
sans remplacer l’iframe. Enregistrez-la et retransmettez-la comme
`presentation.width` lors des prochains appels à `init()` pour conserver le
choix de l’utilisateur.

Le SDK observe la largeur disponible du conteneur de montage. Il ne conserve
le mode ancré que si la barre latérale laisse encore `384px` au contenu
principal. Avec la largeur par défaut, le mode passe donc en pop-over sous
`768px`, puis revient automatiquement en barre latérale lorsque l’espace le
permet.

Appelez de nouveau `init()` pour changer de mode, de largeur ou de cible de
montage. Le SDK déplace et restyle son Custom Element existant tout en
préservant l’iframe, le bridge, le token, les outils enregistrés, l’état
ouvert/fermé et la conversation. Le mode `sidebar` exige un `mount` explicite
et résolvable ; sinon, une erreur exploitable est levée.

L’ouverture et la fermeture ne font pas partie de la configuration de
présentation. Utilisez le lanceur intégré ou `open()`, `close()` et `toggle()`.
Lorsqu’une barre latérale ancrée se ferme, sa colonne se réduit à une largeur
nulle. `launcher: false` permet le même contrôle depuis un bouton hôte.

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
transmis à l’iframe existante via `HOST_THEME`. Les changements de
`presentation` ou de `mount` restylent ou déplacent l’élément existant sans
réinitialiser l’iframe ni l’authentification.

### Cycle de vie du panneau

À l’ouverture, le lanceur est masqué et le panneau utilise l’espace ainsi
libéré en bas à droite. Réduire le panneau depuis l’en-tête de l’iframe le
masque sans démonter l’iframe, ce qui conserve sa route et la conversation. Le
SDK contient aussi les événements pointer, souris et clic du lanceur dans son
Shadow DOM afin que les handlers de clic extérieur de la page hôte ne réagissent
pas à la même activation.

Pour un bouton hôte, définissez `launcher: false` puis appelez `open()`,
`close()` ou `toggle()`. Modifier `launcher` en direct ne remplace pas l’iframe.
Utilisez `subscribeOpenChange()` ou `wp-nova:open-change` pour synchroniser le
bouton lorsque l’iframe réduit elle-même le panneau.
