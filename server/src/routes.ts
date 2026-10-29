import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createToken, type AuthenticatedRequest } from "./auth.js";
import { pool, withActor } from "./db.js";
import { HttpError } from "./errors.js";
import {
  commentSchema,
  issueCreateSchema,
  issueListQuerySchema,
  issuePatchSchema,
  loginSchema,
  memberSchema,
  projectSchema,
} from "./validation.js";
import { canTransition, type IssueStatus } from "./workflow.js";

export const router = Router();

const idSchema = z.coerce.number().int().positive();
const getUserId = (request: Request): number =>
  (request as AuthenticatedRequest).user!.id;

async function ensureProjectMember(projectId: number, userId: number) {
  const result = await pool.query(
    `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Project not found.");
}

async function ensureIssueMember(issueId: number, userId: number) {
  const result = await pool.query(
    `SELECT i.id, i.project_id, i.status FROM issues i
     JOIN project_members pm ON pm.project_id = i.project_id
     WHERE i.id = $1 AND pm.user_id = $2`,
    [issueId, userId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Issue not found.");
  return result.rows[0] as {
    id: number;
    project_id: number;
    status: IssueStatus;
  };
}

router.post("/auth/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await pool.query(
    "SELECT id, username, name, password_hash FROM users WHERE lower(username) = lower($1)",
    [input.username],
  );
  const user = result.rows[0] as
    | { id: number; username: string; name: string; password_hash: string }
    | undefined;
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw new HttpError(401, "That username or password isn't right.");
  }
  const publicUser = { id: user.id, username: user.username, name: user.name };
  res.json({ token: createToken(publicUser), user: publicUser });
});

router.get("/me", async (req, res) => {
  const result = await pool.query(
    "SELECT id, username, name FROM users WHERE id = $1",
    [getUserId(req)],
  );
  if (!result.rows[0]) throw new HttpError(401, "Your account is no longer available.");
  res.json(result.rows[0]);
});

router.get("/users", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, name FROM users ORDER BY name",
  );
  res.json(rows);
});

router.get("/projects", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.project_key AS "key", p.description,
            p.created_at AS "createdAt", pm.role,
            (SELECT count(*)::int FROM project_members members
             WHERE members.project_id = p.id) AS "memberCount"
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1
     ORDER BY p.created_at DESC, p.id DESC`,
    [getUserId(req)],
  );
  res.json(rows);
});

router.post("/projects", async (req, res) => {
  const input = projectSchema.parse(req.body);
  const userId = getUserId(req);
  const project = await withActor(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO projects (name, project_key, description, created_by)
       VALUES ($1, upper($2), $3, $4)
       RETURNING id, name, project_key AS "key", description`,
      [input.name, input.key, input.description, userId],
    );
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [result.rows[0]!.id, userId],
    );
    return result.rows[0];
  });
  res.status(201).json(project);
});

router.get("/projects/:projectId/members", async (req, res) => {
  const projectId = idSchema.parse(req.params.projectId);
  await ensureProjectMember(projectId, getUserId(req));
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.name, pm.role, pm.joined_at AS "joinedAt"
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 ORDER BY u.name`,
    [projectId],
  );
  res.json(rows);
});

router.post("/projects/:projectId/members", async (req, res) => {
  const projectId = idSchema.parse(req.params.projectId);
  const input = memberSchema.parse(req.body);
  const requesterId = getUserId(req);
  const owner = await pool.query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, requesterId],
  );
  if (owner.rowCount === 0) throw new HttpError(404, "Project not found.");
  if (owner.rows[0]!.role !== "owner") {
    throw new HttpError(403, "Only project owners can add members.");
  }
  const member = await pool.query(
    "SELECT id, username, name FROM users WHERE lower(username) = lower($1)",
    [input.username],
  );
  if (!member.rows[0]) throw new HttpError(404, "No user found with that username.");
  const inserted = await pool.query(
    `INSERT INTO project_members (project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id, user_id) DO NOTHING
     RETURNING user_id`,
    [projectId, member.rows[0].id],
  );
  if (inserted.rowCount === 0) {
    throw new HttpError(409, "That person is already a project member.");
  }
  res.status(201).json(member.rows[0]);
});

