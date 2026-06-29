import { NovaChatProvider, type NovaToolDefinition } from "@wp-nova/chat-sdk-react";
import { useMemo, useState } from "react";
import { CreateTicketTool } from "./CreateTicketTool";

// Aurora Helpdesk — a small support console that consumes the RELEASED
// @wp-nova/chat-sdk-react package from npm. The integration follows
// https://chat.wp-nova.ai docs/react: mount NovaChatProvider once near the app
// root, pass stable tools through the `tools` prop, register a feature-scoped
// tool with the useNovaTool hook, and gate mounting with `enabled`.

type Priority = "low" | "normal" | "high" | "urgent";

export interface Ticket {
    id: string;
    subject: string;
    customer: string;
    priority: Priority;
    queue: string;
    summary: string;
}

const initialTickets: Ticket[] = [
    {
        id: "AUR-4821",
        subject: "Checkout fails on saved card",
        customer: "Marlow Bakeries",
        priority: "high",
        queue: "Billing",
        summary: "Card on file is declined at the final step even though the bank approves it.",
    },
    {
        id: "AUR-4830",
        subject: "Export to CSV is missing columns",
        customer: "Northwind Labs",
        priority: "normal",
        queue: "Reporting",
        summary: "The weekly export dropped the owner and region columns after the last update.",
    },
    {
        id: "AUR-4845",
        subject: "SSO redirect loop",
        customer: "Cobalt Aerospace",
        priority: "urgent",
        queue: "Identity",
        summary: "After login the user bounces between the IdP and the app and never lands.",
    },
];

const DEFAULT_TICKET = initialTickets[0] as Ticket;

// Browser-safe config. Only VITE_* (public) values reach the bundle; the
// integration secret lives in the Vite token proxy (see vite.config.ts).
function readConfig() {
    return {
        publicSurfaceId: import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID ?? "",
        tokenEndpoint: "/api/nova-token",
        baseUrl: import.meta.env.VITE_NOVA_BASE_URL,
        title: "Aurora assistant",
        accent: "#5b5bd6",
        triggerColor: "#5b5bd6",
        triggerIconColor: "light" as const,
        // Opt these field values into page snapshots; everything else is default-deny.
        safeValueSelectors: ["#case-reference", "[data-agent-readable]"],
    };
}

