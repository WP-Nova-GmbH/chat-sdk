import { Injectable, inject } from "@angular/core";
import type { ToolDefinition, ToolHandler } from "@wp-nova/sdk";
import { reportAngularOperationError } from "./nova-chat.diagnostics";
import { NOVA_CHAT_CONFIG } from "./nova-chat.tokens";

type SdkModule = typeof import("@wp-nova/sdk");

@Injectable({ providedIn: "root" })
export class NovaChatService {
    private readonly config = inject(NOVA_CHAT_CONFIG, { optional: true });
    private sdk?: Promise<SdkModule>;
    private registeredTools = new Set<string>();

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
        this.registeredTools.add(tool.name);
        void this.load()
            .then((sdk) => sdk.registerTool(tool))
            .catch((error) => reportAngularOperationError(`registerTool("${tool.name}")`, error));
    }

    unregisterTool(name: string): void {
        this.registeredTools.delete(name);
        void this.load()
            .then((sdk) => sdk.unregisterTool(name))
            .catch((error) => reportAngularOperationError(`unregisterTool("${name}")`, error));
    }

    /** @deprecated Use registerTool with the full tool definition. */
    registerToolHandler(name: string, handler: ToolHandler): void {
        this.registeredTools.add(name);
        void this.load()
            .then((sdk) => sdk.registerToolHandler(name, handler))
            .catch((error) => reportAngularOperationError(`registerToolHandler("${name}")`, error));
    }

    /** @deprecated Use unregisterTool for SDK-declared tools. */
    unregisterToolHandler(name: string): void {
        this.registeredTools.delete(name);
        void this.load()
            .then((sdk) => sdk.unregisterToolHandler(name))
            .catch((error) =>
                reportAngularOperationError(`unregisterToolHandler("${name}")`, error),
            );
    }

    destroy(): void {
        this.registeredTools.clear();
        void this.load()
            .then((sdk) => sdk.destroy())
            .catch((error) => reportAngularOperationError("destroy", error));
    }

    destroyRegisteredTools(): void {
        for (const name of Array.from(this.registeredTools)) {
            this.unregisterTool(name);
            this.unregisterToolHandler(name);
        }
    }

    private load(): Promise<SdkModule> {
        this.sdk ??= import("@wp-nova/sdk");
        return this.sdk;
    }
}
