---
id: planning
title: Planifier votre intégration
---

Une intégration fiable commence par des décisions sur le produit, la sécurité et la navigation. Consignez-les avant de commencer à coder.

## Fiche de préparation de l’intégration

| Décision | Questions à trancher | Où est-elle implémentée ? |
| --- | --- | --- |
| Utilisateurs et périmètre | Quels utilisateurs, rôles, tenants, modules, routes et environnements ont accès au chat ? | Appartenance à la surface, état `enabled` du SDK et enregistrement conditionnel des outils et routes. |
| Authentification de l’application hôte | L’application utilise-t-elle une session par cookie de même origine ou un jeton bearer conservé dans le navigateur ? Où le backend obtient-il l’adresse e-mail fiable ? | Endpoint de jeton du backend client ; les applications bearer peuvent nécessiter l’amorçage d’un cookie. |
| Origines | Quelles origines exactes de production, de préproduction et locales chargent le SDK ? | `allowedOrigins` de la surface et validation de l’origine par le backend. |
| Lecture de la page | L’agent doit-il voir la page actuelle ? Quelles valeurs sont sûres et quelles zones doivent être exclues ? | Page Reading de la surface, `data-wp-nova-include`, `safeValueSelectors` et `data-wp-nova-ignore`. |
| Contrôle de page intégré | L’agent doit-il naviguer, ouvrir des enregistrements, cliquer sur des contrôles, définir des filtres ou faire défiler la page ? | Page Navigation de la surface, manifeste des routes, contrôles DOM sémantiques et adaptateur de navigation SPA. Page Navigation dépend de Page Reading. |
| Outils personnalisés | Quelles API ou quels workflows de l’application justifient des outils dédiés, en lecture seule ou avec mutation ? | Activation Page Tools de la surface, définitions `registerTool` du SDK et handlers. |
| Choix guidés | Quels workflows exigent que l’agent choisisse parmi des clients, des fournisseurs, des catégories ou d’autres options dynamiques ? | Outils de recherche en lecture seule qui renvoient un nombre limité de choix ; Nova affiche `request_user_input` dans l’iframe. |
| Routes du site | L’agent doit-il connaître des routes qui ne sont pas visibles sur la page actuelle ? Quels rôles peuvent atteindre chaque route et d’où proviennent les identifiants des paramètres ? | `SdkConfig.routes`, filtré pour l’utilisateur connecté. |
| Préparation de la SPA | La navigation attend-elle des loaders, des requêtes, des chunks chargés à la demande ou des transitions ? Qu’est-ce qui prouve que la destination est prête ? | `wp-nova:navigate`, `settle.waitForNavigationSignal` et `wp-nova:settled`. |
| Apparence | Quels sont le titre visible, la couleur principale/d’accent, la couleur du lanceur, la couleur de l’icône et le logo ? | Paramètres d’affichage de la surface et configuration SDK sûre pour le navigateur au premier affichage. |
| Voix | L’intégration doit-elle proposer le mode vocal et la Permissions Policy de l’hôte autorise-t-elle l’iframe à utiliser le microphone ? | `voiceMode` et `Permissions-Policy`. |
| Cycle de vie du montage | Où se trouve le shell persistant de l’application ? Quand le chat doit-il être désactivé ou détruit ? | Provider/composant racine ; ne le remontez pas lors des changements de route SPA ordinaires. |
| Vérification | Quels utilisateurs associés ou non, rôles, routes, outils et pages sensibles couvrent les risques réels ? | Tests automatisés et matrice de tests de bon fonctionnement dans le navigateur. |

## Choisir les capacités indépendamment

| Capacité | Ce qu’elle fournit | Paramètre de surface requis |
| --- | --- | --- |
| Visible Page Snapshot | Texte visible, liens, contrôles, valeurs sûres et contexte de la route actuelle. | Page Reading |
| Contrôle de page intégré | Navigation de même origine, ouverture/clic sur des contrôles visibles, filtres, défilement et actualisation du contexte. | Page Reading + Page Navigation |
| Outils de page définis par le SDK | Appels dédiés aux API de l’application hôte, tels que `list_customers` ou `create_ticket`. | Page Tools |

Les outils du SDK sont déclarés dans l’intégration hôte ; Page Tools est le coupe-circuit au niveau de la surface. N’activez que les capacités nécessaires au produit.

