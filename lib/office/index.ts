import { and, count, eq, inArray, not, sql } from "drizzle-orm";

import { allowedPermissions, permissionDescriptors } from "@/lib/office/permissions";
import { cacheManager } from "@/lib/cache";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success, unwrap } from "@/lib/one-of";
import { getUserById } from "@/lib/accounts";
import { office, officePosition, user } from "@/lib/db/schema";
import { OFFICE_HEAD, type Permissions } from "@/lib/db/permissions";
import { User } from "@/lib/accounts";

export { allowedPermissions, permissionDescriptors };

/**
 * Retrieves the list of offices that users are allowed to be assigned to.
 *
 * @description
 * Returns offices excluding protected/system offices, and includes a lightweight list of role identifiers/names
 * associated with each office (when available). Intended for UI pickers and assignment flows where you need
 * “safe to assign” offices plus their role options.
 *
 * On success, wraps the office list in a {@link Success}. On failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function getAssignableOffices
 * @returns {Promise<Result<Office[]>>} A result wrapper containing assignable offices on success, or a failure result on error.
 *
 * @remarks
 * - Excludes protected/system offices from the result set.
 * - Role lists may be empty when an office has no roles configured.
 */
export async function getAssignableOffices(): Promise<Result<Array<Office>>> {
  try {
    const offices = await db
      .select({
        id: office.id,
        name: office.name,
        roles: sql<({ id: string; name: string })[]>`
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', ${officePosition.id},
                        'name', ${officePosition.name}
                    )
                ) FILTER (WHERE ${officePosition.id} IS NOT NULL),
            '[]')`,
      })
      .from(office)
      .leftJoin(officePosition, eq(office.id, officePosition.officeId))
      .where(not(eq(office.name, "Cardinal Administrators")))
      .groupBy(office.id, office.name);

    return new Success(offices);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get assignable offices.", {}, e);
  }
}

/**
 * Retrieves the list of offices that users are allowed to be assigned to, including their head users.
 *
 * @description
 * Returns assignable offices that have office-head-capable positions, excluding protected/system offices.
 * Each office includes a lightweight list of users currently associated with that office, intended for
 * assignment flows and UI pickers that need office options with their possible head users.
 *
 * On success, wraps the office list in a {@link Success}. On failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function getAssignableOfficesWithHeadUsers
 * @returns {Promise<Result<Array<OfficeWithHeadUserList>>>} A result wrapper containing assignable offices with head
 *                                                           users on success, or a failure result on error.
 *
 * @remarks
 * - Excludes protected/system offices from the result set.
 * - Only offices with positions containing the office-head permission are included.
 * - Head-user lists may be empty when an office has no associated users.
 */
export async function getAssignableOfficesWithHeadUsers(): Promise<Result<Array<OfficeWithHeadUserList>>> {
  try {
    // Fetch list of offices that is assignable first.
    const offices = await db
      .select({
        id: office.id,
        name: office.name,
      })
      .from(office)
      .innerJoin(officePosition, eq(officePosition.officeId, office.id))
      .where(
        and(
          not(eq(office.name, "Cardinal Administrators")),
          sql`${officePosition.permissions} @> ARRAY[${OFFICE_HEAD}]`,
        ),
      )
      .groupBy(office.id);

    // Find the users
    const officeIds = offices.map(o => o.id);
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        officeId: user.officeId,
      })
      .from(user)
      .where(inArray(user.officeId, officeIds));

    // Grouping
    const usersByOffice = new Map<string, { id: string; name: string }[]>();
    for (const u of users) {
      if (!usersByOffice.has(u.officeId)) {
        usersByOffice.set(u.officeId, []);
      }
      usersByOffice.get(u.officeId)!.push({
        id: u.id,
        name: u.name,
      });
    }

    // Map
    const items: OfficeWithHeadUserList[] = offices.map(o => ({
      id: o.id,
      name: o.name,
      heads: usersByOffice.get(o.id) ?? [],
    }));

    return new Success(items);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get assignable offices.", {}, e);
  }
}

