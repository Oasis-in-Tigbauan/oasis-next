import { and, count, eq, gt, not } from "drizzle-orm";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/nextjs";
import { v4 as uuidv4 } from "uuid";

import { auth } from "@/lib/auth";
import { cacheManager } from "@/lib/cache";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, type Result, Success, unwrap } from "@/lib/one-of";
import { generatePassword } from "@/lib/generators/password-generator";
import { InvitationEmailHtml } from "@/lib/mailer/templates/InvitationMail";
import { invitations, office, officePosition, user } from "@/lib/db/schema";
import { Permissions } from "@/lib/db/permissions";
import { send } from "@/lib/mailer";
import { validatorUtilities } from "@/lib/validators";

/**
 * Retrieves a user by id, using a cache-first strategy.
 *
 * Flow:
 * - Validates the `id` is present.
 * - Attempts to read `user:${id}` from the JSON cache.
 * - If not cached, queries the database (including office + role/permissions).
 * - Caches the assembled user payload for a short period (5 minutes).
 *
 * @param {string} id The user identifier to look up.
 * @returns {Promise<Result<User>>} A {@link Success} containing the user payload on success, or a {@link Failure}
 *                                  describing validation, not-found, or unexpected errors.
 *
 * @example
 * const res = await getUserById("user_id"); // res are Success<User> or Failure
 */
export async function getUserById(id: string): Promise<Success<User> | Failure> {
  if (!validatorUtilities.isExisty(id)) {
    return new Failure(ErrorCodes.ValidationFailure, "User ID is required.", { id });
  }

  try {
    // Return the cached user if it exists.
    const key = `user:${id}`;
    const cached = await cacheManager.getJson<User>(key);
    if (cached) {
      return new Success<User>(cached);
    }

    // Fetch the user from the database.
    const [account] = await db
      .select({
        id: user.id,
        fullName: user.name,
        email: user.email,
        activated: user.emailVerified,
        banned: user.banned,
        shadowBanned: user.shadowBanned,
        twoFactorEnabled: user.twoFactorEnabled,
        officeId: office.id,
        officeName: office.name,
        officePositionId: officePosition.id,
        officePositionName: officePosition.name,
        officePositionPermissions: officePosition.permissions,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, id))
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .leftJoin(office, eq(office.id, user.officeId))
      .limit(1);
    if (!account) {
      return new Failure(ErrorCodes.ResourceNotFound, "User not found.", { id });
    }

    const payload: User = {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      activated: account.activated,
      banned: account.banned,
      registrationDate: DateTime
        .fromJSDate(account.createdAt, { zone: "Asia/Manila" })
        .toFormat("MM/dd/yyyy HH:mm"),
      office: {
        id: account.officeId!,
        name: account.officeName!,
        role: {
          id: account.officePositionId!,
          name: account.officePositionName!,
          permissions: account.officePositionPermissions! as Permissions[],
        },
      },
      DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED: account.shadowBanned,
      twoFactorEnabled: account.twoFactorEnabled ?? false,
    };

    // Write to cache
    await cacheManager.writeJson(key, payload, { lifetime: 5 });
    return new Success<User>(payload);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during user lookup.", { id }, e);
  }
}

/**
 * Retrieves all accounts that have not yet been activated (i.e., users whose email is not verified),
 * including their associated office and role (office position) details.
 *
 * The result is returned using the project’s one-of pattern:
 * - {@link Success} contains an array of {@link User} objects when the lookup succeeds.
 * - {@link Failure} is returned when an unexpected exception occurs during the lookup.
 *
 * Notes:
 * - Uses a left-join strategy, so office/role records may be absent depending on the user’s associations.
 * - Intended for administrative flows such as account approval or onboarding review.
 *
 * @returns {Promise<Result<Array<User>>>}
 * A {@link Success} wrapping the list of unactivated users, or a {@link Failure} describing a fatal error.
 *
 * @example
 * const res = await getUnactivatedAccounts();
 * if (res instanceof Success) {
 *   console.log(res.value.length);
 * } else {
 *   console.error(res.code, res.message);
 * }
 */
