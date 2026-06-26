import { NovaChatProvider, type NovaToolDefinition } from "@wp-nova/sdk-react";
import { useMemo, useState } from "react";

type ManifestStatus = "On time" | "Hold" | "Delayed" | "Released";

interface Shipment {
    id: string;
    customer: string;
    route: string;
    eta: string;
    load: string;
    status: ManifestStatus;
    risk: "Low" | "Medium" | "High";
    gate: string;
    note: string;
}

interface CrewTask {
    id: string;
    team: string;
    assignment: string;
    yard: string;
    status: "Queued" | "Rolling" | "Complete";
}

interface LogEvent {
    id: string;
    kind: string;
    message: string;
    time: string;
}

interface SupportTicket {
    id: string;
    title: string;
    priority: "low" | "normal" | "high";
    manifestId: string;
    url: string;
}

interface SdkSettings {
    publicSurfaceId: string;
    baseUrl: string;
    tokenEndpoint: string;
    safeValueSelectors: string;
}

const DEFAULT_SAFE_SELECTORS = "#rail-filter, #crew-note, [data-agent-readable-field]";

const initialShipments: Shipment[] = [
    {
        id: "MN-4107",
        customer: "Arden Solar Components",
        route: "Tacoma Terminal -> Boise Spur",
        eta: "2026-06-25 19:40",
        load: "Inverters, 18 pallets",
        status: "Hold",
        risk: "High",
        gate: "North Gate 4",
        note: "Customs seal mismatch reported at handoff.",
    },
    {
        id: "MN-4112",
        customer: "Kestrel Grocery Co-op",
        route: "Portland Cold Yard -> Spokane Depot",
        eta: "2026-06-26 07:15",
        load: "Refrigerated produce",
        status: "On time",
        risk: "Medium",
        gate: "Cool Dock 2",
        note: "Temperature checks must stay below 3 C.",
    },
    {
        id: "MN-4119",
        customer: "Northline Medical",
        route: "Seattle Intermodal -> Missoula Clinic",
        eta: "2026-06-25 22:10",
        load: "Diagnostic carts",
        status: "Delayed",
        risk: "Medium",
        gate: "South Gate 1",
        note: "Receiver asked for liftgate confirmation.",
    },
    {
        id: "MN-4124",
        customer: "Copper Ridge Timber",
        route: "Everett Yard -> Helena Mill",
        eta: "2026-06-27 05:30",
        load: "Machine parts",
        status: "Released",
        risk: "Low",
        gate: "Track 8",
        note: "Ready for overnight pickup.",
    },
];
const defaultShipment = requireFixture(initialShipments, "initialShipments");

const initialCrewTasks: CrewTask[] = [
    {
        id: "CREW-71",
        team: "Signal North",
        assignment: "Inspect Track 8 switch heater",
        yard: "Everett",
        status: "Rolling",
    },
    {
        id: "CREW-82",
        team: "Cold Chain",
        assignment: "Verify reefer telemetry before Spokane departure",
        yard: "Portland",
        status: "Queued",
    },
];

const initialTickets: SupportTicket[] = [
    {
        id: "TCK-1041",
        title: "Customs seal mismatch needs review",
        priority: "high",
        manifestId: "MN-4107",
        url: "https://example.test/tickets/TCK-1041",
    },
];

