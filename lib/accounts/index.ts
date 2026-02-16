import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";

import { db } from "@/lib/db";
import { Permissions } from "@/lib/db/permissions";
import { officePosition, user } from "@/lib/db/schema";

/**
 * Retrieves the permissions for a user based on their unique identifier.
 *
 * @param {string} id - The unique identifier of the user.
 * @return {Promise<string[] | false>} A promise that resolves to an array of permissions if found, or `false` if the user does not exist or an error occurs.
 */
export async function getUserPermissions(id: string): Promise<string[]> {
    try {
        const [result] = await db
            .select({
                permissions: officePosition.permissions,
            })
            .from(user)
            .where(eq(user.id, id))
            .leftJoin(officePosition, eq(officePosition.id, user.officePositionId));
        if (!result) return [];

        return result.permissions!;
    } catch (e) {
        Sentry.captureException(e);
        return [];
    }
}

/**
 * Checks if a user identified by the given ID has the required permissions.
 *
 * @param {string} id - The unique identifier of the user whose permissions are being verified.
 * @param {Array<Permissions>} permissions - An array of permissions that the user must have.
 * @return {Promise<boolean>} A promise that resolves to a boolean indicating whether the user has all the required permissions.
 */
export async function requirePermissionByUser(id: string, permissions: Array<Permissions>): Promise<boolean> {
    try {
        const [result] = await db
            .select({
                id: user.id,
                officePositionId: officePosition.id,
                permissions: officePosition.permissions,
            })
            .from(user)
            .where(eq(user.id, id))
            .leftJoin(officePosition, eq(officePosition.id, user.officePositionId));
        if (!result) return false;

        // Check if the user has the required permissions
        return permissions.every(p => result.permissions!.includes(p));
    } catch (e) {
        Sentry.captureException(e);
        return false;
    }
}
