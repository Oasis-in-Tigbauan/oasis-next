import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  expenseClasses,
  obrRequestApprovers,
  obrRequestItems,
  obrRequests,
  office,
  officeCodes,
  officePosition,
  user as userSchema,
} from "@/lib/db/schema";
import * as permissions from "@/lib/db/permissions";
import { validatorUtilities } from "@/lib/validators";
import { type User } from "@/lib/accounts";


/**
 * Creates a new OBR request for the given user.
 *
 * @description
 * Determines whether the request is basic or advanced based on the number of request items, resolves the required
 * approver positions, validates all referenced responsibility centers and expense codes, then creates the request,
 * approver records, and request items in a single transaction.
 *
 * On success, wraps the created request in a {@link Success}. On validation failure, returns a {@link Failure}
 * describing the missing approver position or invalid reference. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function createRequest
 * @param {CreateNewRequestType} req - Request payload containing request details and line items to create.
 * @param {User} user - User creating/publishing the request.
 * @returns {Promise<Result<ObrRequestType>>} A result wrapper containing the created OBR request on success, or a
 *                                            failure result on error.
 *
 * @remarks
 * - Requests with more than four items are treated as advanced requests.
 * - Basic requests require an office-head approver and a budget-officer approver.
 * - Advanced requests additionally require a higher-level approver.
 * - Responsibility centers and expense codes are validated before the transaction is committed.
 */
