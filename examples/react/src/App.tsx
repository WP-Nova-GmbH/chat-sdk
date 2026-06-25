import { NovaChatProvider, type NovaToolMap } from "@wp-nova/sdk-react";
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

export function App() {
    const [shipments, setShipments] = useState(initialShipments);
    const [crewTasks, setCrewTasks] = useState(initialCrewTasks);
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
        }),
        [settings],
    );

    const tools = useMemo<NovaToolMap>(
        () => ({
            focus_manifest: (args) => {
                const requestedId = String(args.manifestId ?? activeManifestId);
                const shipment = shipments.find((candidate) => candidate.id === requestedId);
                if (!shipment) return { ok: false, reason: "Manifest not found." };

                setActiveManifestId(shipment.id);
                recordEvent(setEvents, "tool", `Focused manifest ${shipment.id}.`);
                return { ok: true, shipment };
            },
            update_manifest_status: (args) => {
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
            dispatch_yard_crew: (args) => {
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
            post_control_note: (args) => {
                const message = String(args.message ?? "Control note received.");
                setBanner(message);
                recordEvent(setEvents, "tool", `Banner updated: ${message}`);
                return { ok: true, message };
            },
            get_control_snapshot: () => ({
                activeManifest: activeShipment,
                visibleShipments,
                crewTasks,
                banner,
                filter,
            }),
        }),
        [activeManifestId, activeShipment, banner, crewNote, crewTasks, filter, shipments, visibleShipments],
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
                                            onClick={() => updateShipmentStatus(shipment.id, "Hold")}
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
        publicSurfaceId:
            query.get("surface") ||
            import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID ||
            "",
        baseUrl: query.get("baseUrl") || import.meta.env.VITE_NOVA_BASE_URL || "http://localhost:5173",
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
