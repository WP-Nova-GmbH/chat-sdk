import { Component } from "@angular/core";
import { NovaChatComponent, type SdkConfig, type ToolDefinition } from "@wp-nova/sdk-angular";

type StayStatus = "Inquiry" | "Reserved" | "In house" | "Follow up";

interface Stay {
    id: string;
    guest: string;
    packageName: string;
    dates: string;
    party: string;
    status: StayStatus;
    preference: string;
    publicNote: string;
    privateCode: string;
}

interface ConciergeTask {
    id: string;
    label: string;
    owner: string;
    due: string;
    done: boolean;
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

const DEFAULT_SAFE_SELECTORS = "#guest-search, #arrival-note, [data-agent-readable-field]";

const initialStays: Stay[] = [
    {
        id: "HF-204",
        guest: "Mira Alvarez",
        packageName: "Tidepool Renewal Weekend",
        dates: "July 12-14, 2026",
        party: "2 adults",
        status: "Reserved",
        preference: "Prefers ocean-facing room and late herbal tea.",
        publicNote: "Anniversary stay; offer the sunset ceramics class.",
        privateCode: "VIP-7781",
    },
    {
        id: "HF-219",
        guest: "Ben Okafor",
        packageName: "Forest Table Retreat",
        dates: "July 18-21, 2026",
        party: "4 guests",
        status: "Inquiry",
        preference: "Needs nut-free dinner options and ground-floor access.",
        publicNote: "Asked whether the Saturday tasting can move to 18:00.",
        privateCode: "CARD-9900",
    },
    {
        id: "HF-233",
        guest: "Aiko Tan",
        packageName: "Harbor Sketch Residency",
        dates: "August 2-9, 2026",
        party: "1 artist",
        status: "Follow up",
        preference: "Needs a north-light desk and quiet morning schedule.",
        publicNote: "Send studio map and ferry arrival instructions.",
        privateCode: "SAFE-1515",
    },
];
const defaultStay = requireFixture(initialStays, "initialStays");

const initialTasks: ConciergeTask[] = [
    {
        id: "TASK-31",
        label: "Confirm ceramics instructor for HF-204",
        owner: "Leonie",
        due: "Today 16:00",
        done: false,
    },
    {
        id: "TASK-44",
        label: "Check nut-free menu with kitchen",
        owner: "Samir",
        due: "Tomorrow 10:30",
        done: false,
    },
];

@Component({
    standalone: true,
    selector: "app-root",
    imports: [NovaChatComponent],
    template: `
        <wp-nova-chat-mount
            [config]="sdkConfig"
            [enabled]="chatEnabled"
            [tools]="tools"
        />

        <div class="site-shell">
            <header class="site-header">
                <div>
                    <p class="eyebrow">Harbor & Fern Concierge</p>
                    <h1>Guest stays and atelier requests</h1>
                </div>
                <div class="mood-board">
                    <span>Today</span>
                    <strong data-agent-readable-field>{{ banner }}</strong>
                </div>
            </header>

            <main class="concierge-layout" aria-label="Concierge workspace">
                <span class="sr-only" data-ai-context="currentPageKind">concierge-bookings</span>
                <span class="sr-only" data-ai-context="activeStayId">{{ activeStay.id }}</span>
                <span class="sr-only" data-ai-context="activeStayStatus">
                    {{ activeStay.status }}
                </span>

                <section class="gallery-band" aria-labelledby="stays-heading">
                    <div class="section-heading">
                        <div>
                            <p class="eyebrow">Guest board</p>
                            <h2 id="stays-heading">Upcoming stays</h2>
                        </div>
                        <label class="search-field">
                            Search
                            <input
                                id="guest-search"
                                [value]="guestSearch"
                                (input)="updateGuestSearch($event)"
                                placeholder="guest, package, status"
                            />
                        </label>
                    </div>

                    <div class="stay-grid">
                        @for (stay of visibleStays; track stay.id) {
                            <article
                                [class.selected]="stay.id === activeStay.id"
                                class="stay-card"
                                [attr.data-ai-context]="'stay-' + stay.id"
                            >
                                <div>
                                    <p class="stay-id">{{ stay.id }}</p>
                                    <h3>{{ stay.guest }}</h3>
                                    <p>{{ stay.packageName }}</p>
                                </div>
                                <dl>
                                    <div>
                                        <dt>Dates</dt>
                                        <dd>{{ stay.dates }}</dd>
                                    </div>
                                    <div>
                                        <dt>Party</dt>
                                        <dd>{{ stay.party }}</dd>
                                    </div>
                                    <div>
                                        <dt>Preference</dt>
                                        <dd>{{ stay.preference }}</dd>
                                    </div>
                                </dl>
                                <div class="stay-actions">
                                    <span [class]="'status ' + statusClass(stay.status)">
                                        {{ stay.status }}
                                    </span>
                                    <button type="button" (click)="selectStay(stay.id)">Select</button>
                                    <button type="button" (click)="setStayStatus(stay.id, 'Reserved')">
                                        Reserve
                                    </button>
                                    <button type="button" (click)="setStayStatus(stay.id, 'In house')">
                                        Arrived
                                    </button>
                                </div>
                            </article>
                        }
                    </div>
                </section>

                <aside class="guest-panel" aria-labelledby="active-heading">
                    <p class="eyebrow">Active stay</p>
                    <h2 id="active-heading">{{ activeStay.guest }}</h2>
                    <p class="active-package">{{ activeStay.packageName }}</p>
                    <dl class="guest-details">
                        <div>
                            <dt>Booking</dt>
                            <dd>{{ activeStay.id }}</dd>
                        </div>
                        <div>
                            <dt>Readable note</dt>
                            <dd>{{ activeStay.publicNote }}</dd>
                        </div>
                        <div>
                            <dt>Internal code</dt>
                            <dd class="private-value">{{ activeStay.privateCode }}</dd>
                        </div>
                    </dl>
                    <label>
                        Arrival note
                        <textarea
                            id="arrival-note"
                            [value]="arrivalNote"
                            (input)="updateArrivalNote($event)"
                        ></textarea>
                    </label>
                    <div class="button-row">
                        <button type="button" class="filled" (click)="addTaskFromActiveStay()">
                            Add concierge task
                        </button>
                        <button type="button" (click)="setStayStatus(activeStay.id, 'Follow up')">
                            Follow up
                        </button>
                    </div>
                </aside>

                <section class="atelier-panel" aria-labelledby="atelier-heading">
                    <div class="section-heading">
                        <div>
                            <p class="eyebrow">Atelier desk</p>
                            <h2 id="atelier-heading">Service tasks</h2>
                        </div>
                        <button type="button" (click)="completeFirstTask()">Complete first task</button>
                    </div>
                    <div class="task-strip">
                        @for (task of tasks; track task.id) {
                            <article class="task-card">
                                <div>
                                    <p class="stay-id">{{ task.id }}</p>
                                    <h3>{{ task.label }}</h3>
                                    <p>{{ task.owner }} · {{ task.due }}</p>
                                </div>
                                <strong>{{ task.done ? "Done" : "Open" }}</strong>
                            </article>
                        }
                    </div>
                </section>

                <section class="journal-panel" aria-labelledby="journal-heading">
                    <div class="section-heading">
                        <div>
                            <p class="eyebrow">Concierge journal</p>
                            <h2 id="journal-heading">Recent host events</h2>
                        </div>
                        <button type="button" (click)="events = []">Clear</button>
                    </div>
                    <ol class="event-list">
                        @for (event of events; track event.id) {
                            <li>
                                <span>{{ event.time }}</span>
                                <strong>{{ event.kind }}</strong>
                                <p>{{ event.message }}</p>
                            </li>
                        }
                    </ol>
                </section>
            </main>
        </div>
    `,
})
export class AppComponent {
    stays = [...initialStays];
    tasks = [...initialTasks];
    activeStayId = defaultStay.id;
    guestSearch = "";
    arrivalNote = "Offer warm cider at check-in and confirm ferry arrival time.";
    banner = "Rain clearing by 17:00; courtyard dinner can stay outside.";
    events: LogEvent[] = [createEvent("system", "Angular concierge example loaded.")];
    settings = readInitialSettings();
    sdkConfig = buildSdkConfig(this.settings);
    tools: ToolDefinition[] = [
        {
            name: "select_booking",
            description: "Selects a booking on the concierge board and returns the stay details.",
            inputSchema: {
                type: "object",
                properties: {
                    stayId: { type: "string" },
                    bookingId: { type: "string" },
                },
            },
            mutating: false,
            handler: (args) => this.selectBookingTool(args),
        },
        {
            name: "change_booking_status",
            description: "Changes the status for a guest booking on the concierge board.",
            inputSchema: {
                type: "object",
                properties: {
                    stayId: { type: "string" },
                    bookingId: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["Inquiry", "Reserved", "In house", "Follow up"],
                    },
                },
                required: ["status"],
            },
            mutating: true,
            confirmationCopy: "Change this booking status?",
            handler: (args) => this.changeBookingStatusTool(args),
        },
        {
            name: "add_concierge_task",
            description: "Adds a concierge service task for the current guest or booking.",
            inputSchema: {
                type: "object",
                properties: {
                    label: { type: "string" },
                    task: { type: "string" },
                    owner: { type: "string" },
                },
                required: ["label"],
            },
            mutating: true,
            confirmationCopy: "Add this concierge task?",
            handler: (args) => this.addConciergeTaskTool(args),
        },
        {
            name: "show_guest_banner",
            description: "Updates the visible concierge banner with a guest service note.",
            inputSchema: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"],
            },
            mutating: true,
            confirmationCopy: "Show this guest banner?",
            handler: (args) => this.showGuestBannerTool(args),
        },
        {
            name: "get_concierge_snapshot",
            description: "Returns current concierge data visible in the Angular example app.",
            inputSchema: { type: "object", properties: {} },
            mutating: false,
            handler: () => this.snapshot(),
        },
    ];

    get activeStay(): Stay {
        return this.stays.find((stay) => stay.id === this.activeStayId) ?? defaultStay;
    }

    get visibleStays(): Stay[] {
        const query = this.guestSearch.toLowerCase();
        return this.stays.filter((stay) =>
            [stay.id, stay.guest, stay.packageName, stay.status]
                .join(" ")
                .toLowerCase()
                .includes(query),
        );
    }

    get chatEnabled(): boolean {
        return this.settings.publicSurfaceId.trim().length > 0;
    }

    updateGuestSearch(event: Event): void {
        this.guestSearch = inputValue(event);
    }

    updateArrivalNote(event: Event): void {
        this.arrivalNote = inputValue(event);
    }

    selectStay(stayId: string): void {
        this.activeStayId = stayId;
        this.addEvent("button", `Selected stay ${stayId}.`);
    }

    setStayStatus(stayId: string, status: StayStatus): void {
        this.stays = this.stays.map((stay) => (stay.id === stayId ? { ...stay, status } : stay));
        this.activeStayId = stayId;
        this.addEvent("button", `${stayId} status changed to ${status}.`);
    }

    addTaskFromActiveStay(): ConciergeTask {
        const task = createTask(
            `Prepare arrival touchpoint for ${this.activeStay.guest}: ${this.arrivalNote}`,
            "Concierge",
        );
        this.tasks = [task, ...this.tasks];
        this.addEvent("button", `Added ${task.id} for ${this.activeStay.id}.`);
        return task;
    }

    completeFirstTask(): void {
        this.tasks = this.tasks.map((task, index) =>
            index === 0 ? { ...task, done: true } : task,
        );
        this.addEvent("button", "First concierge task completed.");
    }

    statusClass(status: StayStatus): string {
        return status.toLowerCase().replace(" ", "-");
    }

    private selectBookingTool(args: Record<string, unknown>): Record<string, unknown> {
        const stayId = String(args.stayId ?? args.bookingId ?? this.activeStayId);
        const stay = this.stays.find((candidate) => candidate.id === stayId);
        if (!stay) return { ok: false, reason: "Stay not found." };

        this.activeStayId = stay.id;
        this.addEvent("tool", `Selected booking ${stay.id}.`);
        return { ok: true, stay };
    }

    private changeBookingStatusTool(args: Record<string, unknown>): Record<string, unknown> {
        const stayId = String(args.stayId ?? args.bookingId ?? this.activeStayId);
        const status = readStayStatus(args.status);
        let updated: Stay | undefined;

        this.stays = this.stays.map((stay) => {
            if (stay.id !== stayId) return stay;
            updated = { ...stay, status };
            return updated;
        });

        if (!updated) return { ok: false, reason: "Stay not found." };

        this.activeStayId = updated.id;
        this.addEvent("tool", `${updated.id} status changed to ${status}.`);
        return { ok: true, stay: updated };
    }

    private addConciergeTaskTool(args: Record<string, unknown>): Record<string, unknown> {
        const label = String(args.label ?? args.task ?? this.arrivalNote);
        const owner = String(args.owner ?? "Concierge");
        const task = createTask(label, owner);

        this.tasks = [task, ...this.tasks];
        this.addEvent("tool", `Added concierge task ${task.id}.`);
        return { ok: true, task };
    }

    private showGuestBannerTool(args: Record<string, unknown>): Record<string, unknown> {
        const message = String(args.message ?? "Guest banner updated.");
        this.banner = message;
        this.addEvent("tool", `Banner updated: ${message}`);
        return { ok: true, message };
    }

    private snapshot(): Record<string, unknown> {
        return {
            activeStay: this.activeStay,
            visibleStays: this.visibleStays,
            tasks: this.tasks,
            banner: this.banner,
            guestSearch: this.guestSearch,
        };
    }

    private addEvent(kind: string, message: string): void {
        this.events = [createEvent(kind, message), ...this.events].slice(0, 8);
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

function buildSdkConfig(settings: SdkSettings): SdkConfig {
    return {
        publicSurfaceId: settings.publicSurfaceId,
        tokenEndpoint: settings.tokenEndpoint,
        baseUrl: settings.baseUrl,
        title: "Concierge assistant",
        accent: "#b4543a",
        triggerColor: "#276b55",
        triggerIconColor: "light",
        safeValueSelectors: parseSelectorList(settings.safeValueSelectors),
        voiceMode: true,
    };
}

function parseSelectorList(value: string): string[] {
    return value
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean);
}

function inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        ? event.target.value
        : "";
}

function readStayStatus(value: unknown): StayStatus {
    if (
        value === "Inquiry" ||
        value === "Reserved" ||
        value === "In house" ||
        value === "Follow up"
    ) {
        return value;
    }
    return "Follow up";
}

function createTask(label: string, owner: string): ConciergeTask {
    return {
        id: `TASK-${Math.floor(100 + Math.random() * 800)}`,
        label,
        owner,
        due: "Today 18:00",
        done: false,
    };
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

function requireFixture<T>(items: T[], name: string): T {
    const item = items[0];
    if (!item) throw new Error(`${name} must contain at least one item.`);
    return item;
}