export async function createRequest(req: CreateNewRequestType, user: User): Promise<Result<ObrRequestType>> {
  try {
    // Check if the request is basic or advanced
    const isAdvanced = req.requestItems.length > 4;

    // Fetch all necessary positions
    const positions = await db
      .select({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
        officeId: officePosition.officeId,
      })
      .from(officePosition);

    const headPosition = positions.find(
      p =>
        p.officeId === user.office.id &&
        p.permissions.includes(permissions.OFFICE_HEAD),
    );

    const budgetOfficerPosition = positions.find(p =>
      p.permissions.includes(permissions.OBR_APPROVER_BASIC_HIGH_WRITE),
    );

    const higherUpSigners = isAdvanced
      ? positions.filter(p =>
        p.permissions.includes(permissions.OBR_APPROVER_ADVANCED_WRITE),
      ).slice(0, 1)
      : [];

    if (!headPosition) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "User does not have a head position in the office.",
        { req, userId: user.id },
      );
    }

    if (!budgetOfficerPosition) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "User does not have a budget officer position in the office.",
        { req, userId: user.id },
      );
    }

    if (isAdvanced && higherUpSigners.length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "User does not have a signer for higher up approvals.",
        { req, userId: user.id },
      );
    }

    // Preload all FK references
    const responsibilityIds = req.requestItems.map(i => i.responsibilityCenterId);
    const expenseIds = req.requestItems.map(i => i.expenseCodeId);

    const [responsibilityCenters, expenseCodes] = await Promise.all([
      db
        .select({ id: officeCodes.id, aa: officeCodes.aa })
        .from(officeCodes)
        .where(inArray(officeCodes.id, responsibilityIds)),

      db
        .select({
          id: expenseClasses.id,
          name: expenseClasses.accountName,
          fpp: expenseClasses.fpp,
          accountCode: expenseClasses.accountCode,
        })
        .from(expenseClasses)
        .where(inArray(expenseClasses.id, expenseIds)),
    ]);

    const rcMap = new Map(responsibilityCenters.map(r => [r.id, r]));
    const ecMap = new Map(expenseCodes.map(e => [e.id, e]));

    // Validate all exist
    for (const item of req.requestItems) {
      if (!rcMap.has(item.responsibilityCenterId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Invalid responsibility center.",
          { req, userId: user.id },
        );
      }
      if (!ecMap.has(item.expenseCodeId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Invalid expense code.",
          { req, userId: user.id },
        );
      }
    }

    const transaction = await db.transaction(async tx => {
      const requestType = isAdvanced ? "advanced" : "basic";

      const [request] = await tx
        .insert(obrRequests)
        .values({
          requestNumber: req.requestNumber,
          payee: req.payee,
          officeAddress: req.officeAddress,
          originatingOfficeId: user.office.id,
          ...(validatorUtilities.isNotEmpty(req.obrNumber) && {
            obrNumber: req.obrNumber,
          }),
          ...(validatorUtilities.isNotEmpty(req.prNumber) && {
            prNumber: req.prNumber,
          }),
          publisherId: user.id,
          type: requestType,
        })
        .returning();

      if (!request) throw new Error("Failed to create request");

      // Approvers
      const signerIds = [
        headPosition.id,
        budgetOfficerPosition.id,
        ...higherUpSigners.map(s => s.id),
      ];

      await tx.insert(obrRequestApprovers).values(
        signerIds.map(id => ({
          requestId: request.id,
          positionId: id,
          status: "pending" as const,
        })),
      );

      const insertedItems = await tx
        .insert(obrRequestItems)
        .values(
          req.requestItems.map(item => ({
            particulars: item.particulars,
            amount: casts.castToDecimal(item.amount),
            requestId: request.id,
            responsibilityCenterId: item.responsibilityCenterId,
            expenseCodeId: item.expenseCodeId,
          })),
        )
        .returning();

      // Map items (no extra DB calls)
      const items = insertedItems.map(i => ({
        id: i.id,
        particulars: i.particulars,
        amount: casts.castFromDecimal(i.amount),
        responsibilityCenter: {
          id: i.responsibilityCenterId,
          name: rcMap.get(i.responsibilityCenterId)!.aa,
        },
        expenseCode: {
          id: i.expenseCodeId,
          name: ecMap.get(i.expenseCodeId)!.name,
          fpp: ecMap.get(i.expenseCodeId)!.fpp,
          accountCode: ecMap.get(i.expenseCodeId)!.accountCode,
        },
      }));

      return { ...request, items };
    });

    // Mapping
    return new Success({
      id: transaction.id,
      type: transaction.type,
      payee: transaction.payee,
      officeAddress: transaction.officeAddress,
      obrNumber: transaction.obrNumber,
      prNumber: transaction.prNumber,
      requestItems: transaction.items,
      requestItemsCount: transaction.items.length,
      office: {
        id: user.office.id,
        name: user.office.name,
      },
      publisher: {
        id: user.id,
        name: user.fullName,
      },
      approvers: [
        headPosition,
        budgetOfficerPosition,
        ...higherUpSigners,
      ].map(p => ({
        status: "pending" as const,
        reason: null,
        position: { id: p.id, name: p.name },
        signer: null,
        signedAt: null,
      })),
    } satisfies ObrRequestType);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create a request", { req, userId: user.id }, e);
  }
}

/**
 * Updates the approval state for an OBR request approver entry.
 *
 * @description
 * Verifies that the user has an office position with the required OBR approval permission, confirms that the user's
 * position is part of the request's signing personnel, and prevents changes when the approver entry has already been
 * signed. If all checks pass, records the acting user, timestamp, and requested approval status.
 *
 * On success, wraps the updated approver information in a {@link Success}. On permission or validation failure, returns
 * a {@link Failure} describing why the state could not be changed. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function setApproverState
 * @param {string} entryId - Identifier of the OBR request whose approver state should be updated.
 * @param {User} user - User attempting to approve, bin, or keep the request pending.
 * @param {"pending" | "approved" | "binned"} status - Approval status to apply to the approver entry.
 * @param {string} [reason] - Optional reason for the approval status change.
 * @returns {Promise<Result<ApproverObject>>} A result wrapper containing the updated approver object on success, or a
 *                                            failure result on error.
 *
 * @remarks
 * - Requires one of the configured OBR approval write permissions.
 * - The user's position must be assigned as a signer for the request.
 * - Already-signed approver entries cannot be changed.
 */
