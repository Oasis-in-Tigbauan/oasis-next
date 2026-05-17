import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

const flags = new Set([...process.argv.slice(2)]);

async function controlAdminAccount() {
  let mode = "DO_NOTHING";
  if (flags.has("--disable")) mode = "disabled";
  if (flags.has("--enable")) mode = "enable";

  // Nothing to do...
  if (mode === "DO_NOTHING") {
    console.log("Nothing to do. Exiting.");
    return;
  }

  // Find the user within the db
  const [administratorUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "sys@laboratories-internal.local"))
    .limit(1);
  if (!administratorUser) {
    console.error("No administrator account found.");
  }

  if (mode === "disabled") {
    await db.update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, administratorUser.id));
  }

  if (mode === "enable") {
    await db.update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, administratorUser.id));
  }
}

controlAdminAccount().catch(console.error);