router.get("/projects/:projectId/issues", async (req, res) => {
  const projectId = idSchema.parse(req.params.projectId);
  await ensureProjectMember(projectId, getUserId(req));
  const filters = issueListQuerySchema.parse(req.query);
  const conditions = ["i.project_id = $1"];
  const values: unknown[] = [projectId];
  const addFilter = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };
  if (filters.status) addFilter("i.status = ?", filters.status);
  if (filters.priority) addFilter("i.priority = ?", filters.priority);
  if (filters.assignee) addFilter("i.assignee_id = ?", filters.assignee);
  if (filters.label) addFilter("? = ANY(i.labels)", filters.label);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(
      `(i.title ILIKE $${values.length} OR i.description ILIKE $${values.length})`,
    );
  }
  const where = conditions.join(" AND ");
  const countResult = await pool.query(
    `SELECT count(*)::int AS total FROM issues i WHERE ${where}`,
    values,
  );
  const total = countResult.rows[0]!.total as number;
  const summaryResult = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'In progress')::int AS "inProgress",
            count(*) FILTER (WHERE status = 'Closed')::int AS completed
     FROM issues WHERE project_id = $1`,
    [projectId],
  );
  const labelsResult = await pool.query(
    `SELECT COALESCE(array_agg(DISTINCT label ORDER BY label), ARRAY[]::text[]) AS labels
     FROM issues i CROSS JOIN LATERAL unnest(i.labels) AS item(label)
     WHERE i.project_id = $1`,
    [projectId],
  );
  const pageValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const { rows } = await pool.query(
    `SELECT i.id, i.project_id AS "projectId", p.project_key AS "projectKey",
            i.title, i.description, i.type,
            i.status, i.priority, i.labels, i.assignee_id AS "assigneeId",
            i.created_at AS "createdAt", i.updated_at AS "updatedAt",
            a.name AS "assigneeName", a.username AS "assigneeUsername",
            creator.name AS "creatorName",
            (SELECT count(*)::int FROM issue_comments c WHERE c.issue_id = i.id)
              AS "commentCount"
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN users a ON a.id = i.assignee_id
     JOIN users creator ON creator.id = i.created_by
     WHERE ${where}
     ORDER BY i.updated_at DESC, i.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    pageValues,
  );
  res.json({
    issues: rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
    summary: summaryResult.rows[0],
    availableLabels: labelsResult.rows[0]!.labels,
  });
});

router.post("/projects/:projectId/issues", async (req, res) => {
  const projectId = idSchema.parse(req.params.projectId);
  const userId = getUserId(req);
  await ensureProjectMember(projectId, userId);
  const input = issueCreateSchema.parse(req.body);
  if (input.assigneeId !== null) {
    await ensureProjectMember(projectId, input.assigneeId);
  }
  const issue = await withActor(userId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO issues
       (project_id, title, description, type, priority, labels, assignee_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, project_id AS "projectId", title, description, type, status,
                 priority, labels, assignee_id AS "assigneeId",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        projectId,
        input.title,
        input.description,
        input.type,
        input.priority,
        input.labels,
        input.assigneeId,
        userId,
      ],
    );
    return rows[0];
  });
  res.status(201).json(issue);
});

router.get("/issues/:issueId", async (req, res) => {
  const issueId = idSchema.parse(req.params.issueId);
  await ensureIssueMember(issueId, getUserId(req));
  const { rows } = await pool.query(
    `SELECT i.id, i.project_id AS "projectId", p.project_key AS "projectKey",
            i.title, i.description, i.type, i.status, i.priority, i.labels,
            i.assignee_id AS "assigneeId", i.created_by AS "createdBy",
            i.created_at AS "createdAt", i.updated_at AS "updatedAt",
            a.name AS "assigneeName", a.username AS "assigneeUsername",
            creator.name AS "creatorName"
     FROM issues i JOIN projects p ON p.id = i.project_id
     JOIN users creator ON creator.id = i.created_by
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE i.id = $1`,
    [issueId],
  );
  res.json(rows[0]);
});

