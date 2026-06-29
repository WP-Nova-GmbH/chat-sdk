// NOTE (A8): the core now exports `missingRequiredConfigFields`,
// `formatErrorMessage`, `buildDisabledMessage` and `reportOperationError` so these
// helpers can live in one place. They are NOT consumed here because importing
// them statically pulls the core's package root, which eagerly evaluates
// `class extends HTMLElement` and throws under Angular Universal / Node SSR (the
// wrapper deliberately reaches the core only via a runtime dynamic import). Keep
// these copies SSR-safe until the core exposes the diagnostics on an SSR-safe
// subpath (e.g. `@wp-nova/chat-sdk/diagnostics`) with no DOM evaluation.
import type { SdkConfig } from "@wp-nova/chat-sdk";

export function reportAngularOperationError(operation: string, error: unknown): void {
    const message = formatErrorMessage(error);
    if (message.startsWith("[wp-nova]")) return;
    console.error(`[wp-nova/angular] ${operation} failed: ${message}`);
}

export function disabledConfigMessage(config?: SdkConfig): string | null {
    if (!config) return null;
    const missing = missingRequiredConfigFields(config);
    if (missing.length === 0) return null;
    return (
        "[wp-nova/angular] NovaChatComponent did not mount the chat launcher because " +
        `enabled=false and required config is missing: ${missing.join(", ")}.`
    );
}

export function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function missingRequiredConfigFields(config: SdkConfig): string[] {
    const missing: string[] = [];
    if (!config.publicSurfaceId?.trim()) missing.push("publicSurfaceId");
    if (!config.tokenEndpoint?.trim()) missing.push("tokenEndpoint");
    return missing;
}
