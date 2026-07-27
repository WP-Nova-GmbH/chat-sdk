import { Injector, runInInjectionContext } from "@angular/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NovaChatService } from "./nova-chat.service";

const sdk = vi.hoisted(() => ({
    close: vi.fn(),
    open: vi.fn(),
    toggle: vi.fn(),
}));

vi.mock("@wp-nova/chat-sdk", () => sdk);

async function flushDynamicImport(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("NovaChatService host controls", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("delegates open, close and toggle to the shared SDK controller", async () => {
        const injector = Injector.create({ providers: [] });
        const service = runInInjectionContext(injector, () => new NovaChatService());

        service.open();
        service.close();
        service.toggle();
        await flushDynamicImport();

        expect(sdk.open).toHaveBeenCalledTimes(1);
        expect(sdk.close).toHaveBeenCalledTimes(1);
        expect(sdk.toggle).toHaveBeenCalledTimes(1);
    });
});
