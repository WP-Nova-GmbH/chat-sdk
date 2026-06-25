import { useCallback, useEffect, useRef, useState } from "react";

const PROMPT_URL = "/prompts/nova-chat-sdk-agent-prompt.md";

function downloadText(filename: string, text: string): void {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function readPrompt(): Promise<string> {
    const response = await fetch(PROMPT_URL, { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Could not load the implementation prompt.");
    }
    return response.text();
}

function copyTextWithTextarea(text: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.append(textarea);

    const selection = document.getSelection();
    const ranges = selection
        ? Array.from({ length: selection.rangeCount }, (_value, index) => selection.getRangeAt(index))
        : [];

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    textarea.remove();

    if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
    }

    return copied;
}

async function copyText(text: string): Promise<void> {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fall back for browsers that expose Clipboard API but deny this call.
        }
    }

    if (copyTextWithTextarea(text)) return;
    throw new Error("Could not copy the implementation prompt. Use the download button instead.");
}

export function ImplementationPromptCallout() {
    const promptRef = useRef<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void readPrompt()
            .then((prompt) => {
                if (!cancelled) promptRef.current = prompt;
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 2200);
    }, []);

    const getPrompt = useCallback(async () => {
        const prompt = promptRef.current ?? (await readPrompt());
        promptRef.current = prompt;
        return prompt;
    }, []);

    const copyPrompt = useCallback(async () => {
        try {
            const prompt = await getPrompt();
            await copyText(prompt);
            showToast(`Implementation prompt copied (${Math.ceil(prompt.length / 1024)} KB)`);
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Could not copy the prompt.");
        }
    }, [getPrompt, showToast]);

    const downloadPrompt = useCallback(async () => {
        try {
            const prompt = await getPrompt();
            downloadText("nova-chat-sdk-agent-prompt.md", prompt);
            showToast("Implementation prompt downloaded");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Could not download the prompt.");
        }
    }, [getPrompt, showToast]);

    return (
        <>
            <div className="nova-callout">
                <div className="nova-callout__body">
                    <div className="nova-callout__eyebrow">Implementation prompt</div>
                    <p>
                        This page is the integration spec for humans and coding agents. Copy or
                        download it with task instructions and hand it to an agent to wire the SDK
                        into an app.
                    </p>
                </div>
                <div className="nova-callout__actions">
                    <button className="nova-button nova-button--primary" type="button" onClick={copyPrompt}>
                        Copy for AI agent
                    </button>
                    <button
                        className="nova-button nova-button--icon"
                        type="button"
                        onClick={downloadPrompt}
                        aria-label="Download implementation prompt"
                        title="Download .md"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 3v12" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M5 21h14" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className={toast ? "nova-toast nova-toast--visible" : "nova-toast"} role="status">
                <span />
                {toast}
            </div>
        </>
    );
}
