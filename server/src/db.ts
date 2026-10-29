import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, types, type PoolClient } from "pg";
import { config } from "./config.js";

types.setTypeParser(20, (value) => Number.parseInt(value, 10));

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: ["localhost", "127.0.0.1", "::1"].includes(
    new URL(config.DATABASE_URL).hostname,
  )
    ? undefined
    : { rejectUnauthorized: true },
});

export async function initializeDatabase(): Promise<void> {
  const schemaPath = fileURLToPath(new URL("../sql/schema.sql", import.meta.url));
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}

export async function withActor<T>(
  actorId: number,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      String(actorId),
    ]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
