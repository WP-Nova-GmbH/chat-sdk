import { Injectable, inject } from "@angular/core";
import type { ToolHandler } from "@wp-nova/sdk";
import { NOVA_CHAT_CONFIG } from "./nova-chat.tokens";

type SdkModule = typeof import("@wp-nova/sdk");

@Injectable({ providedIn: "root" })
export class NovaChatService {
    private readonly config = inject(NOVA_CHAT_CONFIG, { optional: true });
    private sdk?: Promise<SdkModule>;
    private registeredTools = new Set<string>();

    init(config = this.config): void {
        if (!config) {
            throw new Error("NovaChatService.init requires an SdkConfig.");
        }
        void this.load().then((sdk) => sdk.init(config));
    }

    registerToolHandler(name: string, handler: ToolHandler): void {
        this.registeredTools.add(name);
        void this.load().then((sdk) => sdk.registerToolHandler(name, handler));
    }

    unregisterToolHandler(name: string): void {
        this.registeredTools.delete(name);
        void this.load().then((sdk) => sdk.unregisterToolHandler(name));
    }

    destroyRegisteredTools(): void {
        for (const name of this.registeredTools) {
            this.unregisterToolHandler(name);
        }
    }

    private load(): Promise<SdkModule> {
        this.sdk ??= import("@wp-nova/sdk");
        return this.sdk;
    }
}
