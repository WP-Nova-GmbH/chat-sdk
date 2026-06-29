import {
    Component,
    Input,
    inject,
    type OnChanges,
    type OnDestroy,
    type OnInit,
    type SimpleChanges,
} from "@angular/core";
import type { SdkConfig, ToolDefinition } from "@wp-nova/chat-sdk";
import { disabledConfigMessage } from "./nova-chat.diagnostics";
import { NovaChatService } from "./nova-chat.service";

/** The serializable tool fields whose change requires a re-`registerTool`. */
function toolSignature(tool: ToolDefinition): string {
    return JSON.stringify([
        tool.description,
        tool.inputSchema,
        tool.mutating,
        tool.confirmationCopy,
    ]);
}

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
    /** name -> last applied signature + handler identity, for delta re-registration. */
    private readonly registered = new Map<
        string,
        { sig: string; handler: ToolDefinition["handler"] }
    >();
    /** True between the first `retain()` and its paired `release()`. */
    private retained = false;
    private firstSync = true;
    private lastDisabledMessage?: string;

    ngOnInit(): void {
        // With bound inputs Angular fires ngOnChanges before ngOnInit; the
        // firstSync flag makes this call a no-op in that case and the canonical
        // first sync when there are no bound inputs (ngOnChanges never fires).
        this.sync();
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.sync(changes);
    }

    ngOnDestroy(): void {
        this.unregisterTools();
        if (this.retained) {
            this.retained = false;
            this.nova.release();
        }
    }

    private unregisterTools(): void {
        for (const name of Array.from(this.registered.keys())) {
            this.nova.unregisterTool(name);
        }
        this.registered.clear();
    }

    private sync(changes?: SimpleChanges): void {
        const isFirst = this.firstSync;
        this.firstSync = false;

        if (!this.enabled) {
            const message = disabledConfigMessage(this.config);
            if (message && this.lastDisabledMessage !== message) {
                this.lastDisabledMessage = message;
                console.error(message);
            }
            this.unregisterTools();
            if (this.retained) {
                this.retained = false;
                this.nova.release();
            }
            return;
        }
        this.lastDisabledMessage = undefined;

        if (!this.retained) {
            this.retained = true;
            this.nova.retain();
        }

        const reinit = isFirst || !!changes?.config || !!changes?.enabled;
        if (reinit && this.config) this.nova.init(this.config);

        const reTools = isFirst || !!changes?.tools || !!changes?.enabled;
        if (reTools) this.syncTools();
    }

    /** Apply only the tool delta: unregister removed, (re)register new/changed. */
    private syncTools(): void {
        const next = this.tools ?? [];
        const nextNames = new Set<string>();
        for (const tool of next) {
            nextNames.add(tool.name);
            const sig = toolSignature(tool);
            const prev = this.registered.get(tool.name);
            if (!prev || prev.sig !== sig || prev.handler !== tool.handler) {
                this.nova.registerTool(tool);
                this.registered.set(tool.name, { sig, handler: tool.handler });
            }
        }
        for (const name of Array.from(this.registered.keys())) {
            if (!nextNames.has(name)) {
                this.nova.unregisterTool(name);
                this.registered.delete(name);
            }
        }
    }
}