/**
 * Retrieves extended summary information for all non-protected offices.
 *
 * @description
 * Returns a list of offices excluding the protected/system office, augmented with aggregate metrics:
 * - `roleCount`: number of roles/positions in the office
 * - `userCount`: number of users associated via those roles
 *
 * On success, wraps the summary list in a {@link Success}. On failure, wraps unexpected errors in a fatal {@link Failure}.
 *
 * @async
 * @function getOfficesExtendedInformation
 * @returns {Promise<Result<Array<OfficeExtendedInfo>>>}
 * A result wrapper containing office summaries on success, or a failure result on error.
 *
 * @remarks
 * - Intended for admin overview screens and reporting.
 * - Aggregate counts reflect the current database state and depend on how users are linked to roles/offices.
 */
export async function getOfficesExtendedInformation(): Promise<Result<Array<OfficeExtendedInfo>>> {
  try {
    const offices = await db
      .select({
        id: office.id,
        name: office.name,

        userCount: count(user.id),
        roleCount: count(officePosition.id),
      })
      .from(office)
      .leftJoin(officePosition, eq(office.id, officePosition.officeId))
      .leftJoin(
        user,
        and(
          eq(user.officePositionId, officePosition.id),
          eq(user.emailVerified, true),
          eq(user.shadowBanned, false),
          eq(user.banned, false),
        ),
      )
      .where(
        not(eq(office.name, "Cardinal Administrators")),
      )
      .groupBy(office.id, office.name);

    return new Success(offices);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get assignable offices.", {}, e);
  }
}

/**
 * Retrieves the list of roles that can be assigned within a specific office.
 *
 * @description
 * Fetches roles for the provided office identifier and returns them in a simplified {@link RoleDefinition} shape.
 * If the result set indicates a protected/system office, the operation is rejected with a resource-not-found.
 * Unexpected errors are caught and returned as a fatal failure result.
 *
 * @async
 * @function getAssignableRoles
 * @param {string} officeId - Identifier of the office whose roles should be returned.
 * @returns {Promise<Result<RoleDefinition[]>>} A result wrapper containing assignable roles on success, or a failure result on error.
 *
 * @remarks
 * - Returns a resource-not-found when roles belong to a protected/system office.
 * - The returned role objects include role id, name, and permissions.
 */
export async function getAssignableRoles(officeId: string): Promise<Result<Array<RoleDefinition>>> {
  try {
    const roles = await db
      .select({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
        office: office.name,
      })
      .from(officePosition)
      .leftJoin(office, eq(office.id, officePosition.officeId))
      .where(eq(officePosition.officeId, officeId));

    const isIllegal = roles.find(r => r.office?.toLowerCase() === "cardinal administrators");
    if (isIllegal) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "Kirito, Asuna is getting married to that new administrator. Perhaps you should try on your sister instead.",
        { officeId },
      );
    }

    return new Success(roles.map(r => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions as Permissions[],
    })));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get assignable roles.", {}, e);
  }
}

/**
 * Retrieves detailed information for a single office by its identifier.
 *
 * @description
 * Fetches the office record and its associated roles (including permissions) and returns them as an
 * {@link OfficeDefinitionWithRoleExtendedInfo}. The lookup is restricted to non-protected offices; protected/system
 * offices are excluded from the query.
 *
 * If no matching office is found, returns a resource-not-found failure. Unexpected errors are caught and returned as a
 * fatal failure result.
 *
 * @async
 * @function getOfficeInformationById
 * @param {string} officeId - Identifier of the office to retrieve.
 * @returns {Promise<Result<OfficeDefinitionWithRoleExtendedInfo>>} A result wrapper containing the office definition on
 * success, or a failure result on error.
 *
 * @remarks
 * - The returned office definition includes a roles list; it may be empty when the office has no roles.
 * - Protected/system offices are intentionally excluded from results.
 */
