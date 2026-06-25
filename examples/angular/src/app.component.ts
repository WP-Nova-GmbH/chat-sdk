import { Component } from "@angular/core";
import { NovaChatComponent } from "@wp-nova/sdk-angular";

@Component({
    standalone: true,
    selector: "app-root",
    imports: [NovaChatComponent],
    template: `
        <main>
            <h1>Nova Chat SDK Angular Example</h1>
            <wp-nova-chat-mount
                [config]="{
                    publicSurfaceId: 'srf_live_replace_me',
                    tokenEndpoint: '/api/nova-token'
                }"
                [tools]="tools"
            />
        </main>
    `,
})
export class AppComponent {
    tools = {
        show_toast: async (args: Record<string, unknown>) => ({
            ok: true,
            message: String(args.message ?? "Hello from Nova"),
        }),
    };
}
