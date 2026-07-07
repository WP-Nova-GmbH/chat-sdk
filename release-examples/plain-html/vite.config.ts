import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ConfigEnv, defineConfig, loadEnv, type Plugin } from "vite";

// This example follows the documented script-tag install: the host page loads
// the SDK global build with a pinned URL + Subresource Integrity. In production
// that URL is https://chat.wp-nova.ai/sdk/1.0.0/sdk.js. Because that hosted CDN
// path is not used in local development, this Vite server self-hosts the exact
// released global build (from the installed @wp-nova/chat-sdk package) at the same
// /sdk/1.0.0/sdk.js path with the same SRI — so the integrity attribute in
// index.html validates byte-for-byte.

const PINNED_VERSION = "1.0.0";
const EXAMPLE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

interface ExampleEnv {
    integrationSecret: string;
    tokenBaseUrl: string;
    testEmail: string;
}

export default defineConfig((configEnv) => {
    const env = readExampleEnv(configEnv);
    const browserEnv = loadEnv(configEnv.mode, EXAMPLE_ROOT, "");
    return {
        plugins: [
            serveReleasedSdkPlugin(),
            injectSurfaceConfigPlugin({
                surfaceId: readString(browserEnv.VITE_NOVA_PUBLIC_SURFACE_ID),
                baseUrl: readString(browserEnv.VITE_NOVA_BASE_URL),
            }),
            novaTokenProxyPlugin("release-plain-example", env),
        ],
    };
});

// Inject the browser-safe surface config from .env into the static page so the
// plain HTML example honors the same .env as the bundled examples. A ?surface=
// query param still overrides it at runtime.
function injectSurfaceConfigPlugin(config: { surfaceId: string; baseUrl: string }): Plugin {
    return {
        name: "nova-inject-surface-config",
        transformIndexHtml() {
            return [
                {
                    tag: "script",
                    injectTo: "head",
                    children: `window.__NOVA_CONFIG__=${JSON.stringify(config)};`,
                },
            ];
        },
    };
}

// --- Serve the released SDK global build at the pinned, SRI-checked path -------

function loadReleasedSdk(): { code: Buffer; sri: string; version: string } {
    // The package's "exports" map does not expose ./package.json, so resolve the
    // main entry and read sibling files by path instead.
    const distDir = path.dirname(require.resolve("@wp-nova/chat-sdk"));
    const pkgJsonPath = path.join(distDir, "..", "package.json");
    const version = JSON.parse(readFileSync(pkgJsonPath, "utf8")).version as string;
    const code = readFileSync(path.join(distDir, "index.global.js"));
    const sri = readFileSync(path.join(distDir, "index.global.js.sri"), "utf8").trim();

    const computed = `sha384-${createHash("sha384").update(code).digest("base64")}`;
    if (computed !== sri) {
        throw new Error(
            `Released SDK integrity mismatch: dist/index.global.js hashes to ${computed} but ` +
                `dist/index.global.js.sri is ${sri}. The package may be corrupted; reinstall it.`,
        );
    }
    if (version !== PINNED_VERSION) {
        console.warn(
            `[nova] Installed @wp-nova/chat-sdk is ${version}, but index.html pins ${PINNED_VERSION}. ` +
                `Update the version path and integrity value in index.html to match (it now needs ${sri}).`,
        );
    }
    return { code, sri, version };
}

function serveReleasedSdkPlugin(): Plugin {
    const assetPath = `sdk/${PINNED_VERSION}/sdk.js`;
    return {
        name: "nova-serve-released-sdk",
        configureServer(server) {
            const { code, sri } = loadReleasedSdk();
            server.middlewares.use(`/${assetPath}`, (_request, response) => {
                response.writeHead(200, {
                    "Content-Type": "text/javascript; charset=utf-8",
                    "Cache-Control": "no-store",
                });
                response.end(code);
            });
            server.middlewares.use(`/${assetPath}.sri`, (_request, response) => {
                response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
                response.end(`${sri}\n`);
            });
        },
        generateBundle() {
            const { code, sri } = loadReleasedSdk();
            this.emitFile({ type: "asset", fileName: assetPath, source: code });
            this.emitFile({ type: "asset", fileName: `${assetPath}.sri`, source: `${sri}\n` });
        },
    };
}

// --- Server-side token endpoint (stand-in for the customer backend) -----------

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
                        detail: "Copy .env.example to .env and fill the values in, or export them before starting Vite. The launcher still mounts; only token minting fails.",
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
    const host = request.headers.host || "127.0.0.1:4323";
    return `http://${host}`;
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/$/, "");
}
