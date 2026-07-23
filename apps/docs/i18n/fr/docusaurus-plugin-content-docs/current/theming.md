---
id: theming
title: Personnalisation visuelle
---

## Personnalisation visuelle

Le SDK gère uniquement le lanceur et le panneau externe. L’iframe gère
l’en-tête du chat et l’interface de conversation, en utilisant les réglages
d’affichage fiables de la surface après authentification. Le mode clair/sombre
de la page hôte est une entrée distincte : il contrôle le mode de couleur de
l’iframe sans remplacer le titre, le logo ou la couleur d’accent de la surface.

Choisissez séparément le titre visible, le logo, la couleur primaire/accent, le
fond du lanceur et le contraste de l’icône. Le nom interne de surface n’est pas
le titre visible du chat.

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  accent: "#9A72F8",
  triggerColor: "#7E54E4",
  triggerColorLight: "#7E54E4",
  triggerColorDark: "#A991F2",
  triggerIconColor: "light",
  theme: "light",
});
```

### Premier rendu

Si l’une des valeurs `accent`, `triggerColor` ou la couleur propre au mode actif
est fournie, le lanceur peut s’afficher aux couleurs de la marque avant la
première réponse de token. Sinon, il reste masqué jusqu’à l’arrivée des données
de thème fiables de la surface depuis l’iframe.

La valeur par défaut du SDK est le violet Nova. Pour un autre produit,
fournissez explicitement sa couleur primaire hexadécimale à six chiffres ; sans
`triggerColor`, le fond du lanceur reprend `accent`.

Utilisez `triggerColorLight` et `triggerColorDark` lorsque le lanceur doit avoir
un contraste différent sur les pages hôtes claires et sombres. La valeur du
mode actif remplace `triggerColor` ; si elle est absente, le SDK utilise
`triggerColor`, puis `accent`. Les intégrations existantes qui ne transmettent
que `triggerColor` restent inchangées. Modifier `theme` ou les couleurs propres
aux modes met le lanceur à jour en direct sans reconstruire l’iframe ni
récupérer de nouveau token.

### Couleur de l’icône du lanceur

`triggerIconColor` accepte `light`, `dark` ou une couleur hexadécimale. Les valeurs invalides sont ignorées et utilisent une valeur par défaut lisible.

### Mode clair/sombre de la page hôte

Transmettez explicitement le mode actuel de l’application hôte :

```ts
const chatConfig = {
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
};

function syncChatTheme(theme: "light" | "dark") {
  init({ ...chatConfig, theme });
}
```

Sans `theme`, le SDK choisit toujours `light`. Il ne lit volontairement pas de
cookie de thème WP Chat et ne déduit pas le mode depuis
`prefers-color-scheme` : l’application hôte est la source de vérité. Lors d’un
changement, rappelez `init` ou mettez à jour la configuration du wrapper
React/Angular. Le SDK envoie `HOST_THEME` à l’iframe existante sans récupérer de
nouveau token ; la route et la conversation sont conservées. Le fond du panneau
et de l’iframe, l’élévation adaptée au mode et une fine bordure sont mis à jour
immédiatement. Cela évite un flash contrasté et maintient le contour du panneau
visible sur un fond hôte de même teinte.
