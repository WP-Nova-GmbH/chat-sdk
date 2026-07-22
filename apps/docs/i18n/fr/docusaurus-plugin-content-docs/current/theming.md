---
id: theming
title: Personnalisation visuelle
---

## Personnalisation visuelle

Le SDK gère uniquement le lanceur et le panneau externe. L’iframe gère l’en-tête du chat et l’interface de conversation, en utilisant les réglages d’affichage fiables de la surface après authentification.

Choisissez séparément le titre visible, le logo, la couleur primaire/accent, le
fond du lanceur et le contraste de l’icône. Le nom interne de surface n’est pas
le titre visible du chat.

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  accent: "#9A72F8",
  triggerColor: "#7E54E4",
  triggerIconColor: "light",
});
```

### Premier rendu

Si `accent` ou `triggerColor` est fourni, le lanceur peut s’afficher aux couleurs de la marque avant la première réponse de token. Sinon, le lanceur reste masqué jusqu’à l’arrivée des données de thème fiables de la surface depuis l’iframe.

La valeur par défaut du SDK est le violet Nova. Pour un autre produit,
fournissez explicitement sa couleur primaire hexadécimale à six chiffres ; sans
`triggerColor`, le fond du lanceur reprend `accent`.

### Couleur de l’icône du lanceur

`triggerIconColor` accepte `light`, `dark` ou une couleur hexadécimale. Les valeurs invalides sont ignorées et utilisent une valeur par défaut lisible.