## Choisir le mode d’authentification

Le SDK appelle `tokenEndpoint` avec `credentials: "include"` ; il n’hérite pas d’un jeton bearer de l’application hôte et ne reçoit pas le secret d’intégration Nova.

### Application hôte authentifiée par cookie

Authentifiez `tokenEndpoint` avec la session de même origine existante, lisez l’adresse e-mail fiable et transmettez la requête Nova `POST /embed/session`. Consultez le [guide de démarrage](./quickstart.md).

### SPA authentifiée par bearer

Pour les applications authentifiées par bearer, créez une passerelle de session serveur de courte durée :

1. L’application appelle un endpoint d’amorçage protégé avec son jeton bearer existant.
2. Le backend identifie l’utilisateur fiable, ne conserve que l’identité minimale nécessaire à Nova et définit un cookie `HttpOnly` opaque.
3. Le SDK appelle le `tokenEndpoint` de même origine ; le backend résout le cookie opaque et appelle Nova avec le secret d’intégration réservé au serveur.
4. La déconnexion révoque la session de passerelle et supprime le cookie.

Utilisez un identifiant de session aléatoire, un stockage partagé pour plusieurs réplicas, une expiration limitée, `Cache-Control: no-store` et un cookie `HttpOnly` avec un chemin restreint, une politique `SameSite` adaptée et `Secure` sous HTTPS. Dans les deux cas, validez l’identifiant de surface configuré ainsi que les origines du corps et de l’en-tête. Ne faites jamais confiance à une identité fournie par le navigateur et ne transmettez pas arbitrairement des surfaces ou des origines.

## Déterminer ce qui relève des routes, du DOM ou d’un outil

- Déclarez une **route** lorsque l’agent doit savoir qu’une page existe et pouvoir y accéder directement.
- Exposez un **lien ou bouton** sémantique lorsque l’utilisateur peut déjà effectuer l’action dans l’interface visible.
- Ajoutez un **outil** en lecture seule pour une recherche, une consultation, une validation ou une pagination faisant autorité, ou pour des données masquées par la virtualisation.
- Ajoutez un **outil** avec mutation pour un workflow métier validé qui doit passer par les services et contrôles d’autorisation habituels de l’application.

Les handlers de clic sur un simple conteneur peuvent ne pas apparaître dans les snapshots ; exposez de vrais liens ou boutons étiquetés.

Pour une mutation impliquant des choix dynamiques, associez les outils :

1. Un outil de recherche en lecture seule renvoie les identifiants stables actuels, les libellés, les valeurs dépendantes et l’état de troncature.
2. Nova utilise `request_user_input` lorsque plusieurs candidats fondés sur des données réelles subsistent.
3. La mutation accepte des valeurs stables, les valide à nouveau, utilise la confirmation dans l’iframe et renvoie une URL stable.

Consultez [Outils et workflows guidés](./tools.md) pour des contrats concrets.

## Vérifications finales de conception

- Construisez les routes à partir des constantes du routeur, filtrez-les selon les autorisations de l’interface et traitez-les comme du contexte plutôt que comme une autorisation. Consultez [Navigation](./navigation.md).
- Examinez les familles de pages sensibles, pas seulement un écran, et ignorez les sous-arbres privés entiers. N’autorisez explicitement que les valeurs sûres requises.
- Définissez la véritable couleur principale/d’accent du produit et le contraste de l’icône au premier affichage ; les paramètres authentifiés de la surface restent prioritaires. Consultez [Personnalisation du thème](./theming.md).

## Critères de finalisation

Une intégration est prête lorsque :

- les utilisateurs associés/non associés, les origines exactes et les secrets réservés au serveur se comportent correctement ;
- le chat persiste entre les routes, son accès est révoqué à la déconnexion et son apparence correspond au produit hôte ;
- les routes et outils respectent les autorisations, tandis que le backend continue de les faire appliquer ;
- la navigation asynchrone renvoie le contenu chargé plutôt qu’un snapshot obsolète ;
- les recherches fondent les choix sur des données réelles, les mutations demandent une seule confirmation et les erreurs sont structurées ;
- les tests de confidentialité, la vérification des types, les tests automatisés, le build et les tests de bon fonctionnement dans le navigateur réussissent.
