import assert from "node:assert/strict";
import test from "node:test";
import {
  commentSchema,
  issueCreateSchema,
  issueListQuerySchema,
  issuePatchSchema,
  projectSchema,
} from "../src/validation.js";

test("issue creation validates required fields and applies safe defaults", () => {
  const issue = issueCreateSchema.parse({
    title: "  Login fails  ",
    type: "bug",
    priority: "High",
  });
  assert.equal(issue.title, "Login fails");
  assert.deepEqual(issue.labels, []);
  assert.equal(issue.status, undefined);
  assert.equal(issue.assigneeId, null);
});

test("issue creation rejects invalid enums and oversized titles", () => {
  assert.equal(issueCreateSchema.safeParse({
    title: "Bug",
    type: "incident",
    priority: "High",
  }).success, false);
  assert.equal(issueCreateSchema.safeParse({
    title: "x".repeat(161),
    type: "bug",
    priority: "High",
  }).success, false);
});

test("issue edits reject empty patches and invalid workflow statuses", () => {
  assert.equal(issuePatchSchema.safeParse({}).success, false);
  assert.equal(issuePatchSchema.safeParse({ status: "Blocked" }).success, false);
  assert.equal(issuePatchSchema.safeParse({ priority: "Urgent" }).success, true);
});

test("issue-list filters enforce bounded pagination and safe filter values", () => {
  assert.deepEqual(issueListQuerySchema.parse({ page: "2", limit: "25" }), {
    page: 2,
    limit: 25,
    search: "",
  });
  assert.equal(issueListQuerySchema.safeParse({ limit: "1000" }).success, false);
  assert.equal(issueListQuerySchema.safeParse({ status: "Nope" }).success, false);
});

test("projects and comments validate their user-controlled text", () => {
  assert.equal(projectSchema.safeParse({
    name: "Orbit",
    key: "ORB",
  }).success, true);
  assert.equal(projectSchema.safeParse({
    name: "Orbit",
    key: "bad key",
  }).success, false);
  assert.equal(commentSchema.safeParse({ body: "A useful note" }).success, true);
  assert.equal(commentSchema.safeParse({ body: "  " }).success, false);
});
