import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { cacheManager } from "@/lib/cache";
import { db } from "@/lib/db";
import { office, officePosition, user } from "@/lib/db/schema";
import * as permissions from "@/lib/db/permissions";
import * as utils from "@/scripts/utils.mjs";

async function enroller(flags: Set<string>) {
  // Create office and roles first
  const { oId, rId } = await checkOrCreateEnrollerRole();

  // Get the enroller user.
  let [enrollerUser] = await db
    .select({
      id: user.id,
      enabled: user.emailVerified,
    })
    .from(user)
    .where(
      and(
        eq(user.officeId, oId),
        eq(user.officePositionId, rId),
      ),
    );

  if (flags.has("--enable")) {
    // If there are no enroller user...
    if (!enrollerUser) {
      console.log("Creating account...");

      const password = utils.token.generatePassword(16);
      const admin = await auth.api.signUpEmail({
        body: {
          name: "internal system",
          email: "sys@laboratories-internal.local",
          password,
          officeId: oId,
          officePositionId: rId,
        },
      });

      enrollerUser = {
        id: admin.user.id,
        enabled: false,
      };

      console.log("Your account has been generated.");
      console.log("");
      console.log("  Email:    sys@laboratories-internal.local");
      console.log("  Password: %s", password);
      console.log("  User ID:  %s", admin.user.id);
      console.log("");
      console.log("Your account credentials appear only once. Please take note of this.");
    }

    // Activate
    console.log("Activating...");
    await db.update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, enrollerUser.id));

    console.log("Account successfully activated.");
    return;
  }

  if (flags.has("--disable")) {
    if (!enrollerUser) {
      console.error("No enroller user found. Try running with --enable again.");
      return;
    }

    // Deactivate
    console.log("Deactivating...");
    await db.update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, enrollerUser.id));

    // Clear caches
    await cacheManager.delete(`user:${enrollerUser.id}`);

    console.log("Account successfully deactivated.");

    // Exit the process forcefully since redis will keep this running forever...
    return process.exit(0);
  }

  console.log("enroller [options]");
  console.log("");
  console.log("  --enable         Create or re-enable enroller account.");
  console.log("  --disable        Disable enroller account.");
  console.log("  --help           This help.");
  console.log("");
}

async function checkOrCreateEnrollerRole() {
  // Create or get the office first.
  let [enrollerOffice] = await db
    .select({ id: office.id })
    .from(office)
    .where(eq(office.name, "Cardinal Administrators"));
  if (!enrollerOffice) {
    [enrollerOffice] = await db
      .insert(office)
      .values({
        name: "Cardinal Administrators",
        prohibitedAssignment: true,
      })
      .returning();
  }

  let [enrollerRole] = await db
    .select({ id: officePosition.id })
    .from(officePosition)
    .where(
      and(
        eq(officePosition.name, "Heathcliff"),
        eq(officePosition.officeId, enrollerOffice.id),
      ),
    );
  if (!enrollerRole) {
    [enrollerRole] = await db
      .insert(officePosition)
      .values({
        name: "Heathcliff",
        officeId: enrollerOffice.id,
        permissions: [
          permissions.APPROVALS_ACCOUNT_READ,
          permissions.APPROVALS_ACCOUNT_WRITE,
          permissions.APPROVALS_INVITATION_READ,
          permissions.APPROVALS_INVITATION_WRITE,
        ],
      })
      .returning();
  }

  return { oId: enrollerOffice.id, rId: enrollerRole.id };
}

const flags = new Set([...process.argv.slice(2)]);
enroller(flags)
  .catch(console.error);
