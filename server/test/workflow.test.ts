import assert from "node:assert/strict";
import test from "node:test";
import { canTransition, isIssueStatus, type IssueStatus } from "../src/workflow.js";

test("the workflow accepts only the three forward moves and reopen", () => {
  const allowed: [IssueStatus, IssueStatus][] = [
    ["Open", "In progress"],
    ["In progress", "In review"],
    ["In review", "Closed"],
    ["Closed", "Open"],
  ];
  for (const [current, next] of allowed) {
    assert.equal(canTransition(current, next), true);
  }
});

test("the workflow rejects skipping steps and moving backwards", () => {
  const rejected: [IssueStatus, IssueStatus][] = [
    ["Open", "In review"],
    ["Open", "Closed"],
    ["In progress", "Open"],
    ["In review", "In progress"],
    ["Closed", "In progress"],
    ["Closed", "In review"],
  ];
  for (const [current, next] of rejected) {
    assert.equal(canTransition(current, next), false);
  }
});

test("a same-status transition is not considered a workflow move", () => {
  for (const status of ["Open", "In progress", "In review", "Closed"] as const) {
    assert.equal(canTransition(status, status), false);
  }
});

test("status validation rejects values outside the fixed workflow", () => {
  assert.equal(isIssueStatus("Open"), true);
  assert.equal(isIssueStatus("Blocked"), false);
  assert.equal(isIssueStatus("closed"), false);
});
