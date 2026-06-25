import { defineConfig, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

const DEFAULT_NOVA_API_URL = "http://localhost:8400";
const DEFAULT_TEST_EMAIL = "angular-concierge@example.com";

export default defineConfig({
    plugins: [novaTokenProxyPlugin("angular-example")],
    resolve: {
        alias: {
            "@wp-nova/sdk-angular": fileURLToPath(
                new URL(
                    "../../packages/angular/dist/fesm2022/wp-nova-sdk-angular.mjs",
                    import.meta.url,
                ),
            ),
        },
    },
});

function novaTokenProxyPlugin(exampleName: string): Plugin {
    return {
        name: "nova-token-dev-proxy",
        configureServer(server) {
            server.middlewares.use("/api/nova-token", async (request, response) => {
                if (request.method !== "POST") {
                    sendJson(response, 405, { error: "Method not allowed" });
                    return;
                }

                const integrationSecret = process.env.NOVA_INTEGRATION_SECRET;
                if (!integrationSecret) {
                    sendJson(response, 500, {
                        error: "NOVA_INTEGRATION_SECRET is not configured for this dev server.",
                    });
                    return;
                }

                const body = await readJsonBody(request);
                const publicSurfaceId = readString(body.publicSurfaceId);
                const origin = readString(body.origin) || originForRequest(request);
                const email = process.env.NOVA_TEST_EMAIL || DEFAULT_TEST_EMAIL;

                if (!publicSurfaceId) {
                    sendJson(response, 400, { error: "publicSurfaceId is required." });
                    return;
                }

                const novaApiUrl = trimTrailingSlash(process.env.NOVA_API_URL || DEFAULT_NOVA_API_URL);
                let upstream;
                try {
                    upstream = await fetch(`${novaApiUrl}/embed/session`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${integrationSecret}`,
                            Origin: origin,
                        },
                        body: JSON.stringify({
                            email,
                            publicSurfaceId,
                            origin,
                            externalUserId: `${exampleName}:${email}`,
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
    const host = request.headers.host || "127.0.0.1:4312";
    return `http://${host}`;
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/$/, "");
}