export async function setApproverState(entryId: string, user: User, status: "pending" | "approved" | "binned", reason?: string): Promise<Result<ApproverObject>> {
  try {
    // Fetch the position of the user in the office
    const [role] = await db
      .select({ id: officePosition.id, name: officePosition.name, permissions: officePosition.permissions })
      .from(officePosition)
      .where(eq(officePosition.officeId, user.office.role.id));
    if (!role) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "You cannot change the approval state of this request due to lack of permission. Contact your Budget Officer for assistance.",
        { entryId, userId: user.id, status },
      );
    }

    // Check for the position if the user contains the required permissions.
    const permissionSet = new Set(role.permissions);
    if (
      !permissionSet.has(permissions.OBR_APPROVER_BASIC_WRITE) &&
      !permissionSet.has(permissions.OBR_APPROVER_BASIC_HIGH_WRITE) &&
      !permissionSet.has(permissions.OBR_APPROVER_ADVANCED_WRITE)
    ) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "You cannot change the approval state of this request due to lack of permission. Contact your Budget Officer for assistance.",
        { entryId, userId: user.id, permissions: user.office.role.permissions, status },
      );
    }

    // Find the signing object:
    const [approverObject] = await db
      .select({
        id: obrRequestApprovers.id,
        actorId: obrRequestApprovers.actedUserId,
        status: obrRequestApprovers.status,
      })
      .from(obrRequestApprovers)
      .where(
        and(
          eq(obrRequestApprovers.requestId, entryId),
          eq(obrRequestApprovers.positionId, role.id),
        ),
      )
      .limit(1);
    if (!approverObject) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "You are not in the signing personnel of this request. Contact your Budget Officer for assistance.",
        { entryId, userId: user.id, status },
      );
    }

    // If the head already signs the object, then fail.
    if (approverObject.status !== "pending" && approverObject.actorId !== null) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This request has already been signed. Contact your Budget Officer for assistance.",
        { entryId, userId: user.id, status },
      );
    }

    // Set the signing state to the object
    const [result] = await db
      .update(obrRequestApprovers)
      .set({
        actedUserId: user.id,
        actedAt: DateTime.utc().toJSDate(),
        status,
        ...(validatorUtilities.isNotEmpty(reason) ? { reason } : {}),
      })
      .where(eq(obrRequestApprovers.id, approverObject.id))
      .returning();
    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Unable to set approver state", { entryId, userId: user.id, status });
    }

    return new Success({
      status: result.status,
      reason: result.reason,
      position: {
        id: role.id,
        name: role.name,
      },
      signer: {
        id: user.id,
        name: user.fullName,
      },
      signedAt: result.actedAt,
    } satisfies ApproverObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to set approver state", { entryId, userId: user.id, status }, e);
  }
}

/**
 * Retrieves the list of OBR request summaries available to the given approver user.
 *
 * @description
 * Verifies that the user has an office position with the required OBR approval read permission, then fetches OBR
 * requests with their item counts and approver states. Each request is mapped into a summary object with a computed
 * overall approval status.
 *
 * On success, wraps the request summary list in a {@link Success}. On permission failure, returns a {@link Failure}
 * indicating the user cannot view approval state information. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function list
 * @param {User} user - User attempting to view OBR request summaries.
 * @returns {Promise<Result<Array<ObrRequestSummaryType>>>} A result wrapper containing OBR request summaries on success,
 *                                                          or a failure result on error.
 *
 * @remarks
 * - Requires one of the configured OBR approval read permissions, or the budget-officer approval permission.
 * - Each summary includes the request item count and computed approval status.
 * - Intended for approval overview screens and request monitoring flows.
 */
