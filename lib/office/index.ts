import { and, count, eq, not, sql } from "drizzle-orm";

import { cacheManager } from "@/lib/cache";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success, unwrap } from "@/lib/one-of";
import { getUserById } from "@/lib/accounts";
import { office, officePosition, user } from "@/lib/db/schema";
import type { Permissions } from "@/lib/db/permissions";
import { User } from "@/lib/accounts";

/**
 * Retrieves the list of offices that can be assigned to users (i.e., selectable for enrollment/administration),
 * excluding the administrators office.
 *
 * @returns A `Result` containing an array of assignable offices on success, or a fatal `Failure` if the lookup fails unexpectedly.
 *
 * @remarks
 * - The administrators office is intentionally excluded to prevent assigning users to that office via normal flows.
 * - The returned office objects contain only basic identifying fields suitable for selection UIs.
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
 * Creates a new office and its initial set of positions/roles in a single atomic operation.
 *
 * @description
 * Validates the requested office name, checks for duplicates, then performs the insert(s) in a database transaction:
 * 1) creates the office record, and
 * 2) creates all position/role records associated with it.
 *
 * On success, returns a {@link Success} containing the created office definition (including roles).
 * On failure, returns a {@link Failure} with an appropriate error code and context.
 *
 * @async
 * @function createOffice
 * @param {OfficeInput} payload - Office details to create, including name and positions to seed.
 * @returns {Promise<Result<OfficeDefinition>>} A result wrapper containing either the created office definition or an error.
 *
 * @example
 * // const result = await createOffice({ name: "Engineering", positions: [...] });
 * // if (result.ok) console.log(result.value);
 */
export async function createOffice(payload: OfficeInput): Promise<Result<OfficeDefinition>> {
  try {
    // Prevent calling themselves as cardinal administrators
    if (payload.name.toLowerCase() === "cardinal administrators") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Are you trying to be Kirigaya Kazuto? Sorry, Yuuki Asuna is on different isle!",
        { payload },
      );
    }

    // Prevent creating a new office with the same name
    const [existingOffice] = await db
      .select({ id: office.id })
      .from(office)
      .where(eq(office.name, payload.name))
      .limit(1);
    if (existingOffice) {
      return new Failure(ErrorCodes.ValidationFailure, "Office already exists.", { payload });
    }

    const result = await db.transaction(async (tx) => {
      const [newOffice] = await tx
        .insert(office)
        .values({
          name: payload.name,
          prohibitedAssignment: false,
        })
        .returning({ id: office.id, name: office.name });

      // Nothing created?
      if (!newOffice) return tx.rollback();

      const values = payload.positions.map(position => ({
        name: position.name,
        permissions: position.permissions,
        officeId: newOffice.id,
      }));

      const roles = await tx
        .insert(officePosition)
        .values(values)
        .returning({
          id: officePosition.id,
          name: officePosition.name,
          permissions: officePosition.permissions,
        });

      return {
        id: newOffice.id,
        name: newOffice.name,
        roles: roles as OfficeDefinition["roles"],
      };
    });

    // Hmm, maybe it didn't work.
    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Unable to create office.", { payload });
    }

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create office.", { payload }, e);
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

    // Do not allow modifying cardinal administrators office.
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
 * @param {string} roleId - Identifier of the role to update.
 * @param {string} [name] - New role name. If not provided, the existing name is preserved.
 * @param {Permissions[]} [permissions] - New permissions list. If not provided, the existing permissions are preserved.
 * @returns {Promise<Result<RoleDefinition>>} A result wrapper containing the updated role on success, or a failure result on error.
 *
 * @remarks
 * - Returns a resource-not-found failure when the role cannot be found.
 * - Returns a failure when attempting to update roles in a protected/system office.
 */
export async function updateRole(roleId: string, name?: string, permissions?: Permissions[]): Promise<Result<RoleDefinition>> {
  try {
    const [existingRole] = await db
      .select({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
        office: office.name,
      })
      .from(officePosition)
      .leftJoin(office, eq(office.id, officePosition.officeId))
      .limit(1);

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

    return new Success(updatedRole as RoleDefinition);
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
export async function deleteRole(roleId: string) {
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

type RoleDefinition = {
  id: string;
  name: string;
  permissions: Array<Permissions>;
}

type OfficeDefinition = {
  roles: Array<RoleDefinition>
} & Office;

type OfficeInput = {
  name: string;
  positions: Array<{
    name: string;
    permissions: Array<Permissions>;
  }>
}
