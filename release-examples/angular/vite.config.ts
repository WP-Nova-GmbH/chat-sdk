import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { type ConfigEnv, defineConfig, loadEnv, type Plugin } from "vite";

// This example installs @wp-nova/chat-sdk from the npm registry and the
// @wp-nova/chat-sdk-angular wrapper from a vendored release tarball (see
// package.json). Angular templates are compiled with the JIT compiler at
// runtime (main.ts imports "@angular/compiler"), so no Angular build plugin is
// needed. Vite also exposes the documented server-side token endpoint as a dev
// middleware so the integration secret never reaches the browser.

const EXAMPLE_ROOT = fileURLToPath(new URL(".", import.meta.url));

interface ExampleEnv {
    integrationSecret: string;
    tokenBaseUrl: string;
    testEmail: string;
}

export default defineConfig((configEnv) => {
    const env = readExampleEnv(configEnv);
    return {
        plugins: [novaTokenProxyPlugin("release-angular-example", env)],
    };
});

function readExampleEnv({ mode }: ConfigEnv): ExampleEnv {
    const env = loadEnv(mode, EXAMPLE_ROOT, "");
    return {
        integrationSecret: readString(env.NOVA_INTEGRATION_SECRET),
        tokenBaseUrl: trimTrailingSlash(readString(env.NOVA_TOKEN_BASE_URL)),
        testEmail: readString(env.NOVA_TEST_EMAIL),
    };
}

function novaTokenProxyPlugin(exampleName: string, env: ExampleEnv): Plugin {
    return {
        name: "nova-token-dev-proxy",
        configureServer(server) {
            server.middlewares.use("/api/nova-token", async (request, response) => {
                if (request.method !== "POST") {
                    sendJson(response, 405, { error: "Method not allowed" });
                    return;
                }

                const missingEnv = missingProxyEnv(env);
                if (missingEnv.length > 0) {
                    sendJson(response, 500, {
                        error: `Nova token proxy is missing required .env values: ${missingEnv.join(", ")}.`,
                        detail: "Copy .env.example to .env and fill the values in, or export them before starting Vite. The app still mounts the launcher; only token minting fails.",
                    });
                    return;
                }

                const body = await readJsonBody(request);
                const publicSurfaceId = readString(body.publicSurfaceId);
                const origin = readString(body.origin) || originForRequest(request);

                if (!publicSurfaceId) {
                    sendJson(response, 400, { error: "publicSurfaceId is required." });
                    return;
                }

                let upstream: Response;
                try {
                    upstream = await fetch(`${env.tokenBaseUrl}/embed/session`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${env.integrationSecret}`,
                            Origin: origin,
                        },
                        body: JSON.stringify({
                            email: env.testEmail,
                            publicSurfaceId,
                            origin,
                            externalUserId: `${exampleName}:${env.testEmail}`,
                        }),
                    });
                } catch (error) {
                    sendJson(response, 502, {
                        error: "Could not reach Nova POST /embed/session.",
                        detail: error instanceof Error ? error.message : String(error),
                    });
                    return;
                }

                const contentType = upstream.headers.get("content-type") || "application/json";
                response.writeHead(upstream.status, {
                    "Content-Type": contentType,
                    "Cache-Control": "no-store",
                });
                response.end(await upstream.text());
            });
        },
    };
}

function missingProxyEnv(env: ExampleEnv): string[] {
    const missing: string[] = [];
    if (!env.tokenBaseUrl) missing.push("NOVA_TOKEN_BASE_URL");
    if (!env.integrationSecret) missing.push("NOVA_INTEGRATION_SECRET");
    if (!env.testEmail) missing.push("NOVA_TEST_EMAIL");
    return missing;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
}

function readString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function originForRequest(request: IncomingMessage): string {
    const host = request.headers.host || "127.0.0.1:4322";
    return `http://${host}`;
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/$/, "");
}