export async function getUnactivatedAccounts(): Promise<Result<Array<User>>> {
  try {
    const accounts = await db
      .select({
        id: user.id,
        fullName: user.name,
        email: user.email,
        activated: user.emailVerified,
        banned: user.banned,
        shadowBanned: user.shadowBanned,
        twoFactorEnabled: user.twoFactorEnabled,
        officeId: office.id,
        officeName: office.name,
        officePositionId: officePosition.id,
        officePositionName: officePosition.name,
        officePositionPermissions: officePosition.permissions,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(
        and(
          eq(user.emailVerified, false),
          eq(user.shadowBanned, false),
        ),
      )
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .leftJoin(office, eq(office.id, user.officeId));

    const mapped: Array<User> = accounts
      .filter(a => a.officeName?.toLowerCase() !== "cardinal administrators")
      .map(a => ({
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        activated: a.activated,
        banned: a.banned,
        registrationDate: DateTime
          .fromJSDate(a.createdAt, { zone: "Asia/Manila" })
          .toFormat("MM/dd/yyyy HH:mm"),
        office: {
          id: a.officeId!,
          name: a.officeName!,
          role: {
            id: a.officePositionId!,
            name: a.officePositionName!,
            permissions: a.officePositionPermissions! as Permissions[],
          },
        },
        DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED: a.shadowBanned,
        twoFactorEnabled: a.twoFactorEnabled ?? false,
      }));

    return new Success(mapped);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during user lookup.", {}, e);
  }
}

/**
 * Retrieves all activated (email-verified) user accounts, excluding members of the administrators office,
 * and maps them into the app's `User` domain shape including office and role/permissions metadata.
 *
 * @returns A `Result` containing an array of users on success, or a fatal `Failure` if the lookup fails unexpectedly.
 *
 * @remarks
 * - Only accounts with verified users are included.
 * - Accounts associated with the administrators office are excluded.
 * - Role permissions are included as part of the returned office/role object for each user.
 */
export async function getAllAccounts(): Promise<Result<Array<User>>> {
  try {
    // Exclude administrators
    const [cardinals] = await db
      .select({
        id: office.id,
      })
      .from(office)
      .where(eq(office.name, "Cardinal Administrators"))
      .limit(1);

    // Return
    const users = await db
      .select({
        id: user.id,
        fullName: user.name,
        email: user.email,
        activated: user.emailVerified,
        banned: user.banned,
        shadowBanned: user.shadowBanned,
        twoFactorEnabled: user.twoFactorEnabled,
        officeId: office.id,
        officeName: office.name,
        officePositionId: officePosition.id,
        officePositionName: officePosition.name,
        officePositionPermissions: officePosition.permissions,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(
        and(
          eq(user.emailVerified, true),
          not(eq(user.officeId, cardinals.id)),
        ),
      )
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .leftJoin(office, eq(office.id, user.officeId));

    const mapped: Array<User> = users.map(a => ({
      id: a.id,
      fullName: a.fullName,
      email: a.email,
      activated: a.activated,
      banned: a.banned,
      registrationDate: DateTime
        .fromJSDate(a.createdAt, { zone: "Asia/Manila" })
        .toFormat("MM/dd/yyyy HH:mm"),
      office: {
        id: a.officeId!,
        name: a.officeName!,
        role: {
          id: a.officePositionId!,
          name: a.officePositionName!,
          permissions: a.officePositionPermissions! as Permissions[],
        },
      },
      DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED: a.shadowBanned,
      twoFactorEnabled: a.twoFactorEnabled ?? false,
    }));

    return new Success(mapped);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during user lookup.", {}, e);
  }
}

/**
 * Creates and persists a new invitation for a user to join an office, then attempts to email the invitation link.
 *
 * Validates the input `email` and `officeId`, ensures the target office exists, generates a time-limited token,
 * inserts the invitation record, and sends an email containing the enrollment URL and expiration time.
 *
 * @param {CreateInvitationPayload} payload - Contains the information of the user to be invited.
 * @returns A `Result` containing the created invitation payload on success, or a failure describing why it could not be
 *          created.
 *
 * @remarks
 * - Invitation tokens expire 24 hours after creation.
 * - Email send failures are returned as part of the success payload (when the DB insert succeeds), rather than failing
 *   the whole operation.
 * - Unexpected errors are wrapped in a fatal failure result.
 */
export async function createNewInvitation(payload: CreateInvitationPayload): Promise<Result<SentInvitation>> {
  try {
    // Check if that user with that email is already invited before.
    const [existingInvitation] = await db
      .select({
        id: invitations.id,
      })
      .from(invitations)
      .where(eq(invitations.email, payload.email.toLowerCase()))
      .limit(1);
    if (existingInvitation) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "You cannot create an invitation for an existing user.",
      );
    }

    // Check if the user with that email is already registered.
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, payload.email))
      .limit(1);
    if (existingUser) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "You cannot create an invitation for an existing user.",
      );
    }

    // Check if the office exists
    const [targetOffice] = await db
      .select({ id: office.id, name: office.name })
      .from(office)
      .where(
        and(
          eq(office.id, payload.officeId),
          not(eq(office.name, "Cardinal Administrators")),
        ),
      )
      .limit(1);
    if (!targetOffice) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office not found.", { payload });
    }

    // Check if the office position exists
    const [targetOfficePosition] = await db
      .select({ id: officePosition.id, name: officePosition.name })
      .from(officePosition)
      .where(
        and(
          eq(officePosition.id, payload.officePositionId),
          eq(officePosition.officeId, targetOffice.id),
          not(eq(officePosition.name, "Heathcliff")),
          not(eq(officePosition.name, "Default Users Group")),
        ),
      );
    if (!targetOfficePosition) {
      return new Failure(ErrorCodes.ResourceNotFound, "Office Position not found.", { payload });
    }

    // Issue a new invitation.
    const token = uuidv4();

    // Expire the token after 24 hours.
    const expiresAt = DateTime.utc().plus({ hours: 24 }).toJSDate();

    // Create the entry
    const [result] = await db
      .insert(invitations)
      .values({
        email: payload.email,
        token,
        validUntil: expiresAt,
        officeId: targetOffice.id,
        officePositionId: targetOfficePosition.id,
      })
      .returning();

    // Send the email to the user.
    const { error } = await send({
      to: [result.email],
      subject: "Invitation to Join Municipality of Tigbauan",
      html: InvitationEmailHtml({
        inviteUrl: `/enrollment/?token=${token}`,
        expiresAt: DateTime
          .fromJSDate(expiresAt, { zone: "UTC" })
          .setZone("Asia/Manila")
          .toFormat("MM/dd/yyyy HH:mm"),
      }),
    });

    // Report to sentry...
    if (error) {
      Sentry.logger.error("Failed to send an email. See info.", error);
    }

    return new Success({
      id: result.id,
      email: result.email,
      office: {
        id: targetOffice.id,
        name: targetOffice.name,
        role: {
          id: targetOfficePosition.id,
          name: targetOfficePosition.name,
        },
      },
      ...(error
        ? { errors: { message: "Failed to send the email. This issue has been reported." } }
        : {}
      ),
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create a new invitation due to an unexpected error", {}, e);
  }
}

