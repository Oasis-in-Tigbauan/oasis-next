import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

import { db } from "@/lib/db";
import { getUserById, type User } from "@/lib/accounts";
import type { Permissions } from "@/lib/db/permissions";
import { unwrap } from "@/lib/one-of";

export const auth = betterAuth({
  basePath: process.env.BETTER_AUTH_URL as string,
  appName: "oasis-next",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [nextCookies(), twoFactor()],

  // Additional properties configuration
  user: {
    additionalFields: {
      officeId: { type: "string", required: true },
      officePositionId: { type: "string", required: true },
    },
  },
});

export const session = {
  /**
   * Verifies if the user has the required permissions.
   * @param {Permissions[]} [permissions] - List of required permissions.
   * @returns {Promise<{ session: SessionType, user: User }>}
   */
  verify: async (permissions: Permissions[] = []): Promise<{ session: SessionType, user: User } | null> => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      // No session found.
      if (!session) return null;

      // Fetch the user from the database or from cache.
      const user = await unwrap(getUserById(session.user.id));

      // Check if the user is verified.
      if (!user.activated) return null;

      // Check if the user is banned.
      if (user.banned || user.DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED) return null;

      // Otherwise, check the required roles specified
      if (permissions.length >= 0) {
        if (!permissions.every(p => user.office.role.permissions!.includes(p))) {
          return null;
        }
      }

      return { session, user };
    } catch {
      return null;
    }
  },
};

type SessionType = Awaited<ReturnType<typeof auth.api.getSession>>;
