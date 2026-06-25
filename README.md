# Nova Chat SDK

Monorepo for the Nova Chat SDK npm packages and Docusaurus documentation host.

## Workspaces

- `apps/docs` - Docusaurus documentation site.
- `packages/chat-sdk` - core browser SDK published as `@wp-nova/sdk`.
- `packages/react` - React wrapper published as `@wp-nova/sdk-react`.
- `packages/angular` - Angular wrapper published as `@wp-nova/sdk-angular`.
- `packages/typescript-config` - internal shared TypeScript presets.
- `examples/*` - framework-specific integration examples.

## Commands

```bash
npm install
npm run build
npm run check-types
npm run lint
npm test
```

## Browser Examples

Build the SDK packages once, then start either example app:

```bash
npm --workspace @wp-nova/sdk run build
npm --workspace @wp-nova/sdk-react run build
npm --workspace @wp-nova/sdk-angular run build
```

React, on `http://127.0.0.1:4311`:

```bash
NOVA_API_URL=http://localhost:8400 \
NOVA_INTEGRATION_SECRET="<surface integration secret>" \
NOVA_TEST_EMAIL="react-operator@example.com" \
VITE_NOVA_PUBLIC_SURFACE_ID="<surface public id>" \
VITE_NOVA_BASE_URL=http://localhost:5173 \
npm --workspace @wp-nova/chat-sdk-example-react run dev
```

Angular, on `http://127.0.0.1:4312`:

```bash
NOVA_API_URL=http://localhost:8400 \
NOVA_INTEGRATION_SECRET="<surface integration secret>" \
NOVA_TEST_EMAIL="angular-concierge@example.com" \
VITE_NOVA_PUBLIC_SURFACE_ID="<surface public id>" \
VITE_NOVA_BASE_URL=http://localhost:5173 \
npm --workspace @wp-nova/chat-sdk-example-angular run dev
```

Both examples mount chat automatically when a surface id is available. They also
accept `?surface=surf_...&baseUrl=http://localhost:5173`.