/**
 * Re-sends an existing invitation email for the specified invitation record.
 *
 * Loads the invitation details (recipient email, token, and expiration timestamp) and sends a fresh email
 * containing the enrollment URL and the formatted expiry time. Email delivery errors are logged and surfaced
 * in the success payload rather than failing the entire operation.
 *
 * @param id - The invitation identifier whose email should be re-sent.
 * @returns A `Result` containing `{ ok: true }` on success. If email delivery fails, `errors` is included in the success payload.
 *
 * @remarks
 * - If the invitation does not exist, this returns a resource-not-found failure.
 * - Email provider failures are logged for observability and returned as a non-fatal `errors` field.
 * - This does not create a new token or extend expiration; it reuses the existing token and validity window.
 */
export async function resendInvitation(id: string): Promise<Result<{ ok: boolean, errors?: object }>> {
  try {
    const [result] = await db
      .select({
        email: invitations.email,
        token: invitations.token,
        validUntil: invitations.validUntil,
      })
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);
    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "Invitation not found.");
    }

    // Send the email to the user.
    const { error } = await send({
      to: [result.email],
      subject: "Invitation to Join Municipality of Tigbauan",
      html: InvitationEmailHtml({
        inviteUrl: `/enrollment/?token=${result.token}`,
        expiresAt: DateTime
          .fromJSDate(result.validUntil, { zone: "UTC" })
          .setZone("Asia/Manila")
          .toFormat("MM/dd/yyyy HH:mm"),
      }),
    });

    // Report to sentry...
    if (error) {
      Sentry.logger.error("Failed to send an email. See info.", error);
    }

    return new Success({
      ok: true,
      ...(error ? { errors: { message: "Failed to send the email. This issue has been reported." } } : {}),
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to resend invitation due to an unexpected error", {}, e);
  }
}

