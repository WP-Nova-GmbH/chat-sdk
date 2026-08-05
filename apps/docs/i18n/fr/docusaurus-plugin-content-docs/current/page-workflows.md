---
id: page-workflows
title: Workflows automatiques de page
---

Les workflows automatiques de page lancent une exécution limitée
`research-and-compose` lorsqu’une page correspondante est ouverte et prête.
Ils sont déclenchés par l’hôte et restent liés à l’URL courante.

## Configurer un workflow

Ajoutez `pageWorkflows` avec `routes` et `locale` dans la configuration
`init` :

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  locale: "fr-FR",
  pageWorkflows: [
    {
      id: "summarize-call-intervention",
      path: "/call-center/interventions/:interventionId",
      execution: {
        mode: "research-and-compose",
        availableBackendTools: [
          { connectionKey: "telect", toolId: "call_intervention_history", contractVersion: "2" },
          { connectionKey: "telect", toolId: "call_intervention_callbacks", contractVersion: "2" },
          { connectionKey: "telect", toolId: "call_intervention_operational_context", contractVersion: "2" },
        ],
      },
      requiredTools: [
        {
          id: "intervention_context",
          tool: { location: "backend", connectionKey: "telect", toolId: "call_intervention_context", contractVersion: "4" },
          inputs: { interventionId: { kind: "path", parameter: "interventionId" } },
          outputAssertions: [
            { pointer: "/intervention/id", operator: "nonEmpty" },
            { pointer: "/version", operator: "equals", value: 4 },
            { pointer: "/evidenceRevision", operator: "exists" },
            { pointer: "/ready", operator: "equals", value: true },
          ],
        },
      ],
      prompt: "Rédigez une brève passation pour l’intervention chargée. Citez les preuves avec [source:s1] et n’inventez aucun détail.",
    },
  ],
});
```

`PageWorkflowDefinition` contient `id`, le `path` exact, `prompt` et
`execution.mode: "research-and-compose"`. Un `:param` consomme un seul segment
de chemin. Les `requiredTools` fournissent des preuves déterministes. Leurs
résultats doivent respecter le schéma de sortie déclaré ; les outils requis
doivent être non mutateurs. Ils peuvent
référencer un outil `site` ou `backend`. Les paramètres utilisent une liaison de
chemin (`{ kind: "path", parameter }`) ou une valeur littérale. Les résultats
sont vérifiés avec des pointeurs RFC 6901 et les opérateurs `exists`, `nonEmpty`
ou `equals`.

## Readiness et cycle de vie

Un workflow démarre seulement lorsque l’URL courante, `setPageReady(true)`,
le panneau ouvert, l’authentification et la capacité iframe `page-workflows`
sont compatibles. Pendant le chargement, appelez `setPageReady(false)`, puis
`setPageReady(true)` après le rendu de la route et de ses données. Le SDK lie
la readiness à l’URL courante. Avec React, la méthode vient de `useNovaChat()`.

Pour une navigation SPA, l’hôte traite `wp-nova:navigate` et émet
`wp-nova:settled` après la disponibilité de l’URL, du composant et des données.
Ce signal ne termine que l’attente de snapshot après navigation ; la readiness
du workflow est définie séparément avec `setPageReady(true)`.
Réaffirmez aussi la readiness quand le chat est ouvert après le chargement de
la page. Une autre URL remplace l’essai local lorsque l’hôte réaffirme sa
readiness ; une exécution serveur commencée peut continuer. Un rafraîchissement
sur la même URL conserve une exécution déjà commencée. Les statuts sont `started`, `cached`,
`completed`, `failed` et `skipped`.

## Outils backend et sources

Les outils backend s’exécutent côté serveur. Créez, testez et administrez la
connexion dans Nova ; les clés API et les éventuels `backendToolGrants` restent
sur le serveur et aucun handler n’est enregistré dans la page.
`availableBackendTools` ne doit lister que les outils de recherche en lecture
seule. Les outils d’écriture doivent rester des actions de chat explicitement
confirmées. Les permissions sont vérifiées lors de l’émission du grant puis à
l’exécution.

Les résultats peuvent contenir des sources :

```ts
{ sources: [{ id: "internal-source-id", label: "Call record", description: "Current application record", observedAt: "2026-08-05T10:30:00Z" }] }
```

Nova remplace les IDs internes par des références locales sûres comme
`[source:s1]`. Une erreur d’outil de recherche optionnel devient une limitation,
tandis qu’une preuve requise échoue fermement. L’UI actuelle peut supprimer
les marqueurs ou ne pas afficher de puces de sources. Indiquez les preuves
manquantes et ne promettez pas de puces. Voir la [référence API](./api-reference.md).

## Limites

Le SDK accepte au plus 20 workflows, 10 outils requis par workflow et 16 outils
backend disponibles. Les IDs commencent par une lettre, les prompts contiennent
1 à 8 000 caractères et les chemins commencent par `/`, sans query ni hash. Les
définitions invalides ou qui se chevauchent sont signalées puis ignorées.
Filtrez workflows, routes et outils selon les permissions de l’utilisateur.
Les sources ne doivent contenir ni clés API, ni identifiants de fournisseur, ni
payloads d’outils non bornés.
