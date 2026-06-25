import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useCallback, useEffect, useRef, useState } from "react";

const PROMPT_URL = "/prompts/nova-chat-sdk-agent-prompt.md";

const calloutContent = {
    en: {
        eyebrow: "Implementation prompt",
        body:
            "This page is the integration spec for humans and coding agents. Copy or download it with task instructions and hand it to an agent to wire the SDK into an app.",
        copy: "Copy for AI agent",
        downloadLabel: "Download implementation prompt",
        downloadTitle: "Download .md",
        loadError: "Could not load the implementation prompt.",
        copyError: "Could not copy the implementation prompt. Use the download button instead.",
        genericCopyError: "Could not copy the prompt.",
        copied: "Implementation prompt copied",
        downloaded: "Implementation prompt downloaded",
        genericDownloadError: "Could not download the prompt."
    },
    de: {
        eyebrow: "Implementierungs-Prompt",
        body:
            "Diese Seite ist die Integrationsspezifikation für Menschen und Coding-Agenten. Kopiere oder lade sie zusammen mit den Aufgabenanweisungen herunter und gib sie einem Agenten, um das SDK in eine App einzubauen.",
        copy: "Für KI-Agent kopieren",
        downloadLabel: "Implementierungs-Prompt herunterladen",
        downloadTitle: ".md herunterladen",
        loadError: "Der Implementierungs-Prompt konnte nicht geladen werden.",
        copyError:
            "Der Implementierungs-Prompt konnte nicht kopiert werden. Verwende stattdessen den Download-Button.",
        genericCopyError: "Der Prompt konnte nicht kopiert werden.",
        copied: "Implementierungs-Prompt kopiert",
        downloaded: "Implementierungs-Prompt heruntergeladen",
        genericDownloadError: "Der Prompt konnte nicht heruntergeladen werden."
    },
    fr: {
        eyebrow: "Prompt d'intégration",
        body:
            "Cette page est la spécification d'intégration pour les humains et les agents de code. Copiez-la ou téléchargez-la avec vos consignes de tâche, puis donnez-la à un agent pour intégrer le SDK dans une app.",
        copy: "Copier pour l'agent IA",
        downloadLabel: "Télécharger le prompt d'intégration",
        downloadTitle: "Télécharger .md",
        loadError: "Impossible de charger le prompt d'intégration.",
        copyError:
            "Impossible de copier le prompt d'intégration. Utilisez plutôt le bouton de téléchargement.",
        genericCopyError: "Impossible de copier le prompt.",
        copied: "Prompt d'intégration copié",
        downloaded: "Prompt d'intégration téléchargé",
        genericDownloadError: "Impossible de télécharger le prompt."
    }
} satisfies Record<string, Record<string, string>>;

function downloadText(filename: string, text: string): void {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function readPrompt(loadError: string): Promise<string> {
    const response = await fetch(PROMPT_URL, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(loadError);
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

async function copyText(text: string, copyError: string): Promise<void> {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fall back for browsers that expose Clipboard API but deny this call.
        }
    }

    if (copyTextWithTextarea(text)) return;
    throw new Error(copyError);
}

export function ImplementationPromptCallout() {
    const { i18n } = useDocusaurusContext();
    const content = calloutContent[i18n.currentLocale] ?? calloutContent.en;
    const promptRef = useRef<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void readPrompt(content.loadError)
            .then((prompt) => {
                if (!cancelled) promptRef.current = prompt;
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [content.loadError]);

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 2200);
    }, []);

    const getPrompt = useCallback(async () => {
        const prompt = promptRef.current ?? (await readPrompt(content.loadError));
        promptRef.current = prompt;
        return prompt;
    }, [content.loadError]);

    const copyPrompt = useCallback(async () => {
        try {
            const prompt = await getPrompt();
            await copyText(prompt, content.copyError);
            showToast(`${content.copied} (${Math.ceil(prompt.length / 1024)} KB)`);
        } catch (error) {
            showToast(error instanceof Error ? error.message : content.genericCopyError);
        }
    }, [content.copied, content.copyError, content.genericCopyError, getPrompt, showToast]);

    const downloadPrompt = useCallback(async () => {
        try {
            const prompt = await getPrompt();
            downloadText("nova-chat-sdk-agent-prompt.md", prompt);
            showToast(content.downloaded);
        } catch (error) {
            showToast(error instanceof Error ? error.message : content.genericDownloadError);
        }
    }, [content.downloaded, content.genericDownloadError, getPrompt, showToast]);

    return (
        <>
            <div className="nova-callout">
                <div className="nova-callout__body">
                    <div className="nova-callout__eyebrow">{content.eyebrow}</div>
                    <p>{content.body}</p>
                </div>
                <div className="nova-callout__actions">
                    <button className="nova-button nova-button--primary" type="button" onClick={copyPrompt}>
                        {content.copy}
                    </button>
                    <button
                        className="nova-button nova-button--icon"
                        type="button"
                        onClick={downloadPrompt}
                        aria-label={content.downloadLabel}
                        title={content.downloadTitle}
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
