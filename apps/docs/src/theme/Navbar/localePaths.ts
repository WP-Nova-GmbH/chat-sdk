export function stripBaseUrl(pathname: string, baseUrl: string): string {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const basePath = normalizedBaseUrl.replace(/\/$/, "");

    if (normalizedBaseUrl === "/") return pathname || "/";
    if (pathname === basePath || pathname === normalizedBaseUrl) return "/";
    if (pathname.startsWith(normalizedBaseUrl))
        return `/${pathname.slice(normalizedBaseUrl.length)}` || "/";

    return pathname || "/";
}

export function normalizeDocsPath(pathname: string): string {
    const withoutTrailingSlash = pathname.replace(/\/$/, "");
    return withoutTrailingSlash || "/";
}

function ensureTrailingSlash(pathname: string): string {
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function addLocaleBaseUrl(pathname: string, baseUrl: string): string {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const pathSuffix = pathname.replace(/^\/+/, "");

    return ensureTrailingSlash(`${normalizedBaseUrl}${pathSuffix}`);
}

export function getLocalizedDocsPath({
    currentLocaleBaseUrl,
    pathname,
    targetLocaleBaseUrl,
}: {
    currentLocaleBaseUrl: string;
    pathname: string;
    targetLocaleBaseUrl: string;
}): string {
    return addLocaleBaseUrl(stripBaseUrl(pathname, currentLocaleBaseUrl), targetLocaleBaseUrl);
}
