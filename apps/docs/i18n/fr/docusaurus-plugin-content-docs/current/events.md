---
id: events
title: Événements
---

## Événements

Le protocole de bridge est volontairement explicite. Chaque frame porte un tag de source et une version de protocole, et les paires requête/réponse portent une `correlationId`.

### Frames importantes

| Frame | Direction | Rôle |
| --- | --- | --- |
| `READY` | iframe vers SDK | L’iframe est prête à recevoir le token et les données d’enregistrement des outils. |
| `HOST_THEME` | SDK vers iframe | Applique le mode clair ou sombre actuel de la page hôte. Envoyée lors de `READY` et des modifications en direct de la configuration. |
| `AUTH_TOKEN` | SDK vers iframe | Envoie un token de session intégrée à courte durée de vie. |
| `AUTH_EXPIRED` | iframe vers SDK | Demande un nouveau token après un 401. |
| `REQUEST_SNAPSHOT` | iframe vers SDK | Demande un contexte visible de page à jour. |
| `CLIENT_TOOL_REQUEST` | iframe vers SDK | Demande une action de navigation intégrée ou un outil enregistré. |
| `CLIENT_TOOL_RESULT` | SDK vers iframe | Renvoie le résultat de l’outil et un instantané frais. |
| `CLIENT_TOOL_ERROR` | SDK vers iframe | Renvoie des détails d’échec typés comme `no_handler` ou `timeout`. |
| `START_PAGE_WORKFLOW` | SDK vers iframe | Démarre le workflow `research-and-compose` correspondant. |
| `CANCEL_PAGE_WORKFLOW` | SDK vers iframe | Annule un workflow qui n’a pas encore démarré. |
| `PAGE_WORKFLOW_STATUS` | iframe vers SDK | Signale `started`, `cached`, `completed`, `failed` ou `skipped`. |
| `REGISTER_TOOLS` | SDK vers iframe | Annonce les spécifications d’outils SDK actuellement enregistrées. |
| `SURFACE_THEME` | iframe vers SDK | Applique les valeurs de thème fiables de la surface au lanceur géré par le SDK. |
| `MINIMIZE` | iframe vers SDK | Masque le panneau géré par le SDK depuis son en-tête sans retirer l’iframe ni la faire naviguer. |

### Renouvellement du token

Le SDK renouvelle proactivement vers 80 % de `expires_in` et réactivement lorsque l’iframe émet `AUTH_EXPIRED`.

Les échecs de transport sont retentés avec backoff et cooldown. Une réponse utilisateur indisponible est terminale et envoyée à l’iframe sous la forme `UNAVAILABLE`.

La readiness d’un workflow utilise `setPageReady(false)` pendant le chargement
et `setPageReady(true)` après le rendu. Un rafraîchissement de la même URL
conserve une exécution déjà commencée.

Les SPA utilisent aussi `wp-nova:navigate` pour le routeur same-origin et
`wp-nova:settled` pour signaler que la vue cible est rendue. Si la limite
post-action est atteinte, l’instantané est `unsettled` et Nova peut appeler
`refresh_context`.

Une barre latérale redimensionnable en option émet aussi
`wp-nova:sidebar-resize`. L’événement sort du Custom Element en bubbling et
composed, avec `{ width: number }` dans `detail`. Il est émis après validation
d’un glisser au pointeur et après chaque redimensionnement au clavier.
Enregistrez la largeur limitée et retransmettez-la comme `presentation.width`
pour la conserver lors des appels ultérieurs à `init()`.
