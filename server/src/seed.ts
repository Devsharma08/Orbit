import bcrypt from "bcryptjs";
import { pool, initializeDatabase } from "./db.js";

const demoPassword = "orbit-demo";
const people = [
  { username: "alex", name: "Alex Morgan" },
  { username: "sam", name: "Sam Rivera" },
  { username: "jordan", name: "Jordan Lee" },
];

async function seed(): Promise<void> {
  await initializeDatabase();
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const users = [];
  for (const person of people) {
    const result = await pool.query(
      `INSERT INTO users (username, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, username, name`,
      [person.username, person.name, passwordHash],
    );
    users.push(result.rows[0] as { id: number; username: string; name: string });
  }

  const project = await pool.query(
    `INSERT INTO projects (name, project_key, description, created_by)
     VALUES ('Orbit launch', 'ORB', 'A shared space for product bugs and tasks.', $1)
     ON CONFLICT (project_key) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [users[0]!.id],
  );
  const projectId = project.rows[0]!.id as number;
  for (const [index, user] of users.entries()) {
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [projectId, user.id, index === 0 ? "owner" : "member"],
    );
  }

  const { rows } = await pool.query(
    "SELECT id FROM issues WHERE project_id = $1 LIMIT 1",
    [projectId],
  );
  if (rows.length === 0) {
    const issue = await pool.query(
      `INSERT INTO issues
        (project_id, title, description, type, priority, labels, assignee_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        projectId,
        "Welcome to your issue tracker",
        "This is your team's starting point. **Create an issue**, assign it to a teammate, and move it through the workflow.",
        "task",
        "Medium",
        ["welcome"],
        users[1]!.id,
        users[0]!.id,
      ],
    );
    await pool.query(
      `INSERT INTO issue_comments (issue_id, author_id, body)
       VALUES ($1, $2, 'Use the activity tabs to follow comments and a complete field-by-field change history.')`,
      [issue.rows[0]!.id, users[0]!.id],
    );
  }
  console.log("Demo data is ready. Sign in as alex, sam, or jordan with password orbit-demo.");
}

seed()
  .catch((error: unknown) => {
    console.error("Could not seed the database:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
