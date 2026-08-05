---
id: tools
title: Outils et workflows guidés
---

Le chat intégré Nova peut utiliser des outils de conversation, des contrôles de page
intégrés, des outils de l’application hôte définis par le SDK et des outils
backend serveur. Ils n’ont ni les mêmes propriétaires ni les mêmes règles de sécurité.

## Catégories d’outils

| Catégorie | Exemples | Propriétaire | Handler côté application hôte ? |
| --- | --- | --- | --- |
| Conversation | `request_user_input` | Iframe/backend Nova | Non. L’iframe affiche la carte de choix et y répond. |
| Contrôle de page intégré | `navigate`, `click`, `open_record`, `set_filter`, `scroll_to`, `refresh_context` | Nova les déclare ; le SDK les exécute | Aucun handler personnalisé. Nécessite Page Navigation. |
| Outil de l’application hôte défini par le SDK | `list_customers`, `create_ticket`, `set_customer_status` | Votre intégration | Oui, enregistré avec la définition complète de l’outil. Nécessite Page Tools. |
| Outil backend | Recherche métier | Serveur/connexion Nova | Aucun handler navigateur ; autorisation côté serveur. |
| Outil serveur Nova | Recherche dans les connaissances ou autres capacités côté Nova | Nova | Aucun handler sur la page hôte. Sa disponibilité dépend de l’agent Nova. |

N’enregistrez ni `request_user_input` ni le nom d’un contrôle de page intégré. Ces noms sont réservés. Les outils du navigateur s’exécutent séquentiellement sur plusieurs tours ; concevez un workflow en plusieurs étapes comme une suite d’appels fondés sur des données réelles, et non comme des opérations navigateur parallèles.

Les outils backend ne sont pas enregistrés avec `registerTool`. Les clés API,
catalogues et `connectionKey`/`toolId`/`contractVersion` restent côté serveur.
Les workflows automatiques utilisent uniquement les outils de recherche en
lecture seule ; les écritures restent des actions de chat confirmées. Voir les
[workflows automatiques de page](./page-workflows.md).

## Contrôles de page intégrés

Lorsque Page Navigation est activé, Nova peut proposer les actions suivantes :

| Action | Comportement | Confirmation |
| --- | --- | --- |
| `navigate` | Ouvre une URL de même origine, de préférence issue des routes déclarées ou d’un href capturé. | Non |
| `click` | Clique sur un contrôle visible à l’aide du handle le plus récent. | Oui ; un contrôle arbitraire peut effectuer une mutation. |
| `open_record` | Ouvre un enregistrement visible à l’aide d’une URL durable ou du handle actuel. | Oui ; la solution de repli peut cliquer dans l’interface hôte. |
| `set_filter` | Met à jour un contrôle de recherche/filtre visible et émet des événements input/change. | Non |
| `scroll_to` | Fait défiler la page jusqu’à un handle actuel. | Non |
| `refresh_context` | Capture un nouveau snapshot de la page sans la modifier. | Non |

`highlight` est réservé par le protocole du SDK, mais n’est actuellement pas proposé comme capacité de l’agent. Ne concevez pas de workflow qui en dépend.

L’agent préfère les URL aux handles d’éléments, car les URL survivent aux nouveaux rendus en arrière-plan. Les handles appartiennent uniquement au snapshot le plus récent.

## Enregistrer un outil défini par le SDK

Regroupez le contrat destiné à l’agent et son implémentation :

```ts
import { registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description:
    "Creates a support ticket after the customer and title have been resolved.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      customerId: { type: "string", description: "Stable customer UUID." },
      title: { type: "string", minLength: 1 },
      priority: { type: "string", enum: ["low", "normal", "high"] },
    },
    required: ["customerId", "title"],
  },
  mutating: true,
  confirmationCopy: "Create this support ticket?",
  handler: async (args, { signal } = {}) => {
    const result = validateCreateTicket(args);
    if (!result.ok) {
      return {
        ok: false,
        code: "validation_error",
        message: result.message,
        issues: result.issues,
      };
    }

    const ticket = await crm.createTicket(result.value, { signal });
    return {
      ok: true,
      ticketId: ticket.id,
      url: `/tickets/${ticket.id}`,
    };
  },
});
```

Le paramètre Page Tools de la surface détermine si Nova accepte la définition enregistrée. Nova valide à nouveau la spécification et sa classification de mutation fait autorité pour l’étape de confirmation dans l’iframe.

## Limites des définitions

Une définition doit satisfaire à la fois la validation du SDK et celle de Nova :

- Le nom commence par une lettre minuscule et ne contient que des lettres minuscules, des chiffres et des underscores.
- Les noms intégrés sont réservés.
- La description est explicite et comporte au moins 20 caractères ; Nova en accepte au maximum 2,000.
- `inputSchema` est un objet JSON Schema simple, d’au plus 16 KiB, profond de 8 niveaux au maximum et contenant au plus 500 clés d’objet.
- `mutating` est un booléen explicite.
- Un outil avec mutation possède un `confirmationCopy` destiné à l’utilisateur (500 caractères au maximum).
- Un tour de surface accepte au plus 50 outils définis par le SDK.
- Les arguments et résultats des handlers peuvent être sérialisés en JSON ; gardez les résultats nettement sous la limite Nova de 32 KiB par résultat d’outil.