export async function getOfficeInformationById(officeId: string): Promise<Result<OfficeDefinitionWithRoleExtendedInfo>> {
  try {
    const [selectedOffice] = await db
      .select({
        id: office.id,
        name: office.name,
        roles: sql<RoleExtendedInfo[]>`
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', ${officePosition.id},
                        'name', ${officePosition.name},
                        'permissions', to_jsonb(${officePosition.permissions}),
                
                        -- Count stuff
                        'userCount', COALESCE((
                            SELECT CAST(COUNT(*) AS INT)
                            FROM ${user}
                            WHERE ${user.officePositionId} = ${officePosition.id}
                                AND ${user.emailVerified} = TRUE
                                AND ${user.banned} = FALSE
                                AND ${user.shadowBanned} = FALSE
                        ), 0)
                    )
                ) FILTER (WHERE ${officePosition.id} IS NOT NULL),
            '[]'::json)
        `,
      })
      .from(office)
      .leftJoin(officePosition, eq(office.id, officePosition.officeId))
      .where(
        and(
          not(eq(office.name, "Cardinal Administrators")),
          eq(office.id, officeId),
        ),
      )
      .groupBy(office.id, office.name)
      .limit(1);

    if (!selectedOffice) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office not found.", { officeId });
    }

    return new Success(selectedOffice);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get office information.", { officeId }, e);
  }
}

/**
 * Creates a new office with the given name.
 *
 * @description
 * Validates the requested office name against reserved/protected names, checks for an existing office with the same
 * name to prevent duplicates, then persists the new office record. The returned office definition is initialized with
 * an empty roles list.
 *
 * On success, returns a {@link Success} containing the created {@link OfficeDefinition}.
 * On failure, returns a {@link Failure} indicating whether the error was a validation issue (reserved name/duplicate)
 * or an unexpected fatal error.
 *
 * @async
 * @function createOffice
 * @param {string} name - Human-readable office name. Must be unique and not a reserved/protected name.
 * @returns {Promise<Result<OfficeDefinition>>} A result wrapper containing the created office definition on success,
 * or a failure result on error.
 *
 * @remarks
 * - Names are compared case-insensitively when checking reserved/protected names.
 */
export async function createOffice(name: string): Promise<Result<OfficeDefinition>> {
  try {
    // Prevent calling themselves as cardinal administrators
    if (name.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Are you trying to be Kirigaya Kazuto? Sorry, Yuuki Asuna is on different isle!",
        { name },
      );
    }

    // Prevent creating a new office with the same name
    const [existingOffice] = await db
      .select({ id: office.id })
      .from(office)
      .where(eq(office.name, name))
      .limit(1);
    if (existingOffice) {
      return new Failure(ErrorCodes.ValidationFailure, "Office already exists.", { name });
    }

    const [newOffice] = await db
      .insert(office)
      .values({
        name: name,
        prohibitedAssignment: false,
      })
      .returning({ id: office.id, name: office.name });

    // Nothing created?
    if (!newOffice) {
      return new Failure(ErrorCodes.Fatal, "Unable to create office.", { name });
    }

    return new Success({
      id: newOffice.id,
      name: newOffice.name,
      roles: [],
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create office.", { name }, e);
  }
}

/**
 * Updates an existing office's name.
 *
 * @description
 * Looks up the office by its identifier; if it does not exist, returns a resource-not-found failure.
 * If found, updates the office name and returns the updated office record wrapped in a success result.
 * Any unexpected error is caught and returned as a fatal failure result.
 *
 * @async
 * @function updateOffice
 * @param {string} id - Unique identifier of the office to update.
 * @param {string} name - New name to assign to the office.
 * @returns {Promise<Result<Office>>} A result wrapper containing the updated office on success, or an error result on failure.
 *
 * @throws {never} This function does not throw; it returns failures instead.
 */
export async function updateOffice(id: string, name: string): Promise<Result<Office>> {
  try {
    if (name.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Are you trying to be Kirigaya Kazuto? Sorry, Yuuki Asuna is on different isle!",
        { id, name },
      );
    }

    const [target] = await db
      .select({ id: office.id })
      .from(office)
      .where(eq(office.id, id))
      .limit(1);

    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office not found.", { id, name });
    }

    const [newValue] = await db
      .update(office)
      .set({ name })
      .where(eq(office.id, id))
      .returning({ id: office.id, name: office.name });
    return new Success(newValue);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update office.", { id, name }, e);
  }
}

