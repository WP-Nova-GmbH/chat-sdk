import { Injectable, inject, signal } from "@angular/core";
import { NovaChatService } from "@wp-nova/chat-sdk-angular";

// Docs: Angular > Service API. Registration can live in a service when it does
// not belong to a single component. Here the service registers an extra
// model-callable tool through NovaChatService.registerTool and exposes the last
// acknowledgement as a signal the component renders.
@Injectable({ providedIn: "root" })
export class DispatchToolRegistration {
    private readonly nova = inject(NovaChatService);
    readonly lastAcknowledgement = signal<string>("No dispatches acknowledged yet.");

    register(): void {
        this.nova.registerTool({
            name: "acknowledge_dispatch",
            description: "Records that a dispatch has been acknowledged by the control desk.",
            inputSchema: {
                type: "object",
                properties: { jobId: { type: "string" }, note: { type: "string" } },
                required: ["jobId"],
            },
            mutating: true,
            confirmationCopy: "Acknowledge this dispatch?",
            handler: (args) => {
                const jobId = String(args["jobId"] ?? "");
                const note = String(args["note"] ?? "Acknowledged.");
                this.lastAcknowledgement.set(`${jobId}: ${note}`);
                return { ok: true, jobId, note };
            },
        });
    }
}