/**
 * Fetches all currently active (unconsumed) invitations, enriched with office details when available.
 *
 * Uses the project’s one-of result pattern:
 * - {@link Success} contains an array of {@link Invitation} records on success.
 * - {@link Failure} is returned if an unexpected error occurs while querying invitations.
 *
 * Notes:
 * - “Active” means the invitation has not been consumed yet.
 * - Office data is joined with a left join, so office fields may be missing if the referenced office
 *   record is absent or not linked.
 *
 * @returns {Promise<Result<Array<Invitation>>>}
 * A {@link Success} wrapping the list of active invitations, or a {@link Failure} with a fatal error code.
 *
 * @example
 * const res = await getActiveInvitations();
 * if (res instanceof Success) {
 *   for (const invite of res.value) {
 *     console.log(invite.email, invite.officeName);
 *   }
 * } else {
 *   console.error(res.message);
 * }
 */
export async function getActiveInvitations(): Promise<Result<Array<Invitation>>> {
  try {
    const now = DateTime.utc().toJSDate();

    const list = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        officeId: invitations.officeId,
        officeName: office.name,
        officePositionId: officePosition.id,
        officePositionName: officePosition.name,
      })
      .from(invitations)
      .leftJoin(office, eq(office.id, invitations.officeId))
      .leftJoin(officePosition, eq(officePosition.id, invitations.officePositionId))
      .where(and(
        eq(invitations.consumed, false),
        gt(invitations.validUntil, now),
      ));

    const r = list.map(x => ({
      id: x.id,
      email: x.email,
      office: {
        id: x.officeId,
        name: x.officeName!,
        role: {
          id: x.officePositionId!,
          name: x.officePositionName!,
        },
      },
    } satisfies Invitation));

    return new Success(r);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during invitations lookup.", {}, e);
  }
}

/**
 * Revokes (deletes) an invitation by its identifier.
 *
 * Looks up the invitation first to provide a clear "not found" failure when the id does not exist,
 * then deletes the invitation record and returns a success result.
 *
 * @param id - The invitation identifier to revoke.
 * @returns A `Success<null>` when the invitation is revoked, or a `Failure` when the invitation does not exist or an unexpected error occurs.
 *
 * @remarks
 * - If the invitation is missing, this returns a resource-not-found failure.
 * - Any unexpected exception is wrapped as a fatal failure and includes the `id` in the error metadata.
 */
export async function revokeInvitation(id: string): Promise<Success<null> | Failure> {
  try {
    const [invitation] = await db
      .select({
        id: invitations.id,
      })
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);

    if (!invitation) {
      return new Failure(ErrorCodes.ResourceNotFound, "Invitation not found.");
    }

    // Delete entry
    await db.delete(invitations).where(eq(invitations.id, id));

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during invitation revocation.", { id }, e);
  }
}