/**
 * Deletes an office by its identifier.
 *
 * Validates that the office exists, prevents deletion of protected offices,
 * and ensures the office has no associated roles before removing it.
 *
 * @param id - The unique identifier of the office to delete.
 * @returns A promise that resolves to a result object:
 * - `Success<null>` when the office is deleted successfully
 * - `Failure` when the office does not exist, is protected, is not empty, or an unexpected error occurs
 */
export async function deleteOffice(id: string): Promise<Result<null>> {
  try {
    const [targetOffice] = await db
      .select({ id: office.id, name: office.name })
      .from(office)
      .where(eq(office.id, id))
      .limit(1);
    if (!targetOffice) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office not found.", { id });
    }

    if (targetOffice.name!.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Kirito, its fine. Just marry your sister. Just give up on Asuna bro, really.",
        { id },
      );
    }

    // Ask to manually delete all roles in the office.
    const [roleCount] = await db
      .select({ count: count() })
      .from(officePosition)
      .where(eq(officePosition.officeId, targetOffice.id));
    if (roleCount.count > 0) {
      return new Failure(ErrorCodes.ValidationFailure, "Office is not empty. Delete the roles first.", { id });
    }

    await db.delete(office).where(eq(office.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete office.", { id }, e);
  }
}

/**
 * Adds a new role/position to an existing office.
 *
 * @description
 * Verifies the target office exists, then ensures no role with the same name already exists within that office.
 * If validation passes, persists the new role with the provided permissions and returns the created role definition.
 * Unexpected errors are captured and returned as a fatal failure result.
 *
 * @async
 * @function addRole
 * @param {string} officeId - Identifier of the office that will own the new role.
 * @param {string} name - Human-readable role name. Must be unique within the office.
 * @param {Permissions[]} permissions - Permission keys assigned to the role.
 * @returns {Promise<Result<RoleDefinition>>} A result wrapper containing the created role on success, or a failure result on error.
 *
 * @remarks
 * - Returns a validation failure if a role with the same name already exists for the office.
 * - Returns a resource-not-found failure if the office does not exist.
 */
export async function addRole(officeId: string, name: string, permissions: Permissions[]): Promise<Result<RoleDefinition>> {
  try {
    const [targetOffice] = await db
      .select({ id: office.id, name: office.name })
      .from(office)
      .where(eq(office.id, officeId))
      .limit(1);

    // No office found.
    if (!targetOffice) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office not found.", { officeId, name, permissions });
    }

    // Do not allow modifying cardinal administrators' office.
    if (targetOffice.name.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "Asuna seems to be in a different island, Kirito.",
        { officeId, name, permissions },
      );
    }

    const existingRoles = await db
      .select({ id: officePosition.id })
      .from(officePosition)
      .where(
        and(
          eq(officePosition.officeId, targetOffice.id),
          eq(officePosition.name, name),
        ),
      )
      .limit(1);

    // Do not add existing role names to the list.
    if (existingRoles.length > 0) {
      return new Failure(ErrorCodes.ValidationFailure, "Role already exists.", { officeId, name, permissions });
    }

    const [newRole] = await db
      .insert(officePosition)
      .values({
        name,
        permissions,
        officeId: targetOffice.id,
      })
      .returning({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
      });
    if (!newRole) {
      return new Failure(ErrorCodes.Fatal, "Unable to add role.", { officeId, name, permissions });
    }

    return new Success(newRole as RoleDefinition);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to add role.", { officeId, name, permissions }, e);
  }
}

