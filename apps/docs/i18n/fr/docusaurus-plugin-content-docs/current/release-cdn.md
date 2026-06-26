---
id: release-cdn
title: Publication et CDN
---

## Publication et CDN

Le build du SDK cœur émet :

- `dist/index.js` pour les imports ESM.
- `dist/index.cjs` pour les consommateurs CommonJS.
- `dist/index.d.ts` pour TypeScript.
- `dist/index.global.js` pour l’artefact CDN de balise script.
- `dist/index.global.js.sri` pour les métadonnées d’intégrité des URL immuables.

### Canaux

| Canal | URL | Cache | SRI |
| --- | --- | --- | --- |
| Immuable | `https://chat.wp-nova.ai/sdk/<version>/sdk.js` | longue durée | requis |
| Rolling | `https://chat.wp-nova.ai/sdk/v1/sdk.js` | no-cache | non disponible |

Le canal rolling est une facilité opt-in. L’URL versionnée immuable reste la recommandation par défaut pour les installations en production.

### Versions de documentation et versions npm

Les entrées du sélecteur de documentation décrivent le contrat d’intégration public, pas chaque patch npm. La documentation `v1.0` s’applique à `@wp-nova/sdk@1.0.x`, `@wp-nova/sdk-react@1.0.x` et `@wp-nova/sdk-angular@1.0.x`.

Les patch releases npm réutilisent la même ligne de documentation sauf si les consignes d’intégration changent. Une nouvelle release majeure ou mineure qui modifie le comportement documenté reçoit une nouvelle entrée dans le sélecteur.
