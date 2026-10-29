import { z } from "zod";
import { ISSUE_STATUSES } from "./workflow.js";

const trimmedText = (max: number) => z.string().trim().min(1).max(max);

export const loginSchema = z.object({
  username: trimmedText(80),
  password: z.string().min(1).max(200),
});

export const projectSchema = z.object({
  name: trimmedText(80),
  key: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Za-z][A-Za-z0-9]+$/, "Use 2–8 letters and numbers."),
  description: z.string().trim().max(500).default(""),
});

export const memberSchema = z.object({
  username: trimmedText(80),
});

export const issueCreateSchema = z.object({
  title: trimmedText(160),
  description: z.string().max(10_000).default(""),
  type: z.enum(["bug", "task"]),
  priority: z.enum(["Urgent", "High", "Medium", "Low"]),
  labels: z.array(trimmedText(32)).max(10).default([]),
  assigneeId: z.number().int().positive().nullable().default(null),
});

export const issuePatchSchema = z
  .object({
    title: trimmedText(160).optional(),
    description: z.string().max(10_000).optional(),
    type: z.enum(["bug", "task"]).optional(),
    priority: z.enum(["Urgent", "High", "Medium", "Low"]).optional(),
    labels: z.array(trimmedText(32)).max(10).optional(),
    assigneeId: z.number().int().positive().nullable().optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const commentSchema = z.object({
  body: trimmedText(5000),
});

export const issueListQuerySchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(["Urgent", "High", "Medium", "Low"]).optional(),
  assignee: z.coerce.number().int().positive().optional(),
  label: z.string().trim().min(1).max(32).optional(),
  search: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
