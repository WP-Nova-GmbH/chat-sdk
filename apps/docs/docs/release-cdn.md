---
id: release-cdn
title: Release & CDN
---

The core SDK build emits:

- `dist/index.js` for ESM imports.
- `dist/index.cjs` for CommonJS consumers.
- `dist/index.d.ts` for TypeScript.
- `dist/index.global.js` for the script-tag CDN artifact.
- `dist/index.global.js.sri` for immutable URL integrity metadata.

## CDN Channels

| Channel | URL | Cache | SRI |
| --- | --- | --- | --- |
| Immutable | `https://chat.wp-nova.ai/sdk/<version>/sdk.js` | Long-lived | Required |
| Rolling | `https://chat.wp-nova.ai/sdk/v1/sdk.js` | No-cache | Not available |

Use the immutable versioned URL for production installs:

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () {
      (w.WpNova.q = w.WpNova.q || []).push(arguments);
    };
    var j = d.createElement(s);
    j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/<version>/sdk.js";
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash for this version>";
    d.head.appendChild(j);
  })(window, document, "script");
</script>
```

The exact version and `integrity` value are published next to the bundle as `/sdk/<version>/sdk.js.sri` and may also be shown in the Nova admin install guide.

## Docs Versions vs npm Versions

Docs selector entries describe the public integration contract, not every npm patch. The `v1.0` docs apply to `@wp-nova/sdk@1.0.x`, `@wp-nova/sdk-react@1.0.x`, and `@wp-nova/sdk-angular@1.0.x`.

Patch npm releases reuse the same docs line unless the integration guidance changes. A new major or minor release that changes documented behavior gets a new docs selector entry.

## Rolling Channel

The rolling `v1` URL is an opt-in convenience:

```html
<script async src="https://chat.wp-nova.ai/sdk/v1/sdk.js"></script>
```

Because the bytes change as releases roll forward, the rolling URL cannot use a stable SRI hash. Use it only when you intentionally want automatic minor updates.

## npm Packages

Bundled apps should install from npm:

```bash
npm install @wp-nova/sdk
```

Framework wrappers install alongside the core package:

```bash
npm install @wp-nova/sdk @wp-nova/sdk-react
npm install @wp-nova/sdk @wp-nova/sdk-angular
```

Pin package versions in your lockfile and upgrade intentionally after reading release notes.