export async function list(user: User): Promise<Result<Array<ObrRequestSummaryType>>> {
  try {
    const validate = await isAccessingUserValidAsRequestReader(user);
    if (validate.error) {
      return new Failure(
        validate.error,
        "Unable to list requests",
        { userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    // Fetch all items
    const all = await db
      .select({
        id: obrRequests.id,
        type: obrRequests.type,
        payee: obrRequests.payee,
        officeAddress: obrRequests.officeAddress,
        obrNumber: obrRequests.obrNumber,
        prNumber: obrRequests.prNumber,
        requestItemsCount: sql<number>`
            SELECT COUNT(*) FROM ${obrRequestItems} WHERE ${obrRequestItems.requestId} = ${obrRequests.id}
        `,
        approvers: sql<({ status: ApprovalState })[]>`
            SELECT COALESCE(
                json_agg(
                    json_build_object(
                        'status', ${obrRequestApprovers.status}
                    )
                ),
                '[]'::json
            )
            FROM ${obrRequestApprovers}
            WHERE ${obrRequestApprovers.requestId} = ${obrRequests.id}
        `,
      })
      .from(obrRequests)
      .where(validate.officeLimited ? eq(obrRequests.originatingOfficeId, user.office.id) : undefined);

    return new Success(all.map(i => ({
      id: i.id,
      type: i.type,
      payee: i.payee,
      officeAddress: i.officeAddress,
      obrNumber: i.obrNumber,
      prNumber: i.prNumber,
      requestItemsCount: i.requestItemsCount,
      approvalStatus: getSummaryOfStates(i.approvers),
    } satisfies ObrRequestSummaryType)));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to list requests", { userId: user.id }, e);
  }
}

export async function getObrRequestById(requestId: string, user: User): Promise<Result<ObrRequestType>> {
  try {
    const validate = await isAccessingUserValidAsRequestReader(user);
    if (validate.error) {
      return new Failure(
        validate.error,
        "Unable to get the object you requested.",
        { userId: user.id, requestId },
        validate.stack ? validate.stack : undefined,
      );
    }

    // Get the initial values
    const whereQuery: SQL[] = [
      eq(obrRequests.id, requestId),
    ];
    if (validate.officeLimited) whereQuery.push(eq(obrRequests.originatingOfficeId, user.office.id));

    const [result] = await db
      .select({
        id: obrRequests.id,
        type: obrRequests.type,
        payee: obrRequests.payee,
        officeAddress: obrRequests.officeAddress,
        obrNumber: obrRequests.obrNumber,
        prNumber: obrRequests.prNumber,
        publisherId: obrRequests.publisherId,
        officeId: obrRequests.originatingOfficeId,
        requestItems: sql<({ particulars: string, amount: string, responsibilityCenterId: string, expenseCodeId: string })[]>`
            SELECT COALESCE(
                json_agg(
                    json_build_object(
                        'particulars', ${obrRequestItems.particulars},
                        'amount', ${obrRequestItems.amount},
                        'responsibilityCenterId', ${obrRequestItems.responsibilityCenterId},
                        'expenseCodeId', ${obrRequestItems.expenseCodeId}
                    )
                ),
                '[]'::json
            )
            FROM ${obrRequestItems}
            WHERE ${obrRequestItems.requestId} = ${obrRequests.id}
        `,
        requestItemsCount: sql<number>`
            SELECT COUNT(*) FROM ${obrRequestItems} WHERE ${obrRequestItems.requestId} = ${obrRequests.id}
        `,
        approvers: sql<({ status: ApprovalState, positionId: string, reason?: string, actedUserId?: string, actedAt?: Date })[]>`
            SELECT COALESCE(
                json_agg(
                    json_build_object(
                        'status', ${obrRequestApprovers.status},
                        'positionId', ${obrRequestApprovers.positionId},
                        'reason', ${obrRequestApprovers.reason},
                        'actedUserId', ${obrRequestApprovers.actedUserId},
                        'actedAt', ${obrRequestApprovers.actedAt}
                    )
                ),
                '[]'::json
            )
            FROM ${obrRequestApprovers}
            WHERE ${obrRequestApprovers.requestId} = ${obrRequests.id}
        `,
      })
      .from(obrRequests)
      .where(whereQuery.length >= 2 ? and(...whereQuery) : whereQuery[0]);
    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId, userId: user.id });
    }

    // Get the codes, user, positions and originating office
    const rcIds = [...new Set(result.requestItems.map(o => o.responsibilityCenterId))];
    const ecIds = [...new Set(result.requestItems.map(e => e.expenseCodeId))];

    const [responsibilityCenters, expenseCodes, users, positions, originatingOffice] = await Promise.all([
      db
        .select({ id: officeCodes.id, aa: officeCodes.aa })
        .from(officeCodes)
        .where(inArray(officeCodes.id, rcIds)),

      db
        .select({
          id: expenseClasses.id,
          name: expenseClasses.accountName,
          fpp: expenseClasses.fpp,
          accountCode: expenseClasses.accountCode,
        })
        .from(expenseClasses)
        .where(inArray(expenseClasses.id, ecIds)),

      db
        .select({ id: userSchema.id, name: userSchema.name })
        .from(userSchema)
        .where(
          inArray(
            userSchema.id,
            [
              result.publisherId,
              ...result.approvers
                .filter(a => validatorUtilities.isNotEmpty(a.actedUserId))
                .map(a => a.actedUserId!),
            ],
          ),
        ),

      db
        .select({ id: officePosition.id, name: officePosition.name })
        .from(officePosition)
        .where(
          inArray(
            officePosition.id,
            result.approvers.map(a => a.positionId),
          ),
        ),

      db
        .select({ id: office.id, name: office.name })
        .from(office)
        .where(eq(office.id, result.officeId)),
    ]);

    const rcMap = new Map(responsibilityCenters.map(r => [r.id, r]));
    const ecMap = new Map(expenseCodes.map(e => [e.id, e]));
    const uMap = new Map(users.map(u => [u.id, u]));
    const pMap = new Map(positions.map(p => [p.id, p]));

    // Map
    const mapped: ObrRequestType = {
      id: result.id,
      type: result.type,
      payee: result.payee,
      officeAddress: result.officeAddress,
      obrNumber: result.obrNumber,
      prNumber: result.prNumber,
      publisher: {
        id: uMap.get(result.publisherId)!.id,
        name: uMap.get(result.publisherId)!.name,
      },
      office: {
        id: originatingOffice[0].id,
        name: originatingOffice[0].name,
      },
      requestItemsCount: result.requestItemsCount,
      requestItems: result.requestItems.map(i => ({
        particulars: i.particulars,
        amount: casts.castFromDecimal(i.amount),
        expenseCode: {
          id: ecMap.get(i.expenseCodeId)!.id,
          name: ecMap.get(i.expenseCodeId)!.name,
          fpp: ecMap.get(i.expenseCodeId)!.fpp,
          accountCode: ecMap.get(i.expenseCodeId)!.accountCode,
        },
        responsibilityCenter: {
          id: rcMap.get(i.responsibilityCenterId)!.id,
          name: rcMap.get(i.responsibilityCenterId)!.aa,
        },
      })),
      approvers: result.approvers.map(a => ({
        status: a.status,
        reason: a.reason,
        position: {
          id: pMap.get(a.positionId)!.id,
          name: pMap.get(a.positionId)!.name,
        },
        signer: validatorUtilities.isNotEmpty(a.actedUserId)
          ? { id: uMap.get(a.actedUserId!)!.id, name: uMap.get(a.actedUserId!)!.name }
          : null,
        signedAt: a.actedAt,
      })),
    };

    return new Success(mapped);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to fetch the obr request due to an error.",
      { requestId, userId: user.id },
      e,
    );
  }
}

