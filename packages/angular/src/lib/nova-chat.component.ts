import { Component, Input, inject, type OnChanges, type OnDestroy, type OnInit, type SimpleChanges } from "@angular/core";
import type { SdkConfig, ToolHandler } from "@wp-nova/sdk";
import { NovaChatService } from "./nova-chat.service";

@Component({
    selector: "wp-nova-chat-mount",
    standalone: true,
    template: ""
})
export class NovaChatComponent implements OnInit, OnChanges, OnDestroy {
    @Input() config?: SdkConfig;
    @Input() tools?: Record<string, ToolHandler>;
    @Input() enabled = true;

    private readonly nova = inject(NovaChatService);
    private toolNames: string[] = [];

    ngOnInit(): void {
        this.sync();
    }

    ngOnChanges(_changes: SimpleChanges): void {
        this.sync();
    }

    ngOnDestroy(): void {
        for (const name of this.toolNames) {
            this.nova.unregisterToolHandler(name);
        }
    }

    private sync(): void {
        for (const name of this.toolNames) {
            this.nova.unregisterToolHandler(name);
        }
        this.toolNames = [];

        if (!this.enabled) return;
        if (this.config) this.nova.init(this.config);

        this.toolNames = Object.keys(this.tools ?? {});
        for (const name of this.toolNames) {
            const handler = this.tools?.[name];
            if (handler) this.nova.registerToolHandler(name, handler);
        }
    }
}
