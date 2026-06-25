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
| `AUTH_TOKEN` | SDK vers iframe | Envoie un token de session intégrée à courte durée de vie. |
| `AUTH_EXPIRED` | iframe vers SDK | Demande un nouveau token après un 401. |
| `REQUEST_SNAPSHOT` | iframe vers SDK | Demande un contexte visible de page à jour. |
| `CLIENT_TOOL_REQUEST` | iframe vers SDK | Demande une action de navigation intégrée ou un outil enregistré. |
| `CLIENT_TOOL_RESULT` | SDK vers iframe | Renvoie le résultat de l’outil et un instantané frais. |
| `CLIENT_TOOL_ERROR` | SDK vers iframe | Renvoie des détails d’échec typés comme `no_handler` ou `timeout`. |

### Renouvellement du token

Le SDK renouvelle proactivement vers 80 % de `expires_in` et réactivement lorsque l’iframe émet `AUTH_EXPIRED`.

Les échecs de transport sont retentés avec backoff et cooldown. Une réponse utilisateur indisponible est terminale et envoyée à l’iframe sous la forme `UNAVAILABLE`.