/**
 * Updates an existing office role (position) by its identifier.
 *
 * @description
 * Retrieves the current role record, returning a not-found failure when the role does not exist.
 * Optionally updates the role name and/or permissions; any omitted fields keep their current values.
 * Updates are rejected for roles belonging to a protected/system office.
 *
 * On success, returns the updated role definition wrapped in a {@link Success}.
 * On failure, returns a {@link Failure} describing the reason (not found, validation/protection, or fatal error).
 *
 * @async
 * @function updateRole
 * @param {string} officeId - Identifier of the office that owns the role.
 * @param {string} roleId - Identifier of the role to update.
 * @param {string} [name] - New role name. If not provided, the existing name is preserved.
 * @param {Permissions[]} [permissions] - New permissions list. If not provided, the existing permissions are preserved.
 * @returns {Promise<Result<RoleExtendedInfo>>} A result wrapper containing the updated role on success, or a failure result on error.
 *
 * @remarks
 * - Returns a resource-not-found failure when the role cannot be found.
 * - Returns a failure when attempting to update roles in a protected/system office.
 */
export async function updateRole(officeId: string, roleId: string, name?: string, permissions?: Permissions[]): Promise<Result<RoleExtendedInfo>> {
  try {
    const [existingRole] = await db
      .select({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
        office: office.name,
        userCount: count(user.id),
      })
      .from(officePosition)
      .where(
        and(
          eq(officePosition.id, roleId),
          eq(officePosition.officeId, officeId),
        ),
      )
      .leftJoin(office, eq(office.id, officePosition.officeId))
      .leftJoin(
        user,
        and(
          eq(user.officePositionId, roleId),
          eq(user.emailVerified, true),
          eq(user.shadowBanned, false),
          eq(user.banned, false),
        ),
      )
      .limit(1)
      .groupBy(office.id, officePosition.id, officePosition.name);

    // No role found
    if (!existingRole) {
      return new Failure(ErrorCodes.ResourceNotFound, "Role not found.", { roleId, name, permissions });
    }

    // Avoid writing to the cardinal administrators office.
    if (existingRole.office?.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "We're pretty sure Asuna is in Egil's place right now. Hurry up and go to the bar, Kirito.",
        { roleId, name, permissions },
      );
    }

    // Update the role
    const [updatedRole] = await db
      .update(officePosition)
      .set({
        name: name ?? existingRole.name,
        permissions: permissions ?? existingRole.permissions,
      })
      .where(eq(officePosition.id, roleId))
      .returning({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
      });

    return new Success({
      id: updatedRole.id,
      name: updatedRole.name,
      permissions: updatedRole.permissions as Permissions[],
      userCount: existingRole.userCount,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update role.", { roleId, name, permissions }, e);
  }
}

/**
 * Deletes an office role (position) by its identifier.
 *
 * @description
 * Validates that the role exists before attempting deletion. Deletion is blocked for roles that belong to a
 * protected/system office and for roles that are currently assigned to one or more users.
 *
 * On success, deletes the role and returns a {@link Success} with a `null` payload.
 * On failure, returns a {@link Failure} describing the reason (not found, role in use, protected office, or fatal error).
 *
 * @async
 * @function deleteRole
 * @param {string} roleId - Identifier of the role to delete.
 * @returns {Promise<Result<null>>} A result wrapper containing `null` on success, or a failure result on error.
 *
 * @remarks
 * - Returns a resource-not-found failure when the role does not exist.
 * - Returns a validation failure when the role is still assigned to users.
 * - Returns a failure when attempting to delete roles in a protected/system office.
 */
export async function deleteRole(roleId: string): Promise<Result<null>> {
  try {
    const [existingRole] = await db
      .select({
        id: officePosition.id,
        office: office.name,
      })
      .from(officePosition)
      .leftJoin(office, eq(office.id, officePosition.officeId))
      .limit(1);

    // No role found
    if (!existingRole) {
      return new Failure(ErrorCodes.ResourceNotFound, "Role not found.", { roleId });
    }

    // Avoid writing to the cardinal administrators office.
    if (existingRole.office?.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "Kirito, Egil seems to gave you an DVD. Perhaps, you should visit the bird's nest in Yggdrasil. " +
        "She might be there with the man who seems to be also an administrator of that place too.",
        { roleId },
      );
    }

    const [users] = await db
      .select({ count: count() })
      .from(user)
      .where(eq(officePosition.id, existingRole.id));

    // They should remove all users with this role before deleting it.
    if (users.count > 0) {
      return new Failure(ErrorCodes.ValidationFailure, "Role is in use.", { roleId });
    }

    await db
      .delete(officePosition)
      .where(eq(officePosition.id, roleId));

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete role.", { roleId }, e);
  }
}

