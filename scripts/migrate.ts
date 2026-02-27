import "dotenv/config";

import { db } from "@/lib/db";
import { migrations } from "@/lib/db/migrations";

async function migrate() {
  for (const migration of migrations) {
    await migration(db);
  }

  console.log("Migrations completed.");
}

migrate().catch(console.error);
