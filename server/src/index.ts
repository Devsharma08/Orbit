import { app } from "./app.js";
import { config } from "./config.js";
import { initializeDatabase, pool } from "./db.js";

async function start(): Promise<void> {
  await initializeDatabase();
  const server = app.listen(config.PORT, () => {
    console.log(`Orbit API listening on http://localhost:${config.PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      void pool.end();
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error: unknown) => {
  console.error("Could not start the API:", error);
  process.exitCode = 1;
});
