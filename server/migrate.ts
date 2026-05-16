import { migrateDatabase, pool } from "./db.ts";

(async () => {
  process.env.AUTO_APPLY_MIGRATIONS = "1";
  await migrateDatabase();
  console.log("Database initialized successfully.");
  await pool.end();
})();