/**
 * Computes the overall approval status from a list of approver states.
 *
 * @description
 * Evaluates the provided approver states and returns a single summary status. If any approver is still pending, the
 * summary is pending. If all approvers are no longer pending but do not share the same state, the summary is mixed.
 * Otherwise, the shared approver state is returned.
 *
 * @function getSummaryOfStates
 * @param {Array<{ status: ApprovalState }>} states - Approver state entries to summarize.
 * @returns {ApprovalStateResponseType} The computed summary status for the provided approver states.
 *
 * @remarks
 * - Pending takes priority over all other states.
 * - Mixed is returned when completed approver states differ.
 * - The function expects at least one state entry.
 */
function getSummaryOfStates(states: Array<{ status: "pending" | "approved" | "binned" }>): ApprovalStateResponseType {
  // Mark it as pending if one of status is pending.
  const hasPending = states.some(s => s.status === "pending");
  if (hasPending) return "pending";

  const isEqualState = states.some(s => s.status === states[0].status);
  if (!isEqualState) return "mixed";

  return states[0].status;
}

/**
 * Validates whether a user can read OBR request information.
 *
 * @description
 * Resolves the user's office position and checks whether it includes any permission that allows reading OBR request
 * approval or request information. Returns a lightweight validation result instead of throwing or using a result
 * wrapper, allowing callers to decide how to translate the validation outcome into a response.
 *
 * On success, returns whether access should be limited to the user's office. On permission failure, returns an
 * insufficient-permissions error. On unexpected failure, returns a fatal error with the caught stack value.
 *
 * @async
 * @function isAccessingUserValidAsRequestReader
 * @param {User} user - User whose request-reader access should be validated.
 * @returns {Promise<AccessRequestReaderValidationResult>} A validation result describing the user's read access, or an
 *                                                         error state.
 *
 * @remarks
 * - Accepts users with configured OBR approval read permissions.
 * - Accepts users with direct OBR request read permission.
 * - `officeLimited` is enabled when the user has direct OBR request read permission.
 */
