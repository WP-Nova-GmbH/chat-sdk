# Aurora Helpdesk — React release example

A standalone React host app that installs the **released** npm packages
[`@wp-nova/chat-sdk`](https://www.npmjs.com/package/@wp-nova/chat-sdk) and
[`@wp-nova/chat-sdk-react`](https://www.npmjs.com/package/@wp-nova/chat-sdk-react)
and follows the [React integration docs](https://chat.wp-nova.ai/react).

Unlike the apps under `examples/`, this project lives **outside** the monorepo
workspaces, so `npm install` pulls the packages from the npm registry exactly as
an external consumer would — it does not link the local `packages/*` source.

## What it demonstrates

- `NovaChatProvider` mounted once at the app root with a `config` and stable
  `tools` prop (docs: _Registering Tools with Definitions_).
- `useNovaTool` in a feature component (`CreateTicketTool`) that unregisters on
  unmount (docs: _Registering Tools with a Hook_).
- `enabled` gating so chat only mounts when a surface id is configured.
- A server-side token endpoint (`POST /api/nova-token`) implemented as a Vite dev
  middleware that keeps the integration secret on the server.
- DOM privacy: a `safeValueSelectors` opt-in field (`#case-reference`), an ignored
  region (`data-wp-nova-ignore`), and `data-ai-context` facts.

## Run it

```bash
npm install
cp .env.example .env   # fill in your surface id + token endpoint values
npm run dev            # http://127.0.0.1:4321
```

The launcher mounts as soon as `VITE_NOVA_PUBLIC_SURFACE_ID` is set. Token minting
needs the server-side `.env` values (`NOVA_TOKEN_BASE_URL`,
`NOVA_INTEGRATION_SECRET`, `NOVA_TEST_EMAIL`) and the surface's allowed-origins
list to include `http://127.0.0.1:4321`.

## Build

```bash
npm run build   # tsc --noEmit && vite build
```
