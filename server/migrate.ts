import { ensureDatabase, pool } from "./db";

(async () => {
  await ensureDatabase();
  console.log("Database initialized successfully.");
  await pool.end();
})();
