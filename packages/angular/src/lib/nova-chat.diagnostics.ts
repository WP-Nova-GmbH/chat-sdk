import type { SdkConfig } from "@wp-nova/sdk";

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
