---
id: dom-access
title: Donner à l’agent l’accès au DOM
---

## Donner à l’agent l’accès au DOM

Nova ne peut pas exécuter de JavaScript arbitraire dans la page hôte. Il utilise
uniquement les instantanés visibles, les actions de page autorisées par la
surface et les outils hôte entièrement enregistrés par le SDK.

### Enregistrer des outils définis par le SDK

```ts
import { registerTool, unregisterTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "set_customer_status",
  description: "Modifie le statut du client visible dans le CRM.",
  inputSchema: {
    type: "object",
    properties: { status: { type: "string" } },
    required: ["status"],
  },
  mutating: true,
  confirmationCopy: "Modifier ce statut client ?",
  handler: async (args) => {
    const status = String(args.status);
    await crm.updateCustomer(status);
    return { ok: true, status };
  },
});

unregisterTool("set_customer_status");
```

L’enregistrement contient nom, description, JSON Schema, indicateur de mutation,
texte de confirmation et handler. La surface conserve seulement l’autorisation
des Page Tools SDK. Les actions intégrées sont `navigate`, `click`,
`open_record`, `set_filter`, `scroll_to` et `refresh_context` ;
`click` et `open_record` sont confirmés. `request_user_input` appartient à
l’iframe et ne s’enregistre jamais dans l’hôte.

### Instantanés de page

Lorsque l’iframe envoie `REQUEST_SNAPSHOT`, le SDK capture la structure visible de la page, le texte, les liens, les contrôles, les libellés, la sélection, les données structurées, les signaux de langue et les handles d’éléments stables. `languageSignals` contient la `locale` hôte normalisée, la langue du document et les langues préférées du navigateur. Les shadow roots fermés, les iframes cross-origin, les zones canvas et les pages trop grandes sont marquées comme partielles ou tronquées.

### Les valeurs de champs sont refusées par défaut

Les valeurs de saisie sont omises sauf si elles sont explicitement autorisées et passent toujours les contrôles de sensibilité.

- Ajoutez `data-wp-nova-include` à un champ ou à un ancêtre.
- Ou transmettez des sélecteurs dans `safeValueSelectors`.
- Les mots de passe, inputs cachés, fichiers, champs de paiement, tokens, secrets et champs sensibles similaires sont toujours exclus.

Utilisez `data-wp-nova-ignore` sur tout sous-arbre que l’assistant ne doit pas voir.

Utilisez de vrais liens/boutons libellés. Un `onClick` React sur une ligne de
table générique peut être invisible dans l’instantané.
