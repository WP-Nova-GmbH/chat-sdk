import { Injectable, inject } from "@angular/core";
import type { ToolDefinition, ToolHandler } from "@wp-nova/sdk";
import { reportAngularOperationError } from "./nova-chat.diagnostics";
import { NOVA_CHAT_CONFIG } from "./nova-chat.tokens";

type SdkModule = typeof import("@wp-nova/sdk");

@Injectable({ providedIn: "root" })
export class NovaChatService {
    private readonly config = inject(NOVA_CHAT_CONFIG, { optional: true });
    private sdk?: Promise<SdkModule>;

    init(config = this.config): void {
        if (!config) {
            const message =
                "[wp-nova/angular] NovaChatService.init requires an SdkConfig; the chat launcher was not mounted.";
            console.error(message);
            throw new Error(message);
        }
        void this.load()
            .then((sdk) => sdk.init(config))
            .catch((error) => reportAngularOperationError("init", error));
    }

    registerTool(tool: ToolDefinition): void {
        void this.load()
            .then((sdk) => sdk.registerTool(tool))
            .catch((error) => reportAngularOperationError(`registerTool("${tool.name}")`, error));
    }

    unregisterTool(name: string): void {
        void this.load()
            .then((sdk) => sdk.unregisterTool(name))
            .catch((error) => reportAngularOperationError(`unregisterTool("${name}")`, error));
    }

    /** @deprecated Use registerTool with the full tool definition. */
    registerToolHandler(name: string, handler: ToolHandler): void {
        void this.load()
            .then((sdk) => sdk.registerToolHandler(name, handler))
            .catch((error) => reportAngularOperationError(`registerToolHandler("${name}")`, error));
    }

    /** @deprecated Use unregisterTool for SDK-declared tools. */
    unregisterToolHandler(name: string): void {
        void this.load()
            .then((sdk) => sdk.unregisterToolHandler(name))
            .catch((error) =>
                reportAngularOperationError(`unregisterToolHandler("${name}")`, error),
            );
    }

    /**
     * Register a live mount of the shared chat element. Pairs with `release`; the
     * shared element is torn down only when the last mount releases, so one
     * NovaChatComponent unmounting never destroys another's live chat.
     */
    retain(): void {
        void this.load()
            .then((sdk) => sdk.retain())
            .catch((error) => reportAngularOperationError("retain", error));
    }

    /** Drop a live mount registered with `retain`. */
    release(): void {
        void this.load()
            .then((sdk) => sdk.release())
            .catch((error) => reportAngularOperationError("release", error));
    }

    destroy(): void {
        void this.load()
            .then((sdk) => sdk.destroy())
            .catch((error) => reportAngularOperationError("destroy", error));
    }

    private load(): Promise<SdkModule> {
        this.sdk ??= import("@wp-nova/sdk");
        return this.sdk;
    }
}