export function App() {
    const [shipments, setShipments] = useState(initialShipments);
    const [crewTasks, setCrewTasks] = useState(initialCrewTasks);
    const [tickets, setTickets] = useState(initialTickets);
    const [activeManifestId, setActiveManifestId] = useState(defaultShipment.id);
    const [filter, setFilter] = useState("");
    const [crewNote, setCrewNote] = useState("Stage an inspector at North Gate 4.");
    const [banner, setBanner] = useState("North yard capacity is 82 percent.");
    const [events, setEvents] = useState<LogEvent[]>([
        createEvent("system", "React example loaded with rail operations fixture data."),
    ]);
    const settings = useMemo(readInitialSettings, []);

    const activeShipment =
        shipments.find((shipment) => shipment.id === activeManifestId) ?? defaultShipment;
    const visibleShipments = shipments.filter((shipment) => {
        const query = filter.toLowerCase();
        return [shipment.id, shipment.customer, shipment.route, shipment.status]
            .join(" ")
            .toLowerCase()
            .includes(query);
    });

    const config = useMemo(
        () => ({
            publicSurfaceId: settings.publicSurfaceId,
            tokenEndpoint: settings.tokenEndpoint,
            baseUrl: settings.baseUrl,
            title: "RailOps assistant",
            accent: "#167c80",
            triggerColor: "#f0a202",
            triggerIconColor: "dark",
            safeValueSelectors: parseSelectorList(settings.safeValueSelectors),
            voiceMode: true,
        }),
        [settings],
    );

    const tools = useMemo<NovaToolDefinition[]>(
        () => [
            {
                name: "focus_manifest",
                description: "Focuses the freight board on a specific manifest and returns it.",
                inputSchema: {
                    type: "object",
                    properties: { manifestId: { type: "string" } },
                    required: ["manifestId"],
                },
                mutating: false,
                handler: (args) => {
                    const requestedId = String(args.manifestId ?? activeManifestId);
                    const shipment = shipments.find((candidate) => candidate.id === requestedId);
                    if (!shipment) return { ok: false, reason: "Manifest not found." };

                    setActiveManifestId(shipment.id);
                    recordEvent(setEvents, "tool", `Focused manifest ${shipment.id}.`);
                    return { ok: true, shipment };
                },
            },
            {
                name: "update_manifest_status",
                description: "Changes the status of a freight manifest on the operations board.",
                inputSchema: {
                    type: "object",
                    properties: {
                        manifestId: { type: "string" },
                        status: {
                            type: "string",
                            enum: ["On time", "Hold", "Delayed", "Released"],
                        },
                    },
                    required: ["manifestId", "status"],
                },
                mutating: true,
                confirmationCopy: "Change this manifest status?",
                handler: (args) => {
                    const requestedId = String(args.manifestId ?? activeManifestId);
                    const status = readManifestStatus(args.status);
                    let updated: Shipment | undefined;

                    setShipments((current) =>
                        current.map((shipment) => {
                            if (shipment.id !== requestedId) return shipment;
                            updated = { ...shipment, status };
                            return updated;
                        }),
                    );

                    if (!updated) return { ok: false, reason: "Manifest not found." };

                    setActiveManifestId(updated.id);
                    recordEvent(setEvents, "tool", `${updated.id} status changed to ${status}.`);
                    return { ok: true, shipment: updated };
                },
            },
            {
                name: "dispatch_yard_crew",
                description: "Creates a new yard crew task for the selected shipment or gate.",
                inputSchema: {
                    type: "object",
                    properties: {
                        yard: { type: "string" },
                        assignment: { type: "string" },
                        team: { type: "string" },
                    },
                    required: ["assignment"],
                },
                mutating: true,
                confirmationCopy: "Dispatch this yard crew?",
                handler: (args) => {
                    const yard = String(args.yard ?? activeShipment.gate);
                    const assignment = String(args.assignment ?? crewNote);
                    const task: CrewTask = {
                        id: `CREW-${Math.floor(100 + Math.random() * 800)}`,
                        team: String(args.team ?? "Rapid Response"),
                        assignment,
                        yard,
                        status: "Queued",
                    };

                    setCrewTasks((current) => [task, ...current]);
                    recordEvent(setEvents, "tool", `${task.team} dispatched to ${yard}.`);
                    return { ok: true, task };
                },
            },
            {
                name: "post_control_note",
                description: "Updates the visible operations banner with a control room note.",
                inputSchema: {
                    type: "object",
                    properties: { message: { type: "string" } },
                    required: ["message"],
                },
                mutating: true,
                confirmationCopy: "Post this control note?",
                handler: (args) => {
                    const message = String(args.message ?? "Control note received.");
                    setBanner(message);
                    recordEvent(setEvents, "tool", `Banner updated: ${message}`);
                    return { ok: true, message };
                },
            },
            {
                name: "get_control_snapshot",
                description: "Returns current rail operations data visible in the example app.",
                inputSchema: { type: "object", properties: {} },
                mutating: false,
                handler: () => ({
                    activeManifest: activeShipment,
                    visibleShipments,
                    crewTasks,
                    tickets,
                    banner,
                    filter,
                }),
            },
            {
                name: "create_ticket",
                description:
                    "Creates a support ticket for the active freight manifest and returns its link.",
                inputSchema: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        priority: { type: "string", enum: ["low", "normal", "high"] },
                        manifestId: { type: "string" },
                    },
                    required: ["title"],
                },
                mutating: true,
                confirmationCopy: "Create this support ticket?",
                handler: (args) => {
                    const manifestId = String(args.manifestId ?? activeShipment.id);
                    const ticketId = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
                    const ticketUrl = `https://example.test/tickets/${ticketId}`;
                    const ticket: SupportTicket = {
                        id: ticketId,
                        title: String(args.title ?? `Review manifest ${manifestId}`),
                        priority: readTicketPriority(args.priority),
                        manifestId,
                        url: ticketUrl,
                    };

                    setTickets((current) => [ticket, ...current]);
                    recordEvent(setEvents, "tool", `Created ticket ${ticket.id}.`);
                    return { ok: true, ticketId, ticketUrl, ticket };
                },
            },
        ],
        [
            activeManifestId,
            activeShipment,
            banner,
            crewNote,
            crewTasks,
            filter,
            shipments,
            tickets,
            visibleShipments,
        ],
    );

    const enabled = Boolean(settings.publicSurfaceId.trim());

    return (
        <NovaChatProvider config={config} enabled={enabled} tools={tools}>
            <div className="app-shell">
                <header className="ops-header">
                    <div>
                        <p className="eyebrow">RailOps Control Desk</p>
                        <h1>West Corridor Freight Board</h1>
                    </div>
                    <div className="ops-status" role="status" aria-label="Current yard status">
                        <span>Shift Delta</span>
                        <strong data-agent-readable-field>{banner}</strong>
                    </div>
                </header>

                <main className="dashboard" aria-label="Rail operations workspace">
                    <span className="sr-only" data-ai-context="currentPageKind">
                        rail-operations
                    </span>
                    <span className="sr-only" data-ai-context="activeManifestId">
                        {activeShipment.id}
                    </span>
                    <span className="sr-only" data-ai-context="activeRisk">
                        {activeShipment.risk}
                    </span>

                    <section className="manifest-panel" aria-labelledby="manifest-heading">
                        <div className="section-heading">
                            <div>
                                <p className="eyebrow">Manifest queue</p>
                                <h2 id="manifest-heading">Priority shipments</h2>
                            </div>
                            <label className="compact-field">
                                Filter
                                <input
                                    id="rail-filter"
                                    value={filter}
                                    onChange={(event) => setFilter(event.target.value)}
                                    placeholder="customer, manifest, status"
                                />
                            </label>
                        </div>

                        <div className="manifest-grid">
                            {visibleShipments.map((shipment) => (
                                <article
                                    className={
                                        shipment.id === activeShipment.id
                                            ? "manifest-card selected"
                                            : "manifest-card"
                                    }
                                    key={shipment.id}
                                    data-ai-context={`manifest-${shipment.id}`}
                                >
                                    <div>
                                        <p className="manifest-id">{shipment.id}</p>
                                        <h3>{shipment.customer}</h3>
                                        <p>{shipment.route}</p>
                                    </div>
                                    <dl>
                                        <div>
                                            <dt>ETA</dt>
                                            <dd>{shipment.eta}</dd>
                                        </div>
                                        <div>
                                            <dt>Load</dt>
                                            <dd>{shipment.load}</dd>
                                        </div>
                                        <div>
                                            <dt>Risk</dt>
                                            <dd>{shipment.risk}</dd>
                                        </div>
                                    </dl>
                                    <div className="card-actions">
                                        <span className={`status ${statusClass(shipment.status)}`}>
                                            {shipment.status}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActiveManifestId(shipment.id);
                                                recordEvent(
                                                    setEvents,
                                                    "button",
                                                    `Focused ${shipment.id}.`,
                                                );
                                            }}
                                        >
                                            Focus
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateShipmentStatus(shipment.id, "Hold")
                                            }
                                        >
                                            Hold
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateShipmentStatus(shipment.id, "Released")
                                            }
                                        >
                                            Release
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    <aside className="active-panel" aria-labelledby="active-heading">
                        <p className="eyebrow">Current manifest</p>
                        <h2 id="active-heading">{activeShipment.id}</h2>
                        <p className="active-customer">{activeShipment.customer}</p>
                        <dl className="active-details">
                            <div>
                                <dt>Gate</dt>
                                <dd>{activeShipment.gate}</dd>
                            </div>
                            <div>
                                <dt>Status</dt>
                                <dd>{activeShipment.status}</dd>
                            </div>
                            <div>
                                <dt>Exception note</dt>
                                <dd>{activeShipment.note}</dd>
                            </div>
                        </dl>
                        <label>
                            Crew note
                            <textarea
                                id="crew-note"
                                value={crewNote}
                                onChange={(event) => setCrewNote(event.target.value)}
                            />
                        </label>
                        <div className="action-row">
                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => {
                                    const task: CrewTask = {
                                        id: `CREW-${Math.floor(100 + Math.random() * 800)}`,
                                        team: "Rapid Response",
                                        assignment: crewNote,
                                        yard: activeShipment.gate,
                                        status: "Queued",
                                    };
                                    setCrewTasks((current) => [task, ...current]);
                                    recordEvent(
                                        setEvents,
                                        "button",
                                        `${task.team} dispatched to ${task.yard}.`,
                                    );
                                }}
                            >
                                Dispatch crew
                            </button>
                            <button
                                type="button"
                                onClick={() => updateShipmentStatus(activeShipment.id, "Delayed")}
                            >
                                Mark delayed
                            </button>
                        </div>
                    </aside>

                    <section className="crew-panel" aria-labelledby="crew-heading">
                        <div className="section-heading">
                            <div>
                                <p className="eyebrow">Yard response</p>
                                <h2 id="crew-heading">Crew board</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setCrewTasks((current) =>
                                        current.map((task, index) =>
                                            index === 0 ? { ...task, status: "Complete" } : task,
                                        ),
                                    );
                                    recordEvent(setEvents, "button", "Top crew task completed.");
                                }}
                            >
                                Complete top task
                            </button>
                        </div>
                        <div className="task-list">
                            {crewTasks.map((task) => (
                                <article className="task-card" key={task.id}>
                                    <div>
                                        <p className="manifest-id">{task.id}</p>
                                        <h3>{task.team}</h3>
                                        <p>{task.assignment}</p>
                                    </div>
                                    <span>{task.yard}</span>
                                    <strong>{task.status}</strong>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="ticket-panel" aria-labelledby="tickets-heading">
                        <div className="section-heading">
                            <div>
                                <p className="eyebrow">SDK page tool</p>
                                <h2 id="tickets-heading">Support tickets</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const ticket = createTicket(
                                        `Manual review for ${activeShipment.id}`,
                                        "normal",
                                        activeShipment.id,
                                    );
                                    setTickets((current) => [ticket, ...current]);
                                    recordEvent(setEvents, "button", `Created ${ticket.id}.`);
                                }}
                            >
                                Create test ticket
                            </button>
                        </div>
                        <div className="ticket-list" data-ai-context="supportTickets">
                            {tickets.map((ticket) => (
                                <article className="ticket-card" key={ticket.id}>
                                    <div>
                                        <p className="manifest-id">{ticket.id}</p>
                                        <h3>{ticket.title}</h3>
                                        <p>{ticket.manifestId}</p>
                                    </div>
                                    <span className={`priority ${ticket.priority}`}>
                                        {ticket.priority}
                                    </span>
                                    <a href={ticket.url}>{ticket.url}</a>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="event-panel" aria-labelledby="events-heading">
                        <div className="section-heading">
                            <div>
                                <p className="eyebrow">Audit trail</p>
                                <h2 id="events-heading">Host page events</h2>
                            </div>
                            <button type="button" onClick={() => setEvents([])}>
                                Clear
                            </button>
                        </div>
                        <ol className="event-list">
                            {events.map((event) => (
                                <li key={event.id}>
                                    <span>{event.time}</span>
                                    <strong>{event.kind}</strong>
                                    <p>{event.message}</p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </main>
            </div>
        </NovaChatProvider>
    );

    function updateShipmentStatus(id: string, status: ManifestStatus) {
        setShipments((current) =>
            current.map((shipment) => (shipment.id === id ? { ...shipment, status } : shipment)),
        );
        recordEvent(setEvents, "button", `${id} status changed to ${status}.`);
    }
}

function readInitialSettings(): SdkSettings {
    const query = new URLSearchParams(window.location.search);

    return {
        publicSurfaceId: query.get("surface") || import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID || "",
        baseUrl:
            query.get("baseUrl") || import.meta.env.VITE_NOVA_BASE_URL || "http://localhost:5173",
        tokenEndpoint:
            query.get("tokenEndpoint") ||
            import.meta.env.VITE_NOVA_TOKEN_ENDPOINT ||
            "/api/nova-token",
        safeValueSelectors: DEFAULT_SAFE_SELECTORS,
    };
}

function parseSelectorList(value: string): string[] {
    return value
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean);
}

function readManifestStatus(value: unknown): ManifestStatus {
    if (value === "On time" || value === "Hold" || value === "Delayed" || value === "Released") {
        return value;
    }
    return "Hold";
}

function readTicketPriority(value: unknown): SupportTicket["priority"] {
    if (value === "low" || value === "normal" || value === "high") return value;
    return "normal";
}

function createTicket(
    title: string,
    priority: SupportTicket["priority"],
    manifestId: string,
): SupportTicket {
    const id = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
    return {
        id,
        title,
        priority,
        manifestId,
        url: `https://example.test/tickets/${id}`,
    };
}

function statusClass(status: ManifestStatus): string {
    return status.toLowerCase().replace(" ", "-");
}

function createEvent(kind: string, message: string): LogEvent {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind,
        message,
        time: new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).format(new Date()),
    };
}

function recordEvent(
    setEvents: (updater: (current: LogEvent[]) => LogEvent[]) => void,
    kind: string,
    message: string,
): void {
    setEvents((current) => [createEvent(kind, message), ...current].slice(0, 8));
}

function requireFixture<T>(items: T[], name: string): T {
    const item = items[0];
    if (!item) throw new Error(`${name} must contain at least one item.`);
    return item;
}
