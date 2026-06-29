import { ENVIRONMENT_INITIALIZER, type EnvironmentProviders, inject, makeEnvironmentProviders } from "@angular/core";
import type { SdkConfig } from "@wp-nova/chat-sdk";
import { NovaChatService } from "./nova-chat.service";
import { NOVA_CHAT_CONFIG } from "./nova-chat.tokens";

export function provideNovaChat(config: SdkConfig): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: NOVA_CHAT_CONFIG, useValue: config },
        {
            provide: ENVIRONMENT_INITIALIZER,
            multi: true,
            useValue: () => {
                inject(NovaChatService).init(config);
            },
        },
    ]);
}
