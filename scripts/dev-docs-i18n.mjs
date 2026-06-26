import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { cp, mkdir, rm, symlink } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(repoRoot, "apps/docs");
const docusaurusBin = path.join(repoRoot, "node_modules/@docusaurus/core/bin/docusaurus.mjs");
const devSitesRoot = path.join(tmpdir(), "chat-sdk-docs-i18n-dev");
const siteEntries = [
    "docs",
    "docusaurus.config.ts",
    "i18n",
    "package.json",
    "sidebars.ts",
    "src",
    "static",
    "tsconfig.json",
];
const locales = ["en", "de", "fr"];
const localizedRoutePrefixes = new Set(locales.filter((locale) => locale !== "en"));

const options = parseOptions(process.argv.slice(2));
const proxyHost = options.host ?? "0.0.0.0";
const proxyPort = Number(options.port ?? 3000);
const targetHost = "127.0.0.1";
const targetBasePort = Number(options.targetBasePort ?? 3100);
const targets = Object.fromEntries(
    locales.map((locale, index) => [locale, { locale, port: targetBasePort + index }]),
);

const children = [];
const watchers = [];
const pendingSyncs = new Map();
const server = http.createServer(proxyHttpRequest);
const siteDirs = await prepareLocaleSiteDirs();
watchSiteEntries(siteDirs);

