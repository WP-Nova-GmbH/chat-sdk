# Meridian Billing — plain HTML / script-tag release example

A static host page that loads the **released** Nova Chat SDK global build with a
pinned URL and Subresource Integrity, following the
[Quickstart › Script Tag](https://chat.wp-nova.ai/quickstart) and
[Release & CDN](https://chat.wp-nova.ai/release-cdn) docs. No bundler is used for
the app itself — the page is plain HTML and the SDK loads via `<script>`.

## What it demonstrates

- The documented queued `WpNova(...)` snippet, so `registerTool`/`init` run before
  the SDK file finishes loading and replay in order.
- A pinned, integrity-checked script tag (`crossorigin="anonymous"` + `integrity`).
- `WpNova("registerTool", ...)` (the current API — not the deprecated
  `registerToolHandler`) and `WpNova("init", ...)`.
- DOM privacy: an opted-in value (`#current-balance` via `data-wp-nova-include`),
  a sensitive account number left default-deny, an ignored region
  (`data-wp-nova-ignore`), and `data-ai-context` facts.

## Serving the released bundle locally

In production the script tag points at the hosted CDN:

```html
j.src = "https://chat.wp-nova.ai/sdk/1.0.0/sdk.js";
```

This example installs `@wp-nova/chat-sdk` from npm and self-hosts the **identical**
`dist/index.global.js` at the same `/sdk/1.0.0/sdk.js` path (see `vite.config.ts`),
so the `integrity` hash validates byte-for-byte without depending on the hosted
CDN. The dev server fails loudly if the bundle and its `.sri` ever disagree.

Vite here is only a static file server + token-endpoint stand-in; the page does
not import any npm module.

## Run it

```bash
npm install
cp .env.example .env   # fill in the server-side token values
npm run dev            # http://127.0.0.1:4323
```

The surface id and iframe host come from `.env`
(`VITE_NOVA_PUBLIC_SURFACE_ID`, `VITE_NOVA_BASE_URL`) or from query params, e.g.
`http://127.0.0.1:4323/?surface=surf_...&baseUrl=http://localhost:5173`.

## Build

```bash
npm run build   # emits a static site under dist/, including dist/sdk/1.0.0/sdk.js
```
