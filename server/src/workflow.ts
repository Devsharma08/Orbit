export const ISSUE_STATUSES = [
  "Open",
  "In progress",
  "In review",
  "Closed",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

const allowedTransitions: Record<IssueStatus, readonly IssueStatus[]> = {
  Open: ["In progress"],
  "In progress": ["In review"],
  "In review": ["Closed"],
  Closed: ["Open"],
};

export function isIssueStatus(value: string): value is IssueStatus {
  return ISSUE_STATUSES.some((status) => status === value);
}

export function canTransition(
  current: IssueStatus,
  next: IssueStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}