Préférez des schémas simples et compatibles avec les fournisseurs. Certains fournisseurs de modèles rejettent les combinaisons complexes de `anyOf`/`oneOf` au niveau racine dans les déclarations de fonctions. Décrivez les exigences entre champs dans la description, effectuez si nécessaire une courte validation préalable et validez toujours les règles conditionnelles dans le handler.

## Concevoir d’abord les outils de recherche en lecture seule

Un outil dédié en lecture seule est plus fiable que de demander à l’agent de parcourir une interface paginée ou virtualisée pour découvrir des identifiants.

Les bons outils de recherche :

- utilisent le même service tenant compte des autorisations que l’interface du produit ;
- acceptent un terme de recherche de longueur limitée ;
- renvoient des identifiants machine stables séparément des libellés d’affichage localisés ;
- incluent les valeurs dépendantes valides, par exemple les catégories disponibles pour un fournisseur ;
- renvoient des URL stables de même origine lorsque les enregistrements peuvent être ouverts ;
- limitent les résultats et renvoient `truncated: true` lorsque d’autres correspondances existent ;
- décrivent précisément quand l’agent doit les appeler.

```ts
registerTool({
  name: "list_customers",
  description:
    "Authoritative customer lookup for the signed-in user. Use before a workflow needs a customer id; refine when results are truncated.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      search: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
  mutating: false,
  handler: async ({ search }, { signal } = {}) => {
    const matches = await crm.searchCustomers(String(search ?? ""), { signal });
    return {
      customers: matches.slice(0, 12).map((customer) => ({
        id: customer.id,
        label: customer.displayName,
        description: customer.address,
        url: `/customers/${customer.id}`,
      })),
      truncated: matches.length > 12,
    };
  },
});
```

Si l’outil renvoie entre deux et douze candidats fondés sur des données réelles et qu’un choix est nécessaire, Nova peut utiliser `request_user_input` pour afficher une carte de choix intégrée. Un seul candidat valide peut généralement être sélectionné automatiquement. Plus de douze résultats ou des résultats incomplets doivent déclencher une recherche plus précise ou une demande de texte libre, et non une liste inventée ou présentée à tort comme exhaustive.

## Sécuriser la poursuite des workflows avec mutation

Pour un handler de mutation :

1. Vérifiez à nouveau le périmètre des autorisations/du tenant et validez les arguments ainsi que les règles métier actuelles.
2. Résolvez les noms en identifiants stables ; n’utilisez jamais les positions de lignes ou les handles de page comme identifiants métier.
3. Respectez l’`AbortSignal` facultatif et appelez le service/mappeur habituel de l’application.
4. Renvoyez les erreurs attendues sous forme de données structurées ; ne levez que les erreurs inattendues.
5. En cas de réussite, actualisez les données visibles et renvoyez une URL stable.

L’iframe gère la confirmation ; n’ajoutez pas une autre boîte de dialogue. Le SDK déduplique les appels réémis avec la même clé d’idempotence Nova, mais les API critiques doivent elles aussi être idempotentes. Si la création réussit et que seule l’actualisation du cache échoue, renvoyez une réussite afin d’éviter une nouvelle tentative en double.

## Renvoyer des erreurs exploitables

Modélisez explicitement les résultats attendus :

```ts
type ToolFailure =
  | { ok: false; code: "forbidden"; message: string }
  | { ok: false; code: "not_found"; message: string; candidates?: Candidate[] }
  | { ok: false; code: "ambiguous"; message: string; candidates: Candidate[] }
  | { ok: false; code: "validation_error"; message: string; issues: FieldIssue[] }
  | { ok: false; code: "conflict"; message: string };
```

Limitez la longueur des messages, omettez les secrets et dumps internes, et indiquez si une nouvelle tentative nécessite une nouvelle entrée, une recherche actualisée ou une action de l’utilisateur.

## Enregistrer uniquement ce que l’utilisateur est autorisé à utiliser

L’enregistrement d’un outil expose une capacité. Protégez chaque outil avec les mêmes contrôles de rôle, de ressource, de client, de module et de fonctionnalité que l’action correspondante dans l’interface.

Désenregistrez les outils lors des changements d’autorisation et au démontage. Consultez le [guide React](./react.md) pour des définitions et hooks stables.

## Matrice de vérification

Testez au minimum :

| Scénario | Résultat attendu |
| --- | --- |
| Activation ou autorisation désactivée | L’outil est absent et l’utilisation directe de l’API est refusée. |
| La recherche renvoie 1 / 2–12 / des résultats tronqués | L’agent sélectionne l’unique correspondance, demande un choix fondé sur des données réelles ou affine la recherche. |
| Entrée invalide ou conflictuelle | Aucune mutation ; les indications structurées sur les champs/candidats sont conservées. |
| Mutation acceptée ou refusée | L’iframe demande une seule confirmation ; le handler ne s’exécute qu’après acceptation. |
| Handler manquant, expiré ou interrompu | Erreur typée et exploitable ; aucun effet de bord tardif n’est lancé. |
| Réussite | Les données d’interface concernées sont actualisées et le résultat contient une URL stable de même origine. |