server.on("error", handleServerError);
server.on("upgrade", proxyUpgradeRequest);
server.listen(proxyPort, proxyHost, () => {
    const displayHost = proxyHost === "0.0.0.0" ? "localhost" : proxyHost;

    children.push(
        ...locales.map((locale) => startDocusaurus(locale, targets[locale].port, siteDirs[locale])),
    );

    console.log(`Docs dev proxy listening at http://${displayHost}:${proxyPort}/`);
    console.log(`Locales: ${locales.map((locale) => localeUrl(displayHost, locale)).join(", ")}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => stop(signal));
}

process.on("exit", () => {
    closeWatchers();

    for (const child of children) {
        if (!child.killed) child.kill();
    }
});

function parseOptions(args) {
    const parsed = {};

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--host") {
            parsed.host = args[index + 1];
            index += 1;
        } else if (arg === "--port") {
            parsed.port = args[index + 1];
            index += 1;
        } else if (arg === "--target-base-port") {
            parsed.targetBasePort = args[index + 1];
            index += 1;
        }
    }

    return parsed;
}

async function prepareLocaleSiteDirs() {
    await rm(devSitesRoot, { force: true, recursive: true });
    await mkdir(devSitesRoot, { recursive: true });

    const preparedSiteDirs = {};

    for (const locale of locales) {
        const localeSiteDir = path.join(devSitesRoot, locale);
        await mkdir(localeSiteDir, { recursive: true });

        for (const entry of siteEntries) {
            await copySiteEntry(entry, localeSiteDir);
        }

        await symlink(path.join(repoRoot, "node_modules"), path.join(localeSiteDir, "node_modules"));
        preparedSiteDirs[locale] = localeSiteDir;
    }

    return preparedSiteDirs;
}

async function copySiteEntry(entry, siteDir) {
    const destination = path.join(siteDir, entry);

    await rm(destination, { force: true, recursive: true });
    await cp(path.join(docsDir, entry), destination, {
        dereference: true,
        force: true,
        recursive: true,
    });
}

function watchSiteEntries(preparedSiteDirs) {
    for (const entry of siteEntries) {
        try {
            const watcher = watch(path.join(docsDir, entry), { recursive: true }, () => {
                scheduleSiteEntrySync(entry, preparedSiteDirs);
            });

            watchers.push(watcher);
        } catch (error) {
            console.warn(
                `Could not watch docs ${entry} for live locale sync: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}

function scheduleSiteEntrySync(entry, preparedSiteDirs) {
    clearTimeout(pendingSyncs.get(entry));

    pendingSyncs.set(
        entry,
        setTimeout(async () => {
            try {
                await Promise.all(
                    Object.values(preparedSiteDirs).map((siteDir) => copySiteEntry(entry, siteDir)),
                );
            } catch (error) {
                console.error(
                    `Failed to sync docs ${entry} into locale dev sites: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            } finally {
                pendingSyncs.delete(entry);
            }
        }, 100),
    );
}

function closeWatchers() {
    for (const timeout of pendingSyncs.values()) {
        clearTimeout(timeout);
    }

    pendingSyncs.clear();

    for (const watcher of watchers.splice(0)) {
        watcher.close();
    }
}

function startDocusaurus(locale, port, siteDir) {
    const child = spawn(
        process.execPath,
        [
            docusaurusBin,
            "start",
            "--host",
            targetHost,
            "--port",
            String(port),
            "--no-open",
            "--locale",
            locale,
            siteDir,
        ],
        {
            cwd: repoRoot,
            env: { ...process.env, BROWSER: "none" },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );

    child.stdout.on("data", (chunk) => writePrefixedOutput(locale, chunk));
    child.stderr.on("data", (chunk) => writePrefixedOutput(locale, chunk));
    child.on("exit", (code, signal) => {
        if (code || signal) {
            console.error(`[${locale}] exited${code ? ` with code ${code}` : ""}${signal ? ` from ${signal}` : ""}`);
        }
    });

    return child;
}

function writePrefixedOutput(locale, chunk) {
    const lines = String(chunk).split(/\r?\n/);

    for (const line of lines) {
        if (line) console.log(`[${locale}] ${line}`);
    }
}

function proxyHttpRequest(request, response) {
    const target = pickTarget(request.url, request.headers);
    const proxyRequest = http.request(
        {
            headers: { ...request.headers, host: `${targetHost}:${target.port}` },
            hostname: targetHost,
            method: request.method,
            path: request.url,
            port: target.port,
        },
        (proxyResponse) => {
            response.writeHead(proxyResponse.statusCode ?? 502, {
                ...proxyResponse.headers,
                "cache-control": "no-store",
            });
            proxyResponse.pipe(response);
        },
    );

    proxyRequest.on("error", () => {
        response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        response.end(`The ${target.locale} docs dev server is still starting. Refresh in a moment.\n`);
    });

    request.pipe(proxyRequest);
}

function proxyUpgradeRequest(request, socket, head) {
    const target = pickTarget(request.url, request.headers);
    const upstream = net.connect(target.port, targetHost, () => {
        upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);

        for (let index = 0; index < request.rawHeaders.length; index += 2) {
            const name = request.rawHeaders[index];
            const value =
                name.toLowerCase() === "host"
                    ? `${targetHost}:${target.port}`
                    : request.rawHeaders[index + 1];

            upstream.write(`${name}: ${value}\r\n`);
        }

        upstream.write("\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
    });

    upstream.on("error", () => socket.destroy());
}

function handleServerError(error) {
    console.error(`Docs dev proxy failed to listen on ${proxyHost}:${proxyPort}.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;

    for (const child of children) {
        if (!child.killed) child.kill();
    }
}

function pickTarget(requestUrl = "/", headers = {}) {
    const requestLocale =
        getLocaleFromPath(requestUrl) ??
        (isLocaleScopedDevRequest(requestUrl, headers) ? getLocaleFromPath(headers.referer) : undefined);

    return targets[requestLocale ?? "en"] ?? targets.en;
}

function isLocaleScopedDevRequest(requestUrl, headers) {
    const pathname = new URL(requestUrl, "http://localhost").pathname;
    const acceptsHtml = headerIncludes(headers.accept, "text/html");
    const fetchDestination = headers["sec-fetch-dest"];

    return !acceptsHtml && fetchDestination !== "document" && pathname !== "/";
}

function headerIncludes(value, needle) {
    if (Array.isArray(value)) return value.some((item) => item.includes(needle));

    return value?.includes(needle) ?? false;
}

function getLocaleFromPath(value) {
    if (!value) return undefined;

    const pathname = new URL(value, "http://localhost").pathname;
    const firstSegment = pathname.split("/").filter(Boolean)[0];

    return localizedRoutePrefixes.has(firstSegment) ? firstSegment : undefined;
}

function localeUrl(host, locale) {
    const pathPrefix = locale === "en" ? "/" : `/${locale}/`;

    return `http://${host}:${proxyPort}${pathPrefix}`;
}

function stop(signal) {
    closeWatchers();
    server.close();

    for (const child of children) {
        if (!child.killed) child.kill(signal);
    }
}
