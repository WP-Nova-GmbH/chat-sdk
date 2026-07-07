import { useNovaTool } from "@wp-nova/chat-sdk-react";
import type { Ticket } from "./App";

interface CreateTicketToolProps {
    activeTicketId: string;
    onCreate: (ticket: Ticket) => void;
}

// Demonstrates the docs: React "Registering Tools with a Hook". useNovaTool
// registers a tool that belongs to this feature component and unregisters it
// automatically when the component unmounts.
export function CreateTicketTool({ activeTicketId, onCreate }: CreateTicketToolProps) {
    useNovaTool({
        name: "create_ticket",
        description: "Creates a follow-up support ticket and returns its id and queue.",
        inputSchema: {
            type: "object",
            properties: {
                subject: { type: "string" },
                customer: { type: "string" },
                priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
            },
            required: ["subject"],
        },
        mutating: true,
        confirmationCopy: "Create this support ticket?",
        handler: (args) => {
            const ticket: Ticket = {
                id: `AUR-${Math.floor(4900 + Math.random() * 99)}`,
                subject: String(args.subject ?? `Follow up on ${activeTicketId}`),
                customer: String(args.customer ?? "Aurora customer"),
                priority: readPriority(args.priority),
                queue: "Triage",
                summary: "Created from the Nova assistant.",
            };
            onCreate(ticket);
            return { ok: true, ticketId: ticket.id, queue: ticket.queue };
        },
    });

    return null;
}

function readPriority(value: unknown): Ticket["priority"] {
    if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
        return value;
    }
    return "normal";
}
