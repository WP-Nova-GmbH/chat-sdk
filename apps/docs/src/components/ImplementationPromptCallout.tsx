import { useCallback, useState } from "react";

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
    const response = await fetch("/prompts/nova-chat-sdk-agent-prompt.md", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Could not load the implementation prompt.");
    }
    return response.text();
}

export function ImplementationPromptCallout() {
    const [toast, setToast] = useState<string | null>(null);

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 2200);
    }, []);

    const copyPrompt = useCallback(async () => {
        const prompt = await readPrompt();
        await navigator.clipboard.writeText(prompt);
        showToast(`Implementation prompt copied (${Math.ceil(prompt.length / 1024)} KB)`);
    }, [showToast]);

    const downloadPrompt = useCallback(async () => {
        const prompt = await readPrompt();
        downloadText("nova-chat-sdk-agent-prompt.md", prompt);
        showToast("Implementation prompt downloaded");
    }, [showToast]);

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