async function isAccessingUserValidAsRequestReader(user: User): Promise<AccessRequestReaderValidationResult> {
  try {
    // Fetch the position of the user in the office
    const [role] = await db
      .select({ id: officePosition.id, name: officePosition.name, permissions: officePosition.permissions })
      .from(officePosition)
      .where(eq(officePosition.officeId, user.office.role.id));
    if (!role) {
      return { error: ErrorCodes.InsufficientPermissions };
    }

    // Check for the position if the user contains the required permissions.
    const permissionSet = new Set(role.permissions);
    if (
      !permissionSet.has(permissions.OBR_APPROVER_BASIC_READ) &&
      !permissionSet.has(permissions.OBR_APPROVER_BASIC_HIGH_WRITE) &&
      !permissionSet.has(permissions.OBR_APPROVER_ADVANCED_READ) &&
      !permissionSet.has(permissions.OBR_REQUEST_READ)
    ) {
      return { error: ErrorCodes.InsufficientPermissions };
    }

    return {
      officeLimited: permissionSet.has(permissions.OBR_REQUEST_READ),
    };
  } catch (e) {
    return {
      error: ErrorCodes.Fatal,
      stack: e,
    };
  }
}

type AccessRequestReaderValidationResult = {
  error?: ErrorCodes | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stack?: any,
  officeLimited?: boolean,
}

type ApprovalState = "pending" | "approved" | "binned";
type ApprovalStateResponseType = ApprovalState | "mixed";

type CreateNewRequestType = {
  requestNumber: string;
  payee: string;
  officeAddress: string;
  obrNumber?: string;
  prNumber?: string;
  requestItems: Array<{
    responsibilityCenterId: string;
    expenseCodeId: string;
    particulars: string;
    amount: number;
  }>
}

type BaseObrRequestType = {
  id: string;
  type: string;
  payee: string;
  officeAddress: string;
  obrNumber: Optional<string>;
  prNumber: Optional<string>;
  requestItemsCount: number;
}

type ObrRequestSummaryType = {
  approvalStatus:  "pending" | "approved" | "binned" | "mixed"
} & BaseObrRequestType;

type ObrRequestType = {
  office: {
    id: string;
    name: string;
  }
  requestItems: Array<{
    particulars: string;
    amount: number;
    expenseCode: {
      id: string;
      name: string;
      fpp: Optional<string>;
      accountCode: Optional<string>;
    }
    responsibilityCenter: {
      id: string;
      name: string;
    }
  }>
  publisher: {
    id: string;
    name: string;
  }
  approvers: Array<ApproverObject>
} & BaseObrRequestType;

type ApproverObject = {
  status: string;
  reason: Optional<string>;
  position: {
    id: string;
    name: string;
  }
  signer: Optional<{
    id: string;
    name: string;
  }>
  signedAt: Optional<Date>;
}