/**
 * Switches a user's role and (optionally) their office assignment.
 *
 * @description
 * Loads the target user, clears any cached user entry, resolves the target office (either the provided `officeId`
 * or the user's current office), and verifies the requested role belongs to that office.
 * Updates the user's office/role references and returns a freshly re-fetched user record.
 *
 * Returns a not-found failure when the user, office (when provided), or role cannot be found.
 * Rejects attempts to switch into a protected/system office.
 * Unexpected errors are caught and returned as a fatal failure result.
 *
 * @async
 * @function switchRoles
 * @param {string} userId - Identifier of the user whose role/office should be changed.
 * @param {string} roleId - Identifier of the role to assign to the user.
 * @param {string} [officeId] - Optional identifier of the office to move the user into. If omitted, keeps the current office.
 * @returns {Promise<Result<User>>} A result wrapper containing the updated user on success, or a failure result on error.
 *
 * @remarks
 * - Cache invalidation is performed for the user before applying the change.
 * - The role must belong to the resolved target office.
 */
export async function switchRoles(userId: string, roleId: string, officeId?: string): Promise<Result<User>> {
  try {
    // Get the existing user first
    const [existingUser] = await db
      .select({
        id: user.id,
        officeId: office.id,
        officeName: office.name,
        roleId: officePosition.id,
        roleName: officePosition.name,
      })
      .from(user)
      .leftJoin(office, eq(office.id, user.officeId))
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .where(eq(user.id, userId))
      .limit(1);
    if (!existingUser) {
      return new Failure(ErrorCodes.ResourceNotFound, "User not found.", { userId, roleId, officeId });
    }

    // Delete the user from the cache
    const key = `user:${existingUser.id}`;
    if (key) {
      await cacheManager.delete(key);
    }

    // Find the new office
    const [targetOffice] = officeId
      ? await db.select({ id: office.id, name: office.name }).from(office).where(eq(office.id, officeId)).limit(1)
      : [{ id: existingUser.officeId, name: existingUser.officeName }];
    if (officeId && !targetOffice) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office not found.", { userId, roleId, officeId });
    }

    if (targetOffice.name!.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "Kirito, You have no match against the new administrator. Just give up and ask your sister for a date.",
        { userId, roleId, officeId },
      );
    }

    // Look for the new role
    const [targetRole] = await db
      .select({ id: officePosition.id })
      .from(officePosition)
      .where(
        and(
          eq(officePosition.officeId, targetOffice.id!),
          eq(officePosition.id, roleId),
        ),
      )
      .limit(1);
    if (!targetRole) {
      return new Failure(ErrorCodes.ResourceNotFound, "Role not found.", { userId, roleId, officeId });
    }

    // Adjust new IDs for the user
    await db
      .update(user)
      .set({
        officeId: targetOffice.id!,
        officePositionId: targetRole.id,
      })
      .where(eq(user.id, userId));

    // Refetch
    const newUser = await unwrap(getUserById(userId));
    return new Success(newUser);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to switch roles.", { userId, roleId, officeId }, e);
  }
}

type Office = {
  id: string;
  name: string;
}

type OfficeExtendedInfo = {
  userCount: number;
  roleCount: number;
} & Office;

type RoleDefinition = {
  id: string;
  name: string;
  permissions: Array<Permissions>;
}

type OfficeDefinition = {
  roles: Array<RoleDefinition>
} & Office;

type RoleExtendedInfo = {
  userCount: number;
} & RoleDefinition;

type OfficeDefinitionWithRoleExtendedInfo = {
  roles: Array<RoleExtendedInfo>
} & Office;

type OfficeWithHeadUserList = {
  heads: Array<{
    id: string;
    name: string;
  }>;
} & Office;