/**
 * Creates an account.
 *
 * This method is for administrators where they can create accounts without going through the enrollment flows.
 *
 * @param {CreateAccountPayload} payload Account information
 * @returns {Promise<Result<CreateAccountType>>} A {@link Success} containing the user information along with its password
 *                                               or a {@link Failure} describing why the account creation failed.
 *
 * @example
 * const res = await createAccount({
 *   fullName: "Kirigaya Kazuto",
 *   email: "kitigaya.kazuto@email.com",
 *   officeId: "00000000-0000-0000-0000-000000000000",
 *   officePositionId: "00000000-0000-0000-0000-000000000000"
 *   activated: false,
 * }); // res are Success<CreateAccountType> or Failure
 */
export async function createAccount(payload: CreateAccountPayload): Promise<Result<CreateAccountType>> {
  try {
    // Validate email.
    const [userAccountsWithEmail] = await db
      .select({ count: count(user.id) })
      .from(user)
      .where(eq(user.email, payload.email));
    if ((userAccountsWithEmail?.count ?? 0) > 0) {
      return new Failure(ErrorCodes.ValidationFailure, "Email is already been used.", { payload });
    }

    // Validate office
    const [userOffice] = await db
      .select({ id: office.id, name: office.name })
      .from(office)
      .where(
        and(
          eq(office.id, payload.officeId),
          not(eq(office.name, "Cardinal Administrators")),
        ),
      )
      .limit(1);
    if (!userOffice) {
      return new Failure(ErrorCodes.ValidationFailure, "Office doesn't exist!", { payload });
    }

    const [userPosition] = await db
      .select({ id: officePosition.id, name: officePosition.name })
      .from(officePosition)
      .where(
        and(
          eq(officePosition.id, payload.officePositionId),
          eq(officePosition.officeId, userOffice.id),
          not(eq(officePosition.name, "Heathcliff")),
        ),
      )
      .limit(1);
    if (!userPosition) {
      return new Failure(ErrorCodes.ValidationFailure, "Office Position doesn't exist!", { payload });
    }

    // Create the account
    const password = await generatePassword(16, false);
    const account = await auth.api.signUpEmail({
      returnHeaders: false,
      asResponse: true,
      body: {
        name: payload.fullName,
        email: payload.email,
        password,
        officeId: userOffice.id,
        officePositionId: userPosition.id,
      },
    });

    const uRes = await account.json();

    if (payload.activated) {
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, uRes.user.id));
    }

    const u = await unwrap(getUserById(uRes.user.id));
    return new Success({ ...u, password });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create an account due to an exception.", { payload }, e);
  }
}

/**
 * Validates and resolves an invitation token to determine whether enrollment is allowed.
 *
 * Performs:
 * - Basic validation that the token is present.
 * - Lookup of the invitation by token.
 * - Expiration and "already consumed" checks.
 * - Retrieval of office positions assignable for the invitation's office.
 *
 * @param {string} token Invitation token to validate.
 * @returns {Promise<Result<EligibilityResult>>} A {@link Success} containing invitation and office context and
 *                                              assignable positions, or a {@link Failure} describing why the token is
 *                                              invalid/expired/consumed/not found.
 *
 * @example
 * const res = await getEligibility(token); // res are Success<EligibilityResult> or Failure
 */
export async function getEligibility(token: string): Promise<Result<EligibilityResult>> {
  const check = validatorUtilities.isNotEmpty(token);
  if (!check) {
    return new Failure(ErrorCodes.ValidationFailure, "Token is required.", {
      token,
    });
  }

  // Detect the token from the database
  const [invitation] = await db
    .select({
      id: invitations.id,
      token: invitations.token,
      validUntil: invitations.validUntil,
      consumed: invitations.consumed,
      officeId: invitations.officeId,
      officePositionId: invitations.officePositionId,
      email: invitations.email,
    })
    .from(invitations)
    .where(eq(invitations.token, token))
    .leftJoin(office, eq(office.id, invitations.officeId));
  if (!invitation) {
    return new Failure(ErrorCodes.ResourceNotFound, "No such token found.");
  }

  const now = DateTime.utc().toJSDate();
  if (invitation.validUntil < now) {
    return new Failure(ErrorCodes.ResourceExpired, "Token has expired.", {
      token,
      invitation,
      now,
    });
  }

  if (invitation.consumed) {
    return new Failure(ErrorCodes.ResourceExpired, "Token has already been consumed.", {
      invitation,
    });
  }

  return new Success({
    id: invitation.id,
    token: invitation.token,
    officeId: invitation.officeId,
    officePositionId: invitation.officePositionId,
    email: invitation.email,
  });
}

