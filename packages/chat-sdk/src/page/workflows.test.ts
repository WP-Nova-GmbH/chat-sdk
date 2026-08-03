import assert from "node:assert/strict";
import test from "node:test";
import {
    matchesPageWorkflowPath,
    matchingPageWorkflow,
    pageWorkflowPathsOverlap,
} from "./workflows.js";
import type { PageWorkflowDefinition } from "../protocol/types/config.js";

test("matches exact static and :param pathname segments", () => {
    assert.equal(
        matchesPageWorkflowPath(
            "/call-center/interventions/:interventionId",
            "/call-center/interventions/2f7748e3-2ad6-4a79-a8fd-d8edb9b97a88",
        ),
        true,
    );
    assert.equal(
        matchesPageWorkflowPath(
            "/call-center/interventions/:interventionId",
            "/call-center/interventions/one/more",
        ),
        false,
    );
    assert.equal(
        matchesPageWorkflowPath(
            "/call-center/interventions/:interventionId",
            "/call-center/interventions/",
        ),
        false,
    );
    assert.equal(matchesPageWorkflowPath("/reports.v1/:id", "/reports-v1/123"), false);
});

test("returns the sole configured workflow matching a pathname", () => {
    const workflows: PageWorkflowDefinition[] = [
        {
            id: "orders",
            path: "/orders/:id",
            prompt: "Summarize the order",
            execution: { mode: "research-and-compose" },
        },
        {
            id: "intervention",
            path: "/interventions/:id",
            prompt: "Summarize the call",
            execution: { mode: "research-and-compose" },
        },
    ];

    assert.equal(matchingPageWorkflow(workflows, "/interventions/abc")?.id, "intervention");
    assert.equal(matchingPageWorkflow(workflows, "/interventions/abc/edit"), undefined);
});

test("fails closed when static and parameterized templates overlap", () => {
    const workflows: PageWorkflowDefinition[] = [
        {
            id: "all-items",
            path: "/items/:id",
            prompt: "Summarize the item",
            execution: { mode: "research-and-compose" },
        },
        {
            id: "new-item",
            path: "/items/new",
            prompt: "Explain item creation",
            execution: { mode: "research-and-compose" },
        },
    ];

    assert.equal(matchingPageWorkflow(workflows, "/items/new"), undefined);
});

test("detects overlapping static and parameterized templates at config time", () => {
    assert.equal(pageWorkflowPathsOverlap("/items/:id", "/items/new"), true);
    assert.equal(pageWorkflowPathsOverlap("/items/:id", "/orders/:id"), false);
    assert.equal(pageWorkflowPathsOverlap("/items/:id", "/items/:id/edit"), false);
});
