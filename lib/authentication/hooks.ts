import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { Permissions } from "@/lib/db/permissions";

export async function requireProtection(options?: ProtectionOptions) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Redirect to log in if not authenticated.
  if (!session) redirect("/auth/signin");

  // If specifies that only verified users are allowed, we need to redirect them.
  if (options?.verified && !session.user.emailVerified) {
    // When a user specifies a custom redirect path, use it. Otherwise, redirect to the home page.
    if (options?.customRedirectUrl?.onUnverified) {
      redirect(options.customRedirectUrl.onUnverified);
    } else {
      redirect("/enrollment/pending");
    }
  }

  // TODO: Permission-based checking
  return session;
}

type ProtectionOptions = {
    /**
     * Represents an optional array of permissions that can be assigned.
     * Each permission in the array defines a specific action or access level granted.
     *
     * @property {Permissions[]} [permissions] - List of permissions associated with a given context.
     */
    permissions?: Array<Permissions>;

    /**
     * A boolean flag indicating whether the entity or operation has been verified.
     */
    verified?: boolean;

    /**
     * Represents a custom URL configuration for redirecting users under specific authentication and permission
     * conditions.
     */
    customRedirectUrl?: {
        /**
         * Custom Redirect path when the User is authenticated but has not enough permissions to access
         * certain resources.
         */
        onPermissionDenied?: string;

        /**
         * Custom Redirect path when the User is authenticated but has not yet verified.
         */
        onUnverified?: string;
    }
}
