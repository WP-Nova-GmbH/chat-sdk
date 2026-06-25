# Nova Chat SDK Integration Prompt

You are a coding agent integrating the Nova Chat SDK into the website in the current workspace. Implement the integration end to end.

## Task

1. Install the right package for the project style:
   - Plain HTML: use the CDN snippet.
   - React: use `@wp-nova/sdk-react`.
   - Angular: use `@wp-nova/sdk-angular`.
   - Other bundled app: use `@wp-nova/sdk`.
2. Initialize the SDK with a real `publicSurfaceId` and a backend `tokenEndpoint`.
3. Implement the backend token endpoint. It must authenticate the current user server-side and call Nova's embedded-session endpoint with the integration secret.
4. Register at least one useful tool handler wired to the app's real state or DOM.
5. Keep all secrets on the server. Never put integration secrets in browser code.
6. Match the host app's style, framework conventions, and test approach.

## Core API

```ts
import { init, registerToolHandler } from "@wp-nova/sdk";

registerToolHandler("create_ticket", async (args) => {
  return myApp.createTicket(args);
});

init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
});
```

## Token Endpoint Contract

The SDK posts `{ publicSurfaceId, origin }` to your endpoint with credentials included. Your endpoint authenticates the current user and returns Nova's response:

```json
{ "access_token": "<embedded-session token>", "expires_in": 900 }
```

or:

```json
{ "unavailable": true, "email": "user@example.com", "message": "No Nova account for this email." }
```
