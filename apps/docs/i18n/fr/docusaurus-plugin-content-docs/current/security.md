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

Votre backend doit authentifier l’utilisateur courant avec votre propre session. Il doit appeler Nova avec un secret côté serveur et renvoyer soit la réponse de token, soit la réponse utilisateur indisponible.

Ne faites pas confiance à une adresse e-mail ou à un identifiant utilisateur fourni par le navigateur pour émettre un token.

### CSP et framing

La route de l’iframe Nova doit pouvoir être affichée dans une frame par les origines clientes autorisées. Le déploiement fronto actuel garde `/sdk/v1/sdk.js` sans cache, tandis que les URL SDK immuables sont durables et adaptées au SRI.
