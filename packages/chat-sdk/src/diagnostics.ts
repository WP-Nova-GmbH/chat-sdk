// Shared config-validation + diagnostics helpers (A8).
//
// "Which config fields are mandatory" and the error / disabled-config /
// operation-error reporters used to be copied across the core `config.ts` and
// both framework wrappers (react / angular), differing only by the `/react` vs
// `/angular` tag. These live here once and take the framework tag as a param so
// the wrappers can consume them instead of carrying their own copies.

import type { SdkConfig } from "./types.js";

/**
 * The required `SdkConfig` fields that are missing/blank. `resolveConfig` reuses
 * this so the throw-on-init contract and the wrappers' disabled-state diagnostics
 * agree on what "required" means.
 */
export function missingRequiredConfigFields(config: SdkConfig): string[] {
    const missing: string[] = [];
    if (!config?.publicSurfaceId?.trim()) missing.push("publicSurfaceId");
    if (!config?.tokenEndpoint?.trim()) missing.push("tokenEndpoint");
    return missing;
}

/** Normalize any thrown value into a human-readable message. */
export function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * The message a wrapper logs when it stays disabled because `enabled=false` and
 * required config is missing. `framework` is the wrapper tag (e.g. "react").
 */
export function buildDisabledMessage(framework: string, missing: string[]): string {
    return (
        `[wp-nova/${framework}] did not mount the chat launcher because ` +
        `enabled=false and required config is missing: ${missing.join(", ")}.`
    );
}

/**
 * Report a failed wrapper operation. Errors the SDK already prefixed with
 * `[wp-nova]` are swallowed (the core already logged them); everything else is
 * tagged with the wrapper framework + the operation name.
 */
export function reportOperationError(framework: string, op: string, error: unknown): void {
    const message = formatErrorMessage(error);
    if (message.startsWith("[wp-nova]")) return;
    console.error(`[wp-nova/${framework}] ${op} failed: ${message}`);
}
