---
id: security
title: Sécurité et permissions
---

## Sécurité et permissions

Le SDK est conçu autour d’une limite de confiance navigateur étroite.

- Le navigateur ne reçoit jamais le secret d’intégration Nova.
- Le SDK poste des messages uniquement vers l’origine exacte de l’iframe.
- Les frames entrantes doivent correspondre à la fois à `event.origin` et `event.source`.
- Les erreurs d’outils sont des frames typées explicites, pas des résultats vides silencieux.
- La classification des outils mutateurs est côté serveur ; le SDK exécute seulement les requêtes approuvées.
- Les valeurs de champs sont refusées par défaut et les contrôles de sensibilité ne peuvent pas être contournés par des sélecteurs opt-in.

### Responsabilités de l’endpoint de token

Votre backend doit authentifier l’utilisateur courant avec sa propre session.
Validez le Public Surface ID demandé ainsi que l’origine du corps et l’en-tête
`Origin` réel par rapport à la configuration de l’app. Appelez Nova avec un
secret serveur et un timeout, ajoutez `Cache-Control: no-store` et transmettez
intégralement la réponse de token ou d’utilisateur indisponible.

La réponse utilisateur indisponible peut contenir une autorisation
`access_request_token` limitée à la création d’une demande d’accès et à la lecture
de son statut ; elle n’authentifie aucune API de chat. Transmettez également
`message_is_custom` sans modification : `false` permet à l’iframe de traduire le
texte intégré de Nova, tandis que `true` conserve le texte de surface rédigé par
un administrateur.

Ne faites pas confiance à une adresse e-mail ou à un identifiant utilisateur fourni par le navigateur pour émettre un token.

Le fetch du SDK contient les cookies mais pas l’en-tête Bearer propre à l’app.
Une SPA Bearer doit créer, via un endpoint protégé séparé, une courte session
opaque `HttpOnly`, résolue par l’endpoint de token puis révoquée au logout.

### Permissions des outils

Le code SDK déclare les outils complets via `registerTool` ; la surface ne
conserve qu’un interrupteur d’autorisation Page Tools. Nova valide la définition
et décide côté serveur si la confirmation iframe est requise. N’enregistrez un
outil que lorsque l’utilisateur peut exécuter l’action UI/API sous-jacente.
L’autorisation backend reste obligatoire.

### CSP et framing

La route de l’iframe Nova doit pouvoir être affichée dans une frame par les origines clientes autorisées. Le déploiement fronto actuel garde `/sdk/v1/sdk.js` sans cache, tandis que les URL SDK immuables sont durables et adaptées au SRI.
