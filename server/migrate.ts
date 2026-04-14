import { ensureDatabase, pool } from "./db.ts";

(async () => {
  await ensureDatabase();
  console.log("Database initialized successfully.");
  await pool.end();
})();