/**
 * Enrolls a user using an invitation/eligibility token and the provided enrollment requirements.
 *
 * Workflow:
 * 1) Verifies eligibility via the token (throws if eligibility lookup fails unexpectedly).
 * 2) Validates that the provided email matches the invitation email.
 * 3) Ensures the requested office position exists and belongs to the same office as the invitation.
 * 4) Creates the user account via email sign-up.
 * 5) Marks the invitation token as consumed.
 *
 * @param {EnrollmentRequirements} payload Enrollment details (token, email, password, etc.).
 * @returns {Promise<Result<{ ok: true }>>} A {@link Success} with `{ ok: true }` on success, or a {@link Failure} on
 *                                          validation/resource/fatal errors.
 *
 * @example
 * const res = await enroll(payload); // res are Success<{ ok: true }> or Failure
 */
export async function enroll(payload: EnrollmentRequirements): Promise<Result<{ ok: true }>> {
  try {
    // Check eligibility.
    const result = await unwrap(getEligibility(payload.token));
    await auth.api.signUpEmail({
      body: {
        name: payload.fullName,
        email: result.email,
        password: payload.password,
        officeId: result.officeId,
        officePositionId: result.officePositionId,
      },
    });

    // After enrollment, we need to consume the token.
    await db.update(invitations).set({ consumed: true }).where(eq(invitations.id, result.id));

    // We need to authenticate the user to mimic the autoSignIn behaviour.
    await auth.api.signInEmail({
      body: {
        email: result.email,
        password: payload.password,
      },
    });

    return new Success({ ok: true });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during enrollment.", {
      payload,
    }, e);
  }
}

/**
 * Toggles the banned status of a user account and returns the updated user record.
 *
 * Clears any cached user entry to prevent stale or bypassed authorization state, verifies the user exists,
 * flips the `banned` flag in persistent storage, then re-fetches the user for the final response.
 *
 * @param id - The unique identifier of the user whose ban status should be toggled.
 * @returns A `Result` containing the updated `User` on success, or a `Failure` if the user does not exist or an unexpected error occurs.
 *
 * @remarks
 * - Cache invalidation is performed before updating to avoid serving outdated user state.
 * - If the user cannot be found, returns a resource-not-found failure with the provided `id`.
 */
export async function toggleBan(id: string): Promise<Result<User>> {
  try {
    // Exclude administrators
    const [cardinals] = await db
      .select({
        id: office.id,
      })
      .from(office)
      .where(eq(office.name, "Cardinal Administrators"))
      .limit(1);

    // Get the user
    const [target] = await db
      .select({
        id: user.id,
        banned: user.banned,
      })
      .from(user)
      .where(
        and(
          eq(user.id, id),
          not(eq(user.officeId, cardinals.id)),
        ),
      )
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, "User not found.", { id });
    }

    // Check if the user is saved on cache.
    // Delete it so that we won't get this weird bypass due to caching.
    const key = `user:${id}`;
    if (key) {
      await cacheManager.delete(key);
    }

    // toggle ban
    await db
      .update(user)
      .set({ banned: !target.banned })
      .where(eq(user.id, target.id));

    // Refetch for final output
    const u = await unwrap(getUserById(id));
    return new Success(u);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during user lookup.", {}, e);
  }
}

