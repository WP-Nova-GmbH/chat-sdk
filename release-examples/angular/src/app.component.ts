import { Component, computed, inject, signal } from "@angular/core";
import { NovaChatComponent, type ToolDefinition } from "@wp-nova/chat-sdk-angular";
import { DispatchToolRegistration } from "./dispatch-tools.service";

// Switchyard Dispatch — a field-service board that consumes the RELEASED
// @wp-nova/chat-sdk-angular wrapper. State is held in signals so the view stays
// correct under zoneless change detection, including when the agent mutates it
// through a tool handler.

type JobStatus = "Queued" | "En route" | "On site" | "Closed";

interface Job {
    id: string;
    route: string;
    technician: string;
    status: JobStatus;
    priority: "low" | "normal" | "high";
    summary: string;
}

const INITIAL_JOBS: Job[] = [
    {
        id: "SY-318",
        route: "North yard signal heater",
        technician: "Dana Powell",
        status: "En route",
        priority: "high",
        summary: "Heater tripping the breaker on switch 7; bring spare relay.",
    },
    {
        id: "SY-322",
        route: "Cold dock reefer telemetry",
        technician: "Ravi Shah",
        status: "Queued",
        priority: "normal",
        summary: "Telemetry gap before the Spokane departure window.",
    },
    {
        id: "SY-329",
        route: "Track 8 inspection",
        technician: "Lena Ortiz",
        status: "On site",
        priority: "low",
        summary: "Routine overnight inspection; confirm liftgate clearance.",
    },
];

@Component({
    standalone: true,
    selector: "app-root",
    imports: [NovaChatComponent],
    template: `
        <!-- Docs: Angular > Component Mount + Disabling Chat. -->
        <wp-nova-chat-mount [tools]="tools" [enabled]="chatEnabled()" />

        <div class="app-shell">
            <header class="masthead">
                <div>
                    <p class="eyebrow">Switchyard Dispatch</p>
                    <h1>Control desk</h1>
                </div>
                <p class="banner" role="status">{{ banner() }}</p>
            </header>

            @if (!chatEnabled()) {
                <p class="notice">
                    Set <code>VITE_NOVA_PUBLIC_SURFACE_ID</code> in <code>.env</code> to mount the
                    chat launcher.
                </p>
            }

            <!-- data-ai-context is only captured from VISIBLE, in-viewport,
                 non-sensitive elements, so these render as a small context line. -->
            <p class="context">
                <span data-ai-context="currentPageKind">dispatch-board</span>
                <span data-ai-context="activeJobId">{{ activeJob().id }}</span>
            </p>

            <main class="layout">
                <section class="board" aria-labelledby="board-heading">
                    <h2 id="board-heading">Active jobs</h2>
                    <ul class="job-list">
                        @for (job of jobs(); track job.id) {
                            <li [class.selected]="job.id === activeJob().id" class="job-row">
                                <button type="button" (click)="focusJob(job.id)">
                                    <span class="job-id">{{ job.id }}</span>
                                    <span class="job-route">{{ job.route }}</span>
                                    <span class="pill {{ job.priority }}">{{ job.priority }}</span>
                                    <strong class="status">{{ job.status }}</strong>
                                </button>
                            </li>
                        }
                    </ul>
                </section>

                <aside class="detail" aria-labelledby="detail-heading">
                    <p class="eyebrow">{{ activeJob().technician }}</p>
                    <h2 id="detail-heading">{{ activeJob().route }}</h2>
                    <p class="summary">{{ activeJob().summary }}</p>

                    <label class="field">
                        Dispatch reference
                        <!-- Opted into snapshots via #dispatch-reference in safeValueSelectors. -->
                        <input
                            id="dispatch-reference"
                            [value]="dispatchReference()"
                            (input)="setDispatchReference($event)"
                        />
                    </label>

                    <p class="ack">{{ tools_ack.lastAcknowledgement() }}</p>

                    <!-- Sensitive region — never captured in a page snapshot. -->
                    <section class="internal" data-wp-nova-ignore>
                        <h3>Internal contact (private)</h3>
                        <p>On-call lead: 555-0142 — do not share with the agent.</p>
                    </section>
                </aside>
            </main>
        </div>
    `,
})
export class AppComponent {
    protected readonly tools_ack = inject(DispatchToolRegistration);

    protected readonly jobs = signal<Job[]>(INITIAL_JOBS);
    protected readonly activeJobId = signal<string>(INITIAL_JOBS[0]?.id ?? "");
    protected readonly dispatchReference = signal<string>("REF-SY-2026-318");
    protected readonly banner = signal<string>("Two crews rolling, one on site.");

    protected readonly activeJob = computed<Job>(() => {
        const id = this.activeJobId();
        return this.jobs().find((job) => job.id === id) ?? (INITIAL_JOBS[0] as Job);
    });

    protected readonly chatEnabled = computed(
        () => (import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID ?? "").trim().length > 0,
    );

    // Docs: Angular > Component Mount. Stable tool definitions passed to the
    // standalone component; it (re)registers on change and unregisters on destroy.
    protected readonly tools: ToolDefinition[] = [
        {
            name: "focus_job",
            description: "Focuses the dispatch board on a job and returns its details.",
            inputSchema: {
                type: "object",
                properties: { jobId: { type: "string" } },
                required: ["jobId"],
            },
            mutating: false,
            handler: (args) => {
                const jobId = String(args["jobId"] ?? "");
                const job = this.jobs().find((candidate) => candidate.id === jobId);
                if (!job) return { ok: false, reason: "Job not found." };
                this.activeJobId.set(job.id);
                return { ok: true, job };
            },
        },
        {
            name: "set_job_status",
            description: "Changes the status of a dispatch job on the board.",
            inputSchema: {
                type: "object",
                properties: {
                    jobId: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["Queued", "En route", "On site", "Closed"],
                    },
                },
                required: ["jobId", "status"],
            },
            mutating: true,
            confirmationCopy: "Change this job's status?",
            handler: (args) => {
                const jobId = String(args["jobId"] ?? this.activeJobId());
                const status = readStatus(args["status"]);
                let updated: Job | undefined;
                this.jobs.update((current) =>
                    current.map((job) => {
                        if (job.id !== jobId) return job;
                        updated = { ...job, status };
                        return updated;
                    }),
                );
                if (!updated) return { ok: false, reason: "Job not found." };
                this.activeJobId.set(updated.id);
                return { ok: true, job: updated };
            },
        },
        {
            name: "post_dispatch_note",
            description: "Updates the visible control-desk banner with a short note.",
            inputSchema: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"],
            },
            mutating: true,
            confirmationCopy: "Post this dispatch note?",
            handler: (args) => {
                const message = String(args["message"] ?? "");
                this.banner.set(message);
                return { ok: true, message };
            },
        },
        {
            name: "get_board_snapshot",
            description: "Returns the dispatch data currently visible on the board.",
            inputSchema: { type: "object", properties: {} },
            mutating: false,
            handler: () => ({
                activeJob: this.activeJob(),
                jobs: this.jobs(),
                banner: this.banner(),
                dispatchReference: this.dispatchReference(),
            }),
        },
    ];

    constructor() {
        // Register the service-owned tool (docs: Angular > Service API).
        this.tools_ack.register();
    }

    protected focusJob(jobId: string): void {
        this.activeJobId.set(jobId);
    }

    protected setDispatchReference(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLInputElement) this.dispatchReference.set(target.value);
    }
}

function readStatus(value: unknown): JobStatus {
    if (value === "Queued" || value === "En route" || value === "On site" || value === "Closed") {
        return value;
    }
    return "Queued";
}
