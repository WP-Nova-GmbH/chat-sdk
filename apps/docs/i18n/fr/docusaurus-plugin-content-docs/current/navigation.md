---
id: navigation
title: Navigation et pages asynchrones
---

Le SDK peut naviguer à partir des liens visibles ou d’un manifeste de routes déclaré par l’application hôte. Après une action sur la page, il attend avant de capturer le snapshot suivant afin que l’agent voie la destination, et non l’écran qu’il vient de quitter.

## Déclarer la topologie du site

Sans `routes`, l’agent ne connaît que les liens visibles dans le snapshot actuel. Déclarez les routes utiles afin qu’il puisse accéder directement à une destination connue.

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/customers", description: "Customer lookup list with search." },
    {
      path: "/customers/:customerId",
      description: "Customer detail; obtain customerId from /customers or list_customers.",
    },
    { path: "/settings/profile", description: "Signed-in user's profile settings." },
  ],
});
```

Règles applicables aux routes :

- Les chemins sont de même origine et commencent par un seul `/` ; les URL
  absolues et les variantes relatives au protocole telles que `//host/path` ou
  `/\host/path` sont rejetées.
- Les chemins en double sont supprimés et au maximum 100 entrées sont transmises.
- Chaque chemin et chaque description doivent respecter la limite Nova de 300 caractères.
- Utilisez des placeholders `:param` dans les modèles. Ne placez jamais de faux identifiants dans le chemin.
- La description indique d’où provient un identifiant réel. L’agent ouvre une route d’index plutôt que d’en inventer un.
- Décrivez l’objectif visible par l’utilisateur, pas des instructions cachées.
- Déclarez uniquement les routes accessibles à l’utilisateur actuel. Filtrez-les par tenant, rôle, module, fonctionnalité et autorisations de ressource.
- Réinitialisez le SDK lorsque l’ensemble des routes accessibles change.
- Les routes ne sont mises à disposition de Nova que si Page Reading est activé sur la surface.

Dans la mesure du possible, construisez le manifeste à partir de constantes de routes centralisées. Une liste de routes copiée manuellement diverge lorsque le routeur évolue ; ajoutez un test de parité pour les routes importantes.

## Préférer les URL et contrôles sémantiques

Nova privilégie un `href` capturé ou une route déclarée, car ils survivent aux nouveaux rendus du DOM. Utilisez de vrais liens pour la navigation et de vrais boutons étiquetés pour les actions.

Un événement de framework placé sur un conteneur non interactif peut être utilisable par une personne tout en restant invisible dans le snapshot de la page. Par exemple, un `onClick` React sur une ligne de tableau n’est pas un contrôle sémantique. Ajoutez un lien ou un bouton étiqueté qui exécute la même action et reste accessible aux technologies d’assistance.

## Connecter un routeur SPA

Avant que le SDK ne modifie une URL de même origine, il émet un événement annulable `wp-nova:navigate`. Interceptez-le une seule fois près de la racine persistante de l’application :

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  const destination = new URL(url, window.location.href);
  if (destination.origin !== window.location.origin) return;

  event.preventDefault();
  router.navigate(`${destination.pathname}${destination.search}${destination.hash}`);
});
```

N’appelez `preventDefault()` que lorsque le routeur accepte la navigation. Sinon, le SDK revient à une navigation normale du document.

Conservez le chemin, la query string et le hash dans leur intégralité. Suivez la destination exacte demandée afin qu’un changement de route sans rapport ne puisse pas satisfaire l’action Nova en attente.

## Comprendre l’attente après une action

À partir de la version 1.0.3, le SDK attend une période sans mutation avant d’effectuer une nouvelle capture après les actions et les outils.

- `quietMs` est la durée requise sans mutation du DOM. Valeur par défaut : `200` ; limitée à `0–1000`.
- `maxWaitMs` est la limite stricte. Valeur par défaut : `1600` ; limitée entre `quietMs` et `5000`.
- Si cette limite est atteinte, le snapshot contient `unsettled: true`. Nova peut appeler `refresh_context` avant de conclure que l’action a échoué.
- Les demandes ordinaires de snapshot liées aux messages utilisateur sont immédiates ; cette attente s’applique à la nouvelle capture après une action.
- L’application hôte peut émettre `wp-nova:settled` pendant une attente en cours pour la terminer plus tôt.

L’absence de mutation du DOM suffit pour les pages synchrones et de nombreuses actions simples côté client. Ce n’est pas un signal fiable pour un routeur qui monte un shell, reste brièvement inactif, puis affiche des données asynchrones.

## Exiger un signal explicite pour les routes asynchrones

La version 1.0.4 du SDK ajoute un mode d’attente de disponibilité pour les navigations de l’application hôte :

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  settle: {
    quietMs: 1000,
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
});
```