/**
 * Approves a pending user account by marking it as email-verified, then returns the updated user record.
 *
 * Only users that match the expected "pending approval" state are eligible:
 * the user must exist, must not be shadow-banned, and must currently be unverified.
 *
 * @param id - The unique identifier of the user to approve.
 * @returns A `Result` containing the updated `User` on success, or a `Failure` if the user is not found/eligible or an unexpected error occurs.
 *
 * @remarks
 * - If the user does not exist or does not meet the eligibility criteria (already verified or shadow-banned), this returns a resource-not-found failure.
 * - After updating, the user is re-fetched to ensure the returned object reflects the latest persisted state.
 */
export async function approveUser(id: string): Promise<Result<User>> {
  try {
    // Get the user
    const [target] = await db
      .select({
        id: user.id,
        activated: user.emailVerified,
        shadowBanned: user.shadowBanned,
      })
      .from(user)
      .where(
        and(
          eq(user.id, id),
          eq(user.shadowBanned, false),
          eq(user.emailVerified, false),
        ),
      )
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, "User not found.", { id });
    }

    // Delete cache entry
    const key = `user:${id}`;
    if (key) {
      await cacheManager.delete(key);
    }

    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, target.id));

    const u = await unwrap(getUserById(id));
    return new Success(u);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during approval.", { id }, e);
  }
}

/**
 * Rejects a user account by marking it as shadow-banned, then returns the updated user record.
 *
 * Prevents rejecting administrator accounts by first resolving the administrators office and excluding users
 * that belong to it. Clears any cached user entry to avoid stale state, updates the user to a rejected state,
 * and re-fetches the user for the response.
 *
 * @param id - The unique identifier of the user to reject.
 * @returns A `Result` containing the updated `User` on success, or a `Failure` if the user is not found/eligible or an unexpected error occurs.
 *
 * @remarks
 * - Administrator accounts are excluded from rejection.
 * - Cache invalidation is performed before updating to prevent serving outdated user state.
 * - If the user does not exist or is excluded by the eligibility rules, this returns a resource-not-found failure.
 */
export async function rejectUser(id: string): Promise<Result<User>> {
  try {
    // Exclude administrators
    const [cardinals] = await db
      .select({
        id: office.id,
      })
      .from(office)
      .where(eq(office.name, "Cardinal Administrators"))
      .limit(1);

    // Get the user
    const [target] = await db
      .select({
        id: user.id,
        banned: user.banned,
      })
      .from(user)
      .where(
        and(
          eq(user.id, id),
          not(eq(user.shadowBanned, true)),
          not(eq(user.officeId, cardinals.id)),
        ),
      )
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, "User not found.", { id });
    }

    // Delete cache entry
    const key = `user:${id}`;
    if (key) {
      await cacheManager.delete(key);
    }

    await db
      .update(user)
      .set({ shadowBanned: true })
      .where(eq(user.id, target.id));

    const u = await unwrap(getUserById(id));
    return new Success(u);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "An exception occurred during rejection.", { id }, e);
  }
}

export type User = {
  id: string;
  fullName: string;
  email: string;
  activated: boolean;
  banned: boolean;
  registrationDate: string;
  office: {
    id: string;
    name: string;
    role: {
      id: string;
      name: string;
      permissions: Permissions[];
    }
  },
  DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED: boolean;
  twoFactorEnabled: boolean;
}

export type Invitation = {
  id: string;
  email: string;
  office: {
    id: string;
    name: string;
    role: {
      id: string;
      name: string;
    }
  }
}

export type SentInvitation = {
  errors?: object
} & Invitation;

export type EligibilityResult = {
  id: string;
  token: string;
  officeId: string;
  officePositionId: string;
  email: string;
}

export type EnrollmentRequirements = {
  fullName: string;
  password: string;
  token: string;
}

export type CreateAccountPayload = {
  fullName: string;
  email: string;
  officeId: string;
  officePositionId: string;
  activated: boolean;
}

export type CreateAccountType = {
  password: string;
} & User;

export type CreateInvitationPayload = {
  email: string;
  officeId: string;
  officePositionId: string;
}