const issueColumns: Record<string, string> = {
  title: "title",
  description: "description",
  type: "type",
  priority: "priority",
  labels: "labels",
  assigneeId: "assignee_id",
};

router.patch("/issues/:issueId", async (req, res) => {
  const issueId = idSchema.parse(req.params.issueId);
  const userId = getUserId(req);
  const input = issuePatchSchema.parse(req.body);
  const issue = await withActor(userId, async (client) => {
    const currentResult = await client.query(
      `SELECT i.id, i.project_id, i.status FROM issues i
       JOIN project_members pm ON pm.project_id = i.project_id
       WHERE i.id = $1 AND pm.user_id = $2 FOR UPDATE OF i`,
      [issueId, userId],
    );
    if (!currentResult.rows[0]) throw new HttpError(404, "Issue not found.");
    const current = currentResult.rows[0] as {
      id: number;
      project_id: number;
      status: IssueStatus;
    };

    if (input.status && input.status !== current.status &&
        !canTransition(current.status, input.status)) {
      throw new HttpError(
        409,
        `You can't move an issue from ${current.status} to ${input.status}.`,
      );
    }
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      const assignee = await client.query(
        `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [current.project_id, input.assigneeId],
      );
      if (assignee.rowCount === 0) {
        throw new HttpError(400, "The assignee must be a member of this project.");
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [issueId];
    for (const [key, column] of Object.entries(issueColumns)) {
      if (input[key as keyof typeof input] !== undefined) {
        values.push(input[key as keyof typeof input]);
        updates.push(`${column} = $${values.length}`);
      }
    }
    if (input.status !== undefined) {
      values.push(input.status);
      updates.push(`status = $${values.length}`);
    }
    const { rows } = await client.query(
      `UPDATE issues SET ${updates.join(", ")} WHERE id = $1
       RETURNING id, project_id AS "projectId", title, description, type,
                 status, priority, labels, assignee_id AS "assigneeId",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    return rows[0];
  });
  res.json(issue);
});

router.get("/issues/:issueId/comments", async (req, res) => {
  const issueId = idSchema.parse(req.params.issueId);
  await ensureIssueMember(issueId, getUserId(req));
  const { rows } = await pool.query(
    `SELECT c.id, c.body, c.created_at AS "createdAt",
            u.id AS "authorId", u.name AS "authorName", u.username AS "authorUsername"
     FROM issue_comments c JOIN users u ON u.id = c.author_id
     WHERE c.issue_id = $1 ORDER BY c.created_at, c.id`,
    [issueId],
  );
  res.json(rows);
});

router.post("/issues/:issueId/comments", async (req, res) => {
  const issueId = idSchema.parse(req.params.issueId);
  const userId = getUserId(req);
  await ensureIssueMember(issueId, userId);
  const input = commentSchema.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO issue_comments (issue_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, body, created_at AS "createdAt"`,
    [issueId, userId, input.body],
  );
  res.status(201).json(rows[0]);
});

router.get("/issues/:issueId/history", async (req, res) => {
  const issueId = idSchema.parse(req.params.issueId);
  await ensureIssueMember(issueId, getUserId(req));
  const { rows } = await pool.query(
    `SELECT h.id, h.field_name AS "fieldName", h.old_value AS "oldValue",
            h.new_value AS "newValue", h.changed_at AS "changedAt",
            u.name AS "actorName", u.username AS "actorUsername"
     FROM issue_history h LEFT JOIN users u ON u.id = h.actor_id
     WHERE h.issue_id = $1 ORDER BY h.changed_at DESC, h.id DESC`,
    [issueId],
  );
  res.json(rows);
});