Lorsque l’application hôte annule `wp-nova:navigate`, le SDK ignore les périodes transitoires sans mutation du DOM et attend `wp-nova:settled`. Les navigations de document complètes et les résultats d’outils ordinaires continuent d’utiliser le mécanisme normal d’attente. Si aucun signal n’arrive avant la limite, le SDK effectue la capture et marque le résultat comme non stabilisé plutôt que de bloquer la boucle d’outils.

N’émettez l’événement qu’après que :

1. l’emplacement du routeur correspond à la destination demandée ;
2. le composant de destination a été monté ;
3. les données requises pour la route ont été chargées ou ont atteint leur état d’erreur/vide prévu ;
4. la vue rendue est restée prête pendant une courte période continue.

```ts
function signalNovaReady() {
  window.dispatchEvent(new CustomEvent("wp-nova:settled"));
}
```

Le SDK n’écoute que lorsqu’une attente après navigation est en cours. Les signaux envoyés au moment où la navigation est déclenchée ou en dehors de cette période sont ignorés. N’utilisez pas un unique contrôle global « aucune requête en cours » si un polling sans rapport peut le maintenir occupé ; préférez l’état de disponibilité des loaders/requêtes propres à la route.

### React Router avec des requêtes de données

Un adaptateur robuste conserve la destination en attente dans une ref, attend que `useLocation()` lui corresponde, puis observe uniquement les requêtes nécessaires à cette destination. Lorsqu’elles sont prêtes, laissez le rendu final se terminer et émettez `wp-nova:settled`. Nettoyez le polling et les listeners au démontage ainsi que lorsqu’une nouvelle navigation Nova remplace la précédente.

Placez le provider au-dessus du route outlet afin qu’il reste monté pendant toute cette séquence.

Les workflows automatiques peuvent réutiliser la readiness des données de
route, mais `setPageReady` est indépendant de `wp-nova:settled`, qui termine
seulement l’attente de snapshot. Appelez `setPageReady(false)` pendant le
chargement puis `setPageReady(true)` après le rendu ; l’URL doit correspondre exactement au modèle `pageWorkflows`. Voir les
[workflows automatiques de page](./page-workflows.md).

## Après les outils personnalisés

Les outils personnalisés reçoivent eux aussi un snapshot stabilisé après l’action. Après une mutation, attendez l’API, actualisez les données visibles et renvoyez une URL stable. Ne signalez pas l’échec d’une mutation réussie uniquement parce qu’une actualisation ultérieure du cache a échoué. Consultez [Outils et workflows guidés](./tools.md).

## Dépannage

| Symptôme | Cause et correction |
| --- | --- |
| L’URL change, mais le snapshot montre la page précédente | Activez `waitForNavigationSignal` et émettez `wp-nova:settled` après le rendu des données de la route. |
| Chaque navigation attend `maxWaitMs` | Le signal n’est jamais envoyé, est envoyé trop tôt ou la disponibilité surveille des requêtes globales sans rapport. |
| Le snapshot est `unsettled` | La limite stricte a été atteinte. Corrigez la détection de disponibilité ou laissez Nova appeler `refresh_context`. |
| L’outil reçoit `stale_handle` | Le DOM a changé. Capturez/actualisez le contexte et utilisez un handle du snapshot le plus récent, ou préférez une URL. |
| L’utilisateur voit une confirmation pour l’ouverture d’un enregistrement | `open_record` requiert une confirmation par précaution, car sa solution de repli par handle clique dans l’interface hôte. |

## Vérifications dans le navigateur

Testez la navigation directe vers :

- une page statique ;
- une route chargée à la demande ;
- une route avec des données asynchrones ;
- une route de détail utilisant un identifiant observé ;
- une route refusée à un utilisateur restreint ;
- une route dont le loader renvoie un état vide/d’erreur.

Pour chaque navigation acceptée, vérifiez que le snapshot renvoyé contient le contenu chargé de la destination, et pas uniquement la nouvelle URL ou l’ancien écran.
