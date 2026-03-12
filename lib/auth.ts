import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { nextCookies } from "better-auth/next-js";
import * as Sentry from "@sentry/nextjs";
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
  verify: async (permissions: Permissions[] = []): Promise<SessionVerifiedResult> => {
    const nextHeaders = await headers();

    try {
      const session = await auth.api.getSession({
        headers: nextHeaders,
      });

      // No session found.
      if (!session) {
        // Log the user out.
        await auth.api.signOut({ headers: await headers() });
        return {
          code: SessionCode.SessionInvalid,
          session: null,
          user: null,
          redirectTo: "/auth/signin",
        };
      }

      // Fetch the user from the database or from cache.
      const user = await unwrap(getUserById(session.user.id));

      const result: SessionVerifiedResult = {
        code: SessionCode.Ok,
        session,
        user,
      };

      // Check if the user is verified.
      if (!user.activated) {
        result.code = SessionCode.Pending;
        result.redirectTo = "/enrollment/pending";
      }

      if (user.DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED) {
        result.code = SessionCode.ShadowBanned;
        result.redirectTo = "/enrollment/rejected";
      }

      // Check if the user is banned.
      if (user.banned) {
        result.code = SessionCode.Banned;
        result.redirectTo = "/banned";
      }

      // Otherwise, check the required roles specified
      if (permissions.length >= 0) {
        if (!permissions.every(p => user.office.role.permissions!.includes(p))) {
          result.code = SessionCode.InsufficientPermissions;
          result.redirectTo = "/dashboard";
        }
      }

      return result;
    } catch (e) {
      Sentry.captureException(e);

      // Log the user out.
      await auth.api.signOut({ headers: nextHeaders });
      return {
        code: SessionCode.SessionInvalid,
        session: null,
        user: null,
        redirectTo: "/auth/signin",
      };
    }
  },
};

type SessionType = Awaited<ReturnType<typeof auth.api.getSession>>;

export type SessionVerifiedResult = {
  session: SessionType | null;
  user: User | null;
  redirectTo?: string;
  code: SessionCode;
}

export enum SessionCode {
  Ok = 0,
  Pending = 1,
  Banned = 2,
  ShadowBanned = 3,
  InsufficientPermissions = 4,
  SessionInvalid = 5,
}
