import "dotenv/config";

import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { office, officePosition, user } from "@/lib/db/schema";
import * as utils from "@/scripts/utils.mjs";

async function createAdministratorAccount() {
  const [targetOffice] = await db
    .select({
      id: office.id,
    })
    .from(office)
    .where(eq(office.name, "Cardinal Administrators"))
    .limit(1);

  if (!targetOffice) {
    console.error("Office not found. Are you sure you seeded the database?");
    return;
  }

  const [role] = await db
    .select({ id: officePosition.id })
    .from(officePosition)
    .where(eq(officePosition.officeId, targetOffice.id));
  if (!role) {
    console.error("Role not found. Are you sure you seeded the database?");
    return;
  }

  // Find the user within the db
  const [administratorUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "sys@laboratories-internal.local"))
    .limit(1);
  if (administratorUser) {
    console.error("Administrator account is already created. No need to run this script again.");
  }

  // Create user
  console.log("Creating account...");

  const password = utils.token.generatePassword(16);
  const admin = await auth.api.signUpEmail({
    body: {
      name: "internal system",
      email: "sys@laboratories-internal.local",
      password,
      officeId: targetOffice.id,
      officePositionId: role.id,
    },
  });

  console.log("Activating account for first use...");
  await db.update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, admin.user.id));

  console.log("Your account has been generated.");
  console.log("");
  console.log("  Email:    sys@laboratories-internal.local");
  console.log("  Password: %s", password);
  console.log("  User ID:  %s", admin.user.id);
  console.log("");
  console.log("Your account credentials appear only once. Please take note of this.");
  console.log("After server configuration, disable the maintainer account by running:");
  console.log("");
  console.log("  pnpm setup:admin:disable");
  console.log("");
  console.log("  To re-enable it:");
  console.log("  pnpm setup:admin:enable");
  console.log("");
}

createAdministratorAccount().catch(console.error);
