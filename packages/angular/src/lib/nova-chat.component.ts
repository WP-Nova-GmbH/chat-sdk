import {
    Component,
    Input,
    inject,
    type OnChanges,
    type OnDestroy,
    type OnInit,
    type SimpleChanges,
} from "@angular/core";
import type { SdkConfig, ToolDefinition } from "@wp-nova/sdk";
import { disabledConfigMessage } from "./nova-chat.diagnostics";
import { NovaChatService } from "./nova-chat.service";

@Component({
    selector: "wp-nova-chat-mount",
    standalone: true,
    template: "",
})
export class NovaChatComponent implements OnInit, OnChanges, OnDestroy {
    @Input() config?: SdkConfig;
    @Input() tools?: readonly ToolDefinition[];
    @Input() enabled = true;

    private readonly nova = inject(NovaChatService);
    private toolNames: string[] = [];
    private lastDisabledMessage?: string;

    ngOnInit(): void {
        this.sync();
    }

    ngOnChanges(_changes: SimpleChanges): void {
        this.sync();
    }

    ngOnDestroy(): void {
        this.unregisterTools();
        this.nova.destroy();
    }

    private unregisterTools(): void {
        for (const name of this.toolNames) {
            this.nova.unregisterTool(name);
        }
        this.toolNames = [];
    }

    private sync(): void {
        this.unregisterTools();

        if (!this.enabled) {
            const message = disabledConfigMessage(this.config);
            if (message && this.lastDisabledMessage !== message) {
                this.lastDisabledMessage = message;
                console.error(message);
            }
            this.nova.destroy();
            return;
        }
        this.lastDisabledMessage = undefined;
        if (this.config) this.nova.init(this.config);

        this.toolNames = (this.tools ?? []).map((tool) => tool.name);
        for (const tool of this.tools ?? []) {
            this.nova.registerTool(tool);
        }
    }
}
