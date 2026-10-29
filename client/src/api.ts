const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export interface User {
  id: number;
  username: string;
  name: string;
}

export interface Project {
  id: number;
  name: string;
  key: string;
  description: string;
  role?: "owner" | "member";
  memberCount?: number;
}

export interface Issue {
  id: number;
  projectId: number;
  projectKey?: string;
  title: string;
  description: string;
  type: "bug" | "task";
  status: "Open" | "In progress" | "In review" | "Closed";
  priority: "Urgent" | "High" | "Medium" | "Low";
  labels: string[];
  assigneeId: number | null;
  assigneeName?: string | null;
  assigneeUsername?: string | null;
  creatorName?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
  commentCount?: number;
}

export interface Comment {
  id: number;
  body: string;
  createdAt: string;
  authorId?: number;
  authorName?: string;
  authorUsername?: string;
}

export interface HistoryEntry {
  id: number;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
  actorName: string | null;
  actorUsername: string | null;
}

export interface ProjectMember extends User {
  role: "owner" | "member";
}

export interface IssuePage {
  issues: Issue[];
  pagination: { page: number; limit: number; total: number; pages: number };
  summary: { total: number; inProgress: number; completed: number };
  availableLabels: string[];
}

export interface IssueFilters {
  status?: string;
  priority?: string;
  assignee?: string;
  label?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    details?: { field: string; message: string }[];
  };
  if (!response.ok) {
    const details = data.details?.map((item) => `${item.field}: ${item.message}`);
    throw new ApiError(
      [data.error ?? "The request could not be completed.", ...(details ?? [])]
        .join(" "),
      response.status,
    );
  }
  return data as T;
}