export function App() {
    const [tickets, setTickets] = useState(initialTickets);
    const [activeId, setActiveId] = useState(DEFAULT_TICKET.id);
    const [caseReference, setCaseReference] = useState("CASE-2026-0142");
    const [banner, setBanner] = useState("Queue is healthy — 3 open tickets.");

    const config = useMemo(readConfig, []);
    const enabled = config.publicSurfaceId.trim().length > 0;

    const activeTicket = tickets.find((ticket) => ticket.id === activeId) ?? DEFAULT_TICKET;

    // Stable tools live in the `tools` prop (docs: "Registering Tools with
    // Definitions"). Each handler mutates visible page state and returns
    // JSON-serializable data.
    const tools = useMemo<NovaToolDefinition[]>(
        () => [
            {
                name: "focus_ticket",
                description: "Focuses the console on a specific ticket and returns its details.",
                inputSchema: {
                    type: "object",
                    properties: { ticketId: { type: "string" } },
                    required: ["ticketId"],
                },
                mutating: false,
                handler: (args) => {
                    const ticketId = String(args.ticketId ?? "");
                    const ticket = tickets.find((candidate) => candidate.id === ticketId);
                    if (!ticket) return { ok: false, reason: "Ticket not found." };
                    setActiveId(ticket.id);
                    return { ok: true, ticket };
                },
            },
            {
                name: "set_ticket_priority",
                description: "Changes the priority of a support ticket in the queue.",
                inputSchema: {
                    type: "object",
                    properties: {
                        ticketId: { type: "string" },
                        priority: {
                            type: "string",
                            enum: ["low", "normal", "high", "urgent"],
                        },
                    },
                    required: ["ticketId", "priority"],
                },
                mutating: true,
                confirmationCopy: "Change this ticket's priority?",
                handler: (args) => {
                    const ticketId = String(args.ticketId ?? activeId);
                    const priority = readPriority(args.priority);
                    let updated: Ticket | undefined;
                    setTickets((current) =>
                        current.map((ticket) => {
                            if (ticket.id !== ticketId) return ticket;
                            updated = { ...ticket, priority };
                            return updated;
                        }),
                    );
                    if (!updated) return { ok: false, reason: "Ticket not found." };
                    setActiveId(updated.id);
                    return { ok: true, ticket: updated };
                },
            },
            {
                name: "post_status_banner",
                description: "Updates the visible status banner with a short operations note.",
                inputSchema: {
                    type: "object",
                    properties: { message: { type: "string" } },
                    required: ["message"],
                },
                mutating: true,
                confirmationCopy: "Post this status banner?",
                handler: (args) => {
                    const message = String(args.message ?? "");
                    setBanner(message);
                    return { ok: true, message };
                },
            },
            {
                name: "get_console_snapshot",
                description: "Returns the helpdesk data currently visible in the console.",
                inputSchema: { type: "object", properties: {} },
                mutating: false,
                handler: () => ({ activeTicket, tickets, banner, caseReference }),
            },
        ],
        [tickets, activeId, activeTicket, banner, caseReference],
    );

    return (
        <NovaChatProvider config={config} enabled={enabled} tools={tools}>
            {/* useNovaTool belongs to a feature component and unregisters on unmount. */}
            <CreateTicketTool
                activeTicketId={activeTicket.id}
                onCreate={(ticket) => setTickets((current) => [ticket, ...current])}
            />

            <div className="app-shell">
                <header className="masthead">
                    <div>
                        <p className="eyebrow">Aurora Helpdesk</p>
                        <h1>Support console</h1>
                    </div>
                    <p className="banner" role="status" data-agent-readable>
                        {banner}
                    </p>
                </header>

                {!enabled && (
                    <p className="notice">
                        Set <code>VITE_NOVA_PUBLIC_SURFACE_ID</code> in <code>.env</code> to mount
                        the chat launcher.
                    </p>
                )}

                {/* Small, safe facts for the agent via data-ai-context. */}
                <span hidden data-ai-context="currentPageKind">
                    helpdesk-console
                </span>
                <span hidden data-ai-context="activeTicketId">
                    {activeTicket.id}
                </span>

                <main className="layout">
                    <section className="queue" aria-labelledby="queue-heading">
                        <h2 id="queue-heading">Open tickets</h2>
                        <ul className="ticket-list">
                            {tickets.map((ticket) => (
                                <li
                                    key={ticket.id}
                                    className={
                                        ticket.id === activeTicket.id
                                            ? "ticket-row selected"
                                            : "ticket-row"
                                    }
                                >
                                    <button type="button" onClick={() => setActiveId(ticket.id)}>
                                        <span className="ticket-id">{ticket.id}</span>
                                        <span className="ticket-subject">{ticket.subject}</span>
                                        <span className={`pill ${ticket.priority}`}>
                                            {ticket.priority}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <aside className="detail" aria-labelledby="detail-heading">
                        <p className="eyebrow">{activeTicket.queue} queue</p>
                        <h2 id="detail-heading">{activeTicket.subject}</h2>
                        <p className="customer">{activeTicket.customer}</p>
                        <p className="summary">{activeTicket.summary}</p>

                        <label className="field">
                            Case reference
                            {/* Opted into snapshots via #case-reference in safeValueSelectors. */}
                            <input
                                id="case-reference"
                                value={caseReference}
                                onChange={(event) => setCaseReference(event.target.value)}
                            />
                        </label>

                        {/* Sensitive region — never captured in a page snapshot. */}
                        <section className="internal" data-wp-nova-ignore>
                            <h3>Internal notes (private)</h3>
                            <p>Escalation contact: pat@aurora.example — do not share with the agent.</p>
                        </section>
                    </aside>
                </main>
            </div>
        </NovaChatProvider>
    );
}

function readPriority(value: unknown): Priority {
    if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
        return value;
    }
    return "normal";
}
