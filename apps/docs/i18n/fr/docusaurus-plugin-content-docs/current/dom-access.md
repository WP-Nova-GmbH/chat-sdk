---
id: dom-access
title: Donner à l’agent l’accès au DOM
---

## Donner à l’agent l’accès au DOM

Nova ne peut pas exécuter de JavaScript arbitraire dans la page hôte. Il peut uniquement demander les capacités exposées par le SDK via les instantanés de page, les actions de navigation intégrées et les handlers d’outils que vous enregistrez.

### Enregistrer des handlers d’outils

```ts
import { registerToolHandler, unregisterToolHandler } from "@wp-nova/chat-sdk";

registerToolHandler("set_customer_status", async (args) => {
  const customerId = String(args.customerId);
  const status = String(args.status);
  await crm.updateCustomer(customerId, { status });
  return { ok: true, customerId, status };
});

unregisterToolHandler("set_customer_status");
```

L’ensemble des outils que l’agent peut demander est déclaré côté serveur sur la surface intégrée. L’enregistrement dans le navigateur fournit seulement les callbacks d’exécution correspondants.

### Instantanés de page

Lorsque l’iframe envoie `REQUEST_SNAPSHOT`, le SDK capture la structure visible de la page, le texte, les liens, les contrôles, les libellés, la sélection, les données structurées et les handles d’éléments stables. Les shadow roots fermés, les iframes cross-origin, les zones canvas et les pages trop grandes sont marquées comme partielles ou tronquées.

### Les valeurs de champs sont refusées par défaut

Les valeurs de saisie sont omises sauf si elles sont explicitement autorisées et passent toujours les contrôles de sensibilité.

- Ajoutez `data-wp-nova-include` à un champ ou à un ancêtre.
- Ou transmettez des sélecteurs dans `safeValueSelectors`.
- Les mots de passe, inputs cachés, fichiers, champs de paiement, tokens, secrets et champs sensibles similaires sont toujours exclus.

Utilisez `data-wp-nova-ignore` sur tout sous-arbre que l’assistant ne doit pas voir.
