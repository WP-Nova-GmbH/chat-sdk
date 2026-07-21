import { HANDLE_ATTR } from "./constants.js";

const ORIGINALS = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
};

interface RectLike {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
}

export class FakeElement {
    readonly children: FakeElement[] = [];
    readonly childNodes: Array<FakeElement | { nodeType: number; textContent: string }> = [];
    readonly ownerDocument: FakeDocument;
    parentElement: FakeElement | null = null;
    rect: RectLike = { bottom: 20, height: 20, left: 0, right: 200, top: 0, width: 200 };
    value?: string;

    constructor(
        readonly tagName: string,
        private readonly attrs: Map<string, string>,
        readonly textContent: string,
        ownerDocument: FakeDocument,
    ) {
        this.ownerDocument = ownerDocument;
    }

    append(child: FakeElement): void {
        child.parentElement = this;
        this.children.push(child);
        this.childNodes.push(child);
    }

    getAttribute(name: string): string | null {
        return this.attrs.get(name) ?? null;
    }

    setAttribute(name: string, value: string): void {
        this.attrs.set(name, value);
    }

    hasAttribute(name: string): boolean {
        return this.attrs.has(name);
    }

    removeAttribute(name: string): void {
        this.attrs.delete(name);
    }

    getClientRects(): RectLike[] {
        return [this.getBoundingClientRect()];
    }

    getBoundingClientRect(): RectLike {
        return this.rect;
    }

    closest(selector: string): FakeElement | null {
        const attr = selector.match(/^\[([^\]]+)\]$/)?.[1];
        if (!attr) return null;
        let node: FakeElement | null = this;
        while (node) {
            if (node.hasAttribute(attr)) return node;
            node = node.parentElement;
        }
        return null;
    }

    matches(): boolean {
        return false;
    }
}

export class FakeDocument {
    readonly documentElement = { clientHeight: 800, clientWidth: 1200 };
    readonly title = "Customers";
    readonly body = new FakeElement("body", new Map(), "", this);
    readonly children = [this.body];
    allNodes: FakeElement[] = [];

    querySelector(): FakeElement | null {
        return null;
    }

    querySelectorAll(selector?: string): FakeElement[] {
        if (selector === "[data-ai-context]") {
            return this.allNodes.filter((node) => node.hasAttribute("data-ai-context"));
        }
        if (selector === `[${HANDLE_ATTR}]`) {
            const found: FakeElement[] = [];
            const walk = (el: FakeElement): void => {
                if (el.hasAttribute(HANDLE_ATTR)) found.push(el);
                for (const child of el.children) walk(child);
            };
            walk(this.body);
            return found;
        }
        return [];
    }

    getElementById(): FakeElement | null {
        return null;
    }
}

export function restoreGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}
