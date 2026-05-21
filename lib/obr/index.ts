import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  aipReferences,
  esre,
  expenseClasses,
  fundTypes,
  obrDisbursementElectronic,
  obrDisbursementVouchers,
  obrItems,
  obrMainAipReferences,
  obrMainData,
  obrOfficeItem,
  obrRequestApprovers,
  obrRequestItems,
  obrRequests,
  office,
  officeCodes,
  officePosition,
  saaobEntries,
  user,
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
        amount: i.amount,
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
      requestNumber: transaction.requestNumber,
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
      .where(eq(officePosition.id, user.office.role.id));
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

    const all = await _getAllObrRequestAsSummaries(
      and(
        validate.officeLimited ? eq(obrRequests.originatingOfficeId, user.office.id) : undefined,
        validate.positionId
          ? sql`EXISTS (
                SELECT 1 FROM ${obrRequestApprovers}
                WHERE ${obrRequestApprovers.requestId} = ${obrRequests.id}
                  AND ${obrRequestApprovers.positionId} = ${validate.positionId}
              )`
          : undefined,
      )!,
    );

    return new Success(all.map(i => ({
      id: i.id,
      type: i.type,
      requestNumber: i.requestNumber,
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

/**
 * Retrieves all approved OBR request summaries available for disbursement processing.
 *
 * @description
 * Validates that the user has disbursement write access, then fetches OBR requests with their request-item counts and
 * approver states. The results are ordered by creation date, filtered to include only fully approved requests, and mapped
 * into request summary objects.
 *
 * On success, wraps the approved request summaries in a {@link Success}. On access validation failure, returns a
 * {@link Failure} describing why requests cannot be listed. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function listAllValidForDisbursement
 * @param {User} user - User attempting to list approved OBR requests for disbursement.
 * @returns {Promise<Result<Array<ObrRequestSummaryType>>>} A result wrapper containing approved OBR request summaries
 *                                                          on success, or a failure result on error.
 *
 * @remarks
 * - Requires disbursement write access from the user.
 * - Only requests whose computed approval status is approved are returned.
 * - Each summary includes request metadata, request item count, and computed approval status.
 */
export async function listAllValidForDisbursement(user: User): Promise<Result<Array<ObrRequestSummaryType>>> {
  try {
    const validate = await isWriterUserValidForDisbursement(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to list requests",
        { userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const all = await _getAllObrRequestAsSummaries(
      sql`EXISTS (
          SELECT 1 FROM ${obrItems}
          WHERE ${obrItems.requestId} = ${obrRequests.id}
          AND ${obrItems.disbursementRefId} IS NULL
        )`,
    );

    const filtered: ObrRequestSummaryType[] = all
      .filter(i => getSummaryOfStates(i.approvers) === "approved")
      .map(i => ({
        id: i.id,
        type: i.type,
        requestNumber: i.requestNumber,
        payee: i.payee,
        officeAddress: i.officeAddress,
        obrNumber: i.obrNumber,
        prNumber: i.prNumber,
        requestItemsCount: i.requestItemsCount,
        approvalStatus: getSummaryOfStates(i.approvers),
      }));

    return new Success(filtered);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to list requests", { userId: user.id }, e);
  }
}

/**
 * Retrieves all approved OBR request summaries available for OBR item creation.
 *
 * @description
 * Validates that the user has OBR management permissions, then fetches OBR requests with their item counts and
 * approver states. The results are filtered to include only fully approved requests that do not yet have any
 * OBR items associated with them, and mapped into request summary objects.
 *
 * On success, wraps the approved request summaries in a {@link Success}. On access validation failure, returns a
 * {@link Failure} describing why requests cannot be listed. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function listAllValidForObrCreate
 * @param {User} user - User attempting to list OBR requests for OBR item creation.
 * @returns {Promise<Result<Array<ObrRequestSummaryType>>>} A result wrapper containing approved OBR request summaries
 *                                                          on success, or a failure result on error.
 *
 * @remarks
 * - Requires OBR management access from the user.
 * - Only requests whose computed approval status is approved are returned.
 * - Only requests that do not yet have any OBR items are included.
 * - Each summary includes request metadata, request item count, and computed approval status.
 */
export async function listAllValidForObrCreate(user: User) {
  try {
    const validate = await isUserValidForObrManagement(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to list requests",
        { userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const all = await _getAllObrRequestAsSummaries(
      sql`NOT EXISTS (
          SELECT 1 FROM ${obrItems}
          WHERE ${obrItems.requestId} = ${obrRequests.id}
        )`,
    );

    const filtered: ObrRequestSummaryType[] = all
      .filter(i => getSummaryOfStates(i.approvers) === "approved")
      .map(i => ({
        id: i.id,
        type: i.type,
        requestNumber: i.requestNumber,
        payee: i.payee,
        officeAddress: i.officeAddress,
        obrNumber: i.obrNumber,
        prNumber: i.prNumber,
        requestItemsCount: i.requestItemsCount,
        approvalStatus: getSummaryOfStates(i.approvers),
      }));

    return new Success(filtered);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to list requests", { userId: user.id }, e);
  }
}

/**
 * Lists all approved OBR requests that are eligible for OBR main data creation.
 *
 * @description
 * Returns approved OBR requests that do not yet have any associated {@link obrMainData} records. Access checks
 * are handled at the API layer; no permission validation is performed here.
 *
 * On success, wraps the filtered request summaries in a {@link Success}. On unexpected failure, wraps the error
 * in a fatal {@link Failure}.
 *
 * @async
 * @function listAllValidForObrMainDataCreate
 * @returns {Promise<Result<Array<ObrRequestSummaryType>>>} A result wrapper containing approved OBR request summaries
 *                                                          on success, or a failure result on error.
 *
 * @remarks
 * - Only fully approved requests (all approvers signed) are returned.
 * - Requests that already have OBR main data records are excluded.
 */
export async function listAllValidForObrMainDataCreate(): Promise<Result<ObrRequestSummaryType[]>> {
  try {
    const all = await _getAllObrRequestAsSummaries(
      sql`NOT EXISTS (
          SELECT 1 FROM ${obrMainData}
          WHERE ${obrMainData.requestSourceId} = ${obrRequests.id}
        )`,
    );

    const filtered: ObrRequestSummaryType[] = all
      .filter(i => getSummaryOfStates(i.approvers) === "approved")
      .map(i => ({
        id: i.id,
        type: i.type,
        requestNumber: i.requestNumber,
        payee: i.payee,
        officeAddress: i.officeAddress,
        obrNumber: i.obrNumber,
        prNumber: i.prNumber,
        requestItemsCount: i.requestItemsCount,
        approvalStatus: getSummaryOfStates(i.approvers),
      }));

    return new Success(filtered);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to list requests for OBR main data creation.", {}, e);
  }
}

/**
 * Retrieves a detailed OBR request by its identifier for the given user.
 *
 * @description
 * Validates that the user is allowed to read OBR request information, optionally applies office-level access limits,
 * then fetches the request with its line items and approver states. Related responsibility centers, expense codes,
 * users, approver positions, and originating office details are resolved and mapped into a complete request object.
 *
 * On success, wraps the mapped OBR request in a {@link Success}. On access validation failure, returns a
 * {@link Failure} using the validation error. If the request cannot be found, returns a resource-not-found
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function getObrRequestById
 * @param {string} requestId - Identifier of the OBR request to retrieve.
 * @param {User} user - User attempting to read the OBR request.
 * @returns {Promise<Result<ObrRequestType>>} A result wrapper containing the detailed OBR request on success, or a
 *                                            failure result on error.
 *
 * @remarks
 * - Access is validated before querying request details.
 * - Users with office-limited access can only retrieve requests from their own office.
 * - The returned request includes publisher, originating office, request items, and approver/signing details.
 */
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

    const result: ObrRequestType | null = await _getObrRequestById(requestId, whereQuery);
    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId });
    }

    return new Success(result);
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
 * Creates disbursement vouchers for an approved OBR request.
 *
 * @description
 * Validates that the actor is allowed to create disbursement vouchers, verifies all requested signers are qualified,
 * ensures the target OBR request exists and is fully approved, resolves the approved office-head signer, validates the
 * referenced request items, and creates the voucher records in a transaction. The inserted records are then mapped into
 * disbursement voucher objects with responsibility-center details, signer information, and computed tax breakdowns.
 *
 * On success, wraps the created disbursement vouchers in a {@link Success}. On access, signer, request, approval, or
 * item validation failure, returns a {@link Failure} describing why the vouchers could not be created. On unexpected
 * failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createDisbursementVoucher
 * @param {string} obrRequestId - Identifier of the approved OBR request to create vouchers for.
 * @param {Array<CreateDisbursementVoucherPayload>} payload - Voucher creation payloads, one per target request item.
 * @param {User} actor - User attempting to create the disbursement vouchers.
 * @returns {Promise<Result<ObrDisbursementVoucher[]>>} A result wrapper containing the created disbursement vouchers on
 *                                                      success, or a failure result on error.
 *
 * @remarks
 * - Requires disbursement write access from the actor.
 * - All accountant, treasurer, and mayor signers must be valid disbursement signers.
 * - The source OBR request must already be fully approved.
 * - Each payload item must reference an existing request item from the source OBR request.
 * - Tax breakdowns are computed from the saved voucher values before returning the response.
 */
export async function createDisbursementVoucher(obrRequestId: string, payload: Array<CreateDisbursementVoucherPayload>, actor: User): Promise<Result<ObrDisbursementVoucher[]>> {
  try {
    // Validate the user accessing.
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to get the object you requested.",
        { actorId: actor.id, obrRequestId, payload },
        validate.stack ? validate.stack : undefined,
      );
    }

    // Validate the signers
    const signersToValidate = new Set<string>();
    for (const item of payload) {
      signersToValidate.add(item.accountantId);
      signersToValidate.add(item.mayorId);
      signersToValidate.add(item.treasurerId);
    }

    const all = await Promise.all(
      [...signersToValidate].map(s => tryGetValidSignerForDisbursement(s)),
    );
    if (all.some(s => s === null)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "One or more users are not qualified.",
        { obrRequestId, payload, actor: actor.id },
      );
    }

    const signers = new Map<string, { id: string; name: string; positionName: string; }>(
      all.map(s => [s!.id, s!]),
    );

    // Validate if the entry exists
    const [result] = await db
      .select({
        id: obrRequests.id,
        requestNumber: obrRequests.requestNumber,
        payee: obrRequests.payee,
        officeAddress: obrRequests.officeAddress,
        prNumber: obrRequests.prNumber,
        requestItems: sql<({ id: string, particulars: string, amount: string, responsibilityCenterId: string })[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ${obrRequestItems.id},
                'particulars', ${obrRequestItems.particulars},
                'amount', ${obrRequestItems.amount},
                'responsibilityCenterId', ${obrRequestItems.responsibilityCenterId}
              )
            ),
            '[]'::json
          )
          FROM ${obrRequestItems}
          WHERE ${obrRequestItems.requestId} = ${obrRequestId}
        )`,
        approvers: sql<({ actorUserId: Optional<string>; status: ApprovalState })[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'actorUserId', ${obrRequestApprovers.actedUserId},
                'status', ${obrRequestApprovers.status}
              )
            ),
            '[]'::json
          )
          FROM ${obrRequestApprovers}
          WHERE ${obrRequestApprovers.requestId} = ${obrRequestId}
        )`,
      })
      .from(obrRequests)
      .where(eq(obrRequests.id, obrRequestId));
    if (!result) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such request found.",
        { obrRequestId, payload, userId: actor.id },
      );
    }

    // Find the head user
    const headUserList = result.approvers
      .filter(u => u.status === "approved")
      .map(u => u.actorUserId as string);
    const headUser = await findOfficeHead(headUserList);
    if (!headUser) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No such office head found on this request. This may be an error.",
        { obrRequestId, payload, userId: actor.id, requestObject: result },
      );
    }

    // Validate if it's approved
    if (getSummaryOfStates(result.approvers) !== "approved") {
      return new Failure(
        ErrorCodes.Fatal,
        "This entry is not approved.",
        { obrRequestId, payload, userId: actor.id },
      );
    }

    // Map request items
    const requestItems = new Map<string, { id: string, particulars: string, amount: string, responsibilityCenterId: string }>(
      result.requestItems.map(i => [i.id, i]),
    );

    // Map out responsibility centers
    const allRcSet = new Set<string>(
      result.requestItems.map(i => i.responsibilityCenterId),
    );
    const allRc = await db
      .select({ id: officeCodes.id, aa: officeCodes.aa })
      .from(officeCodes)
      .where(inArray(officeCodes.id, [...allRcSet]));

    const responsibilityCenters = new Map<string, { id: string; aa: string; }>(
      allRc.map(rc => [rc.id, rc]),
    );

    // Validate if the request items are valid
    for (const item of payload) {
      if (!requestItems.has(item.targetItemId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "One or more request items are not valid.",
          { obrRequestId, payload, actorId: actor.id },
        );
      }
    }

    // Look up obrItems by requestItemId — each must exist and have no disbursement linked yet
    const targetItemIds = payload.map(p => p.targetItemId);
    const existingObrItems = await db
      .select({ id: obrItems.id, requestItemId: obrItems.requestItemId })
      .from(obrItems)
      .where(
        and(
          inArray(obrItems.requestItemId, targetItemIds),
          isNull(obrItems.disbursementRefId),
        ),
      );
    const obrItemsByRequestItemId = new Map<string, string>(
      existingObrItems.map(i => [i.requestItemId, i.id]),
    );
    for (const item of payload) {
      if (!obrItemsByRequestItemId.has(item.targetItemId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "One or more request items do not have an existing OBR item or are already linked to a disbursement.",
          { obrRequestId, payload, actorId: actor.id },
        );
      }
    }

    // Fund Types
    const allFundTypeIds = new Set<string>(
      ...payload.flatMap(x => {
        if (validatorUtilities.isNotEmpty(x.fundTypeId)) return [x.fundTypeId];
        return [];
      }),
    );
    const allFundTypes = await db
      .select({ id: fundTypes.id, name: fundTypes.name, description: fundTypes.description })
      .from(fundTypes)
      .where(inArray(fundTypes.id, [...allFundTypeIds]));
    const allFt = new Map<string, { id: string; name: string; description: Optional<string> }>(
      allFundTypes.map(f => [f.id, f]),
    );

    // Create the disbursement
    const data = await db.transaction(async tx => {
      const items = payload.map((i, idx) => ({
        disbursementVoucherNumber: result.requestNumber + (result.requestItems.length > 1 ? "-" + (idx + 1) : ""),
        payee: result.payee,
        address: result.officeAddress,
        particulars: requestItems.get(i.targetItemId)!.particulars,
        grossAmount: casts.castToDecimal(requestItems.get(i.targetItemId)!.amount),
        responsibilityCenterId: requestItems.get(i.targetItemId)!.responsibilityCenterId,
        headUserId: headUser.id,
        headUserName: headUser.name,
        headUserPositionName: headUser.positionName,
        accountantId: signers.get(i.accountantId)!.id,
        accountantName: signers.get(i.accountantId)!.name,
        accountantPositionName: signers.get(i.accountantId)!.positionName,
        treasurerId: signers.get(i.treasurerId)!.id,
        treasurerName: signers.get(i.treasurerId)!.name,
        treasurerPositionName: signers.get(i.treasurerId)!.positionName,
        mayorId: signers.get(i.mayorId)!.id,
        mayorName: signers.get(i.mayorId)!.name,
        mayorPositionName: signers.get(i.mayorId)!.positionName,
        disbursedBy: actor.id,
        requestId: result.id,
        requestItemId: i.targetItemId,

        // Optional values
        ...(validatorUtilities.isNotEmpty(result.prNumber) ? { prNumber: result.prNumber } : {}),
        ...(validatorUtilities.isNumber(i.vatableAmount) ? { vatableAmount: casts.castToDecimal(i.vatableAmount!) } : {}),
        ...(validatorUtilities.isNotEmpty(i.taxType) ? { taxType: i.taxType as TaxType } : {}),
        ...(validatorUtilities.isNotEmpty(i.status) ? { status: i.status as DisbursementStatus } : {}),
        ...(validatorUtilities.isNotEmpty(i.fundTypeId) ? { fundTypeId: i.fundTypeId } : {}),
      }));

      const inserted = await tx
        .insert(obrDisbursementVouchers)
        .values(items)
        .returning();

      // Link each obrItem to its newly created disbursement voucher
      for (const v of inserted) {
        const obrItemId = obrItemsByRequestItemId.get(v.requestItemId)!;
        await tx
          .update(obrItems)
          .set({ disbursementRefId: v.id })
          .where(eq(obrItems.id, obrItemId));
      }

      return inserted;
    });

    return new Success(
      data.map(d => ({
        id: d.id,
        disbursementVoucherNumber: d.disbursementVoucherNumber,
        createdAt: d.createdAt,
        payee: d.payee,
        address: d.address,
        particulars: d.particulars,
        grossAmount: validatorUtilities.isNotEmpty(d.grossAmount) ? d.grossAmount! : null,
        vatableAmount: validatorUtilities.isNotEmpty(d.vatableAmount) ? d.vatableAmount! : null,
        taxType: d.taxType ?? null,
        status: d.status ?? null,
        responsibilityCenter: {
          id: responsibilityCenters.get(d.responsibilityCenterId)!.id,
          aa: responsibilityCenters.get(d.responsibilityCenterId)!.aa,
        },
        signers: {
          accountant: {
            id: d.accountantId,
            name: d.accountantName,
            position: d.accountantPositionName,
          },
          treasurer: {
            id: d.treasurerId,
            name: d.treasurerName,
            position: d.treasurerPositionName,
          },
          mayor: {
            id: d.mayorId,
            name: d.mayorName,
            position: d.mayorPositionName,
          },
          headOfOffice: {
            id: d.headUserId,
            name: d.headUserName,
            position: d.headUserPositionName,
          },
        },
        taxBreakdown: createTaxBreakdown(
          validatorUtilities.isNotEmpty(d.vatableAmount) ? d.vatableAmount! : null,
          d.taxType ?? null,
        ),
        fundType: validatorUtilities.isNotEmpty(d.fundTypeId)
          ? allFt.get(d.fundTypeId!)
          : null,
        prNumber: d.prNumber,
        hasElecData: false,
      } satisfies ObrDisbursementVoucher)),
    );
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to create a disbursement voucher.",
      { obrRequestId, payload, actorId: actor.id },
      e,
    );
  }
}

/**
 * Updates an existing OBR disbursement voucher.
 *
 * @description
 * Validates that the actor is allowed to update disbursement voucher data, verifies that the target voucher exists,
 * builds an update payload from supported fields, optionally validates the referenced fund type, then persists the
 * changes. The updated record is mapped into a complete disbursement voucher object with responsibility-center details,
 * signer information, fund type data, status, PR number, and computed tax breakdown.
 *
 * On success, wraps the updated disbursement voucher in a {@link Success}. On access, lookup, payload, or fund-type
 * validation failure, returns a {@link Failure} describing why the voucher could not be updated. On unexpected failure,
 * wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateDisbursementVoucher
 * @param {string} id - Identifier of the disbursement voucher to update.
 * @param {UpdateDisbursementVoucherPayload} payload - Updated disbursement voucher fields to apply.
 * @param {User} actor - User attempting to update the disbursement voucher.
 * @returns {Promise<Result<ObrDisbursementVoucher>>} A result wrapper containing the updated disbursement voucher on
 *                                                    success, or a failure result on error.
 *
 * @remarks
 * - Requires disbursement write access from the actor.
 * - At least one supported updatable field must be present.
 * - Referenced fund types are validated before being assigned.
 * - Tax breakdown is recomputed from the updated voucher values before returning the response.
 */
export async function updateDisbursementVoucher(id: string, payload: UpdateDisbursementVoucherPayload, actor: User): Promise<Result<ObrDisbursementVoucher>> {
  try {
    // Validate the user accessing.
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to update the object you requested.",
        { actorId: actor.id, id, payload },
        validate.stack ? validate.stack : undefined,
      );
    }

    const [ref] = await db
      .select({
        id: obrDisbursementVouchers.id,
        requestId: obrDisbursementVouchers.requestId,

        responsibilityCenterId: officeCodes.id,
        responsibilityCenterAA: officeCodes.aa,

        fundTypeId: fundTypes.id,
        fundTypeName: fundTypes.name,
        fundTypeDescription: fundTypes.description,

        disbursedById: user.id,
        disbursedByName: user.name,
      })
      .from(obrDisbursementVouchers)
      .innerJoin(
        officeCodes,
        eq(officeCodes.id, obrDisbursementVouchers.responsibilityCenterId),
      )
      .leftJoin(
        fundTypes,
        eq(fundTypes.id, obrDisbursementVouchers.fundTypeId),
      )
      .innerJoin(
        user,
        eq(user.id, obrDisbursementVouchers.disbursedBy),
      )
      .where(eq(obrDisbursementVouchers.id, id))
      .limit(1);
    if (!ref) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such disbursement voucher found.",
        { id, payload, userId: actor.id },
      );
    }

    // Create payload for updating
    const updatePayload = {
      ...(validatorUtilities.isNumber(payload.vatableAmount) ? { vatableAmount: casts.castToDecimal(payload.vatableAmount!) } : {}),
      ...(validatorUtilities.isNotEmpty(payload.taxType) ? { taxType: payload.taxType as TaxType } : {}),
      ...(validatorUtilities.isNotEmpty(payload.fundTypeId) ? { fundTypeId: payload.fundTypeId } : {}),
      ...(validatorUtilities.isNotEmpty(payload.status) ? { status: payload.status } : {}),
    };
    if (Object.keys(updatePayload).length === 0 && !validatorUtilities.isNotEmpty(payload.obrItemId)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No updatable payload found.",
        { actorId: actor.id, payload, id },
      );
    }

    // Check if the fund type exists
    let fundType: Optional<{ id: string; name: string; description: Optional<string> }> = null;
    if (updatePayload.fundTypeId) {
      const [fundTypeResult] = await db
        .select({
          id: fundTypes.id,
          name: fundTypes.name,
          description: fundTypes.description,
        })
        .from(fundTypes)
        .where(eq(fundTypes.id, updatePayload.fundTypeId))
        .limit(1);
      if (!fundTypeResult) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "No such fund type found.",
          { actorId: actor.id, payload, id },
        );
      }

      fundType = fundTypeResult;
    }

    // Validate and prepare obrItem re-linking when obrItemId is provided
    let newObrItemId: string | null = null;
    if (validatorUtilities.isNotEmpty(payload.obrItemId)) {
      const [newObrItem] = await db
        .select({ id: obrItems.id, requestId: obrItems.requestId, disbursementRefId: obrItems.disbursementRefId })
        .from(obrItems)
        .where(eq(obrItems.id, payload.obrItemId!))
        .limit(1);
      if (!newObrItem) {
        return new Failure(
          ErrorCodes.ResourceNotFound,
          "No such OBR item found.",
          { actorId: actor.id, payload, id },
        );
      }
      if (newObrItem.requestId !== ref.requestId) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "The specified OBR item does not belong to the same request as this disbursement voucher.",
          { actorId: actor.id, payload, id },
        );
      }
      if (validatorUtilities.isNotEmpty(newObrItem.disbursementRefId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "The specified OBR item is already linked to a disbursement voucher.",
          { actorId: actor.id, payload, id },
        );
      }
      newObrItemId = newObrItem.id;
    }

    const [elecData] = await db
      .select({ id: obrDisbursementElectronic.id })
      .from(obrDisbursementElectronic)
      .where(eq(obrDisbursementElectronic.voucherId, ref.id))
      .limit(1);

    const [result] = await db.transaction(async tx => {
      if (newObrItemId !== null) {
        // Unlink whichever obrItem currently points to this voucher
        await tx
          .update(obrItems)
          .set({ disbursementRefId: null })
          .where(eq(obrItems.disbursementRefId, ref.id));

        // Link the new obrItem
        await tx
          .update(obrItems)
          .set({ disbursementRefId: ref.id })
          .where(eq(obrItems.id, newObrItemId));
      }

      return tx
        .update(obrDisbursementVouchers)
        .set({
          ...updatePayload,
          ...(validatorUtilities.isExisty(fundType) ? { fundTypeId: fundType!.id } : {}),
        })
        .where(eq(obrDisbursementVouchers.id, ref.id))
        .returning();
    });

    return new Success({
      id: result.id,
      disbursementVoucherNumber: result.disbursementVoucherNumber,
      createdAt: result.createdAt,
      payee: result.payee,
      address: result.address,
      particulars: result.particulars,
      grossAmount: validatorUtilities.isNotEmpty(result.grossAmount) ? result.grossAmount! : null,
      vatableAmount: validatorUtilities.isNotEmpty(result.vatableAmount) ? result.vatableAmount! : null,
      taxType: result.taxType ?? null,
      taxBreakdown: createTaxBreakdown(
        validatorUtilities.isNotEmpty(result.vatableAmount) ? result.vatableAmount! : null,
        result.taxType ?? null,
      ),
      responsibilityCenter: {
        id: ref.responsibilityCenterId,
        aa: ref.responsibilityCenterAA,
      },
      signers: {
        accountant: {
          id: result.accountantId,
          name: result.accountantName,
          position: result.accountantPositionName,
        },
        treasurer: {
          id: result.treasurerId,
          name: result.treasurerName,
          position: result.treasurerPositionName,
        },
        mayor: {
          id: result.mayorId,
          name: result.mayorName,
          position: result.mayorPositionName,
        },
        headOfOffice: {
          id: result.headUserId,
          name: result.headUserName,
          position: result.headUserPositionName,
        },
      },
      fundType: validatorUtilities.isNotEmpty(result.fundTypeId)
        ? (result.fundTypeId === ref.fundTypeId
          ? { id: ref.fundTypeId!, name: ref.fundTypeName!, description: ref.fundTypeDescription! }
          : (fundType ? { id: fundType.id, name: fundType.name, description: fundType.description } : null))
        : null,
      status: validatorUtilities.isNotEmpty(result.status) ? result.status : null,
      prNumber: validatorUtilities.isNotEmpty(result.prNumber) ? result.prNumber : null,
      hasElecData: validatorUtilities.isExisty(elecData),
    } satisfies ObrDisbursementVoucher);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to update the disbursement voucher.",
      { id, payload, actorId: actor.id },
      e,
    );
  }
}

export async function deleteDisbursementVoucher(id: string, actor: User): Promise<Result<void>> {
  try {
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to delete the object you requested.",
        { actorId: actor.id, id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const [ref] = await db
      .select({ id: obrDisbursementVouchers.id })
      .from(obrDisbursementVouchers)
      .where(eq(obrDisbursementVouchers.id, id))
      .limit(1);
    if (!ref) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such disbursement voucher found.",
        { id, userId: actor.id },
      );
    }

    await db.transaction(async tx => {
      // Unlink any obrItems pointing to this voucher before deleting
      await tx
        .update(obrItems)
        .set({ disbursementRefId: null })
        .where(eq(obrItems.disbursementRefId, id));

      await tx
        .delete(obrDisbursementVouchers)
        .where(eq(obrDisbursementVouchers.id, id));
    });

    return new Success(undefined);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to delete the disbursement voucher.",
      { id, actorId: actor.id },
      e,
    );
  }
}

/**
 * Retrieves all OBR disbursement vouchers.
 *
 * @description
 * Fetches all disbursement voucher records with their responsibility-center, fund-type, disburser, and signer details,
 * then maps each row into the application disbursement voucher shape. Monetary decimal values are converted to numbers,
 * optional fields are normalized to `null`, and tax breakdowns are computed for each voucher.
 *
 * On success, wraps the disbursement voucher list in a {@link Success}. On unexpected failure, wraps the error in a
 * fatal {@link Failure}.
 *
 * @async
 * @function getAllDisbursementVouchers
 * @returns {Promise<Result<Array<ObrDisbursementVoucher>>>} A result wrapper containing all disbursement vouchers on
 *                                                           success, or a failure result on error.
 *
 * @remarks
 * - Includes responsibility-center information for each voucher.
 * - Includes accountant, treasurer, mayor, and head-of-office signer details.
 * - Includes fund type information when assigned.
 * - Tax breakdowns are computed from each voucher's saved values.
 */
export async function getAllDisbursementVouchers(): Promise<Result<Array<ObrDisbursementVoucher>>> {
  try {
    const elecItems = await db
      .select({ voucherId: obrDisbursementElectronic.voucherId })
      .from(obrDisbursementElectronic);
    const allElecItems = new Set(elecItems.map(x => x.voucherId));

    const all = await db
      .select({
        id: obrDisbursementVouchers.id,
        disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
        payee: obrDisbursementVouchers.payee,
        address: obrDisbursementVouchers.address,
        particulars: obrDisbursementVouchers.particulars,
        prNumber: obrDisbursementVouchers.prNumber,
        grossAmount: obrDisbursementVouchers.grossAmount,
        vatableAmount: obrDisbursementVouchers.vatableAmount,
        taxType: obrDisbursementVouchers.taxType,
        status: obrDisbursementVouchers.status,

        responsibilityCenterId: officeCodes.id,
        responsibilityCenterAA: officeCodes.aa,

        headUserId: obrDisbursementVouchers.headUserId,
        headUserName: obrDisbursementVouchers.headUserName,
        headUserPositionName: obrDisbursementVouchers.headUserPositionName,

        accountantId: obrDisbursementVouchers.accountantId,
        accountantName: obrDisbursementVouchers.accountantName,
        accountantPositionName: obrDisbursementVouchers.accountantPositionName,

        treasurerId: obrDisbursementVouchers.treasurerId,
        treasurerName: obrDisbursementVouchers.treasurerName,
        treasurerPositionName: obrDisbursementVouchers.treasurerPositionName,

        mayorId: obrDisbursementVouchers.mayorId,
        mayorName: obrDisbursementVouchers.mayorName,
        mayorPositionName: obrDisbursementVouchers.mayorPositionName,

        fundTypeId: fundTypes.id,
        fundTypeName: fundTypes.name,
        fundTypeDescription: fundTypes.description,

        disbursedById: user.id,
        disbursedByName: user.name,
        createdAt: obrDisbursementVouchers.createdAt,
      })
      .from(obrDisbursementVouchers)
      .innerJoin(
        officeCodes,
        eq(officeCodes.id, obrDisbursementVouchers.responsibilityCenterId),
      )
      .leftJoin(
        fundTypes,
        eq(fundTypes.id, obrDisbursementVouchers.fundTypeId),
      )
      .innerJoin(
        user,
        eq(user.id, obrDisbursementVouchers.disbursedBy),
      );

    return new Success(all.map(ref => ({
      id: ref.id,
      disbursementVoucherNumber: ref.disbursementVoucherNumber,
      createdAt: ref.createdAt,
      payee: ref.payee,
      address: ref.address,
      particulars: ref.particulars,
      grossAmount: validatorUtilities.isNotEmpty(ref.grossAmount) ? ref.grossAmount! : null,
      vatableAmount: validatorUtilities.isNotEmpty(ref.vatableAmount) ? ref.vatableAmount! : null,
      taxType: ref.taxType ?? null,
      taxBreakdown: createTaxBreakdown(
        validatorUtilities.isNotEmpty(ref.vatableAmount) ? ref.vatableAmount! : null,
        ref.taxType ?? null,
      ),
      responsibilityCenter: {
        id: ref.responsibilityCenterId,
        aa: ref.responsibilityCenterAA,
      },
      signers: {
        accountant: {
          id: ref.accountantId,
          name: ref.accountantName,
          position: ref.accountantPositionName,
        },
        treasurer: {
          id: ref.treasurerId,
          name: ref.treasurerName,
          position: ref.treasurerPositionName,
        },
        mayor: {
          id: ref.mayorId,
          name: ref.mayorName,
          position: ref.mayorPositionName,
        },
        headOfOffice: {
          id: ref.headUserId,
          name: ref.headUserName,
          position: ref.headUserPositionName,
        },
      },
      fundType: validatorUtilities.isNotEmpty(ref.fundTypeId)
        ? { id: ref.fundTypeId!, name: ref.fundTypeName!, description: ref.fundTypeDescription! }
        : null,
      status: validatorUtilities.isNotEmpty(ref.status) ? ref.status : null,
      prNumber: validatorUtilities.isNotEmpty(ref.prNumber) ? ref.prNumber : null,
      hasElecData: allElecItems.has(ref.id),
    } satisfies ObrDisbursementVoucher)));
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to fetch disbursement items",
      {},
      e,
    );
  }
}

/**
 * Creates OBR item records from an approved and fully disbursed OBR request.
 *
 * @description
 * Validates that the user has disbursement write access, retrieves the target OBR request, verifies that the request is
 * fully approved, confirms that every request item has an associated disbursement voucher, resolves the approving office
 * head, and creates the corresponding OBR item and office-item records in a transaction.
 *
 * On success, wraps the created OBR items in a {@link Success}. On access, request lookup, approval-state, office-head,
 * or disbursement validation failure, returns a {@link Failure} describing why the items could not be created. On
 * unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createObrItem
 * @param {string} requestId - Identifier of the approved and disbursed OBR request to convert into OBR items.
 * @param {User} user - User attempting to create the OBR item records.
 * @returns {Promise<Result<ObrItem[]>>} A result wrapper containing the created OBR items on success, or a failure
 *                                       result on error.
 *
 * @remarks
 * - Requires disbursement write access from the user.
 * - The source OBR request must be fully approved.
 * - Every request item must already have a matching disbursement voucher.
 * - The approving office head is used as the requesting official for the created OBR items.
 * - OBR item and office-item records are created within a single transaction.
 */
export async function createObrItem(requestId: string, user: User): Promise<Result<ObrItem[]>> {
  try {
    const validate = await isUserValidForObrManagement(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to update the object you requested.",
        { userId: user.id, requestId },
        validate.stack ? validate.stack : undefined,
      );
    }

    // Get the obr request
    const request = await _getObrRequestById(
      requestId,
      [
        eq(obrRequests.id, requestId),
      ],
    );
    if (!request) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId });
    }

    // Validate if the request is actually approved.
    const stateSummary = getSummaryOfStates(
      request.approvers.map(a => ({ status: a.status as ApprovalState })),
    );
    if (stateSummary !== "approved") {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid request.", { requestId, stateSummary });
    }

    const officeHead = await findOfficeHead(
      request.approvers
        .filter(i => i.signer?.id)
        .map(i => i.signer!.id),
    );
    if (!officeHead) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No valid office head. This may be an error.",
        { reqId: request.id },
      );
    }

    const rcMap = new Map<string, { id: string; name: string }>(
      request.requestItems.map(i => [i.responsibilityCenter.id, i.responsibilityCenter]),
    );
    const exMap = new Map<string, ExpenseCodeObject>(
      request.requestItems.map(i => [i.expenseCode.id, i.expenseCode]),
    );

    // Create obr entries for them
    const transaction = await db.transaction(async tx => {
      // Create obr items first
      const items = await tx
        .insert(obrItems)
        .values(
          request.requestItems.map(i => ({
            payee: request.payee,
            address: request.officeAddress,
            particulars: i.particulars,
            requestingOfficialId: officeHead.id,
            publishedBy: user.id,
            requestId: request.id,
            requestItemId: i.id,
          })),
        )
        .returning();

      const itemMap = new Map<string, string>(
        items.map(i => [i.requestItemId, i.id]),
      );

      const officeItems = await tx
        .insert(obrOfficeItem)
        .values(
          request.requestItems.map(i => ({
            amount: casts.castToDecimal(i.amount),
            responsibilityCenterId: i.responsibilityCenter.id,
            expenseCodeId: i.expenseCode.id,
            itemId: itemMap.get(i.id)!,
          })),
        )
        .returning();

      const itemOfficeMap = new Map<string, ObrItemOfficeData>(
        officeItems.map(i => [i.itemId, {
          id: i.id,
          amount: i.amount,
          responsibilityCenter: rcMap.get(i.responsibilityCenterId)!,
          expenseCode: exMap.get(i.expenseCodeId)!,
        }]),
      );

      return items.map(i => ({
        id: i.id,
        obrRefNumber: request.requestNumber,
        dvRefNumber: null,
        date: i.createdAt,
        payee: i.payee,
        address: i.address,
        particulars: i.particulars,
        amounts: [
          itemOfficeMap.get(i.id)!,
        ],
        overallAmount: itemOfficeMap.get(i.id)!.amount,
        requestingOfficial: {
          id: officeHead.id,
          name: officeHead.name,
          position: officeHead.positionName,
        },
        publisher: {
          id: user.id,
          name: user.fullName,
          position: user.office.role.name,
        },
      } satisfies ObrItem));
    });

    return new Success(transaction);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to create OBR item.",
      { requestId, userId: user.id },
      e,
    );
  }
}

/**
 * Retrieves all created OBR items.
 *
 * @description
 * Fetches OBR item records, resolves related requesting official and publisher users, loads associated office-item
 * amount entries with responsibility-center and expense-code details, groups those entries by OBR item, and computes
 * each item's overall amount.
 *
 * On success, wraps the mapped OBR items in a {@link Success}. If no OBR items exist, returns an empty success list.
 * On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function getObrItems
 * @returns {Promise<Result<ObrItem[]>>} A result wrapper containing OBR items on success, or a failure result on error.
 *
 * @remarks
 * - Each returned item includes its amount breakdown entries.
 * - Overall amounts are computed from the item's associated office-item amounts.
 * - Missing user details are represented with fallback `"Unknown"` values.
 */
export async function getObrItems(): Promise<Result<ObrItem[]>> {
  try {
    const items = await db
      .select({
        id: obrItems.id,
        obrRefNumber: obrRequests.requestNumber,
        dvRefNumber: obrDisbursementVouchers.disbursementVoucherNumber,
        date: obrItems.createdAt,
        payee: obrItems.payee,
        address: obrItems.address,
        particulars: obrItems.particulars,
        requestingOfficialId: obrItems.requestingOfficialId,
        publishedBy: obrItems.publishedBy,
      })
      .from(obrItems)
      .innerJoin(obrRequests, eq(obrRequests.id, obrItems.requestId))
      .leftJoin(
        obrDisbursementVouchers,
        eq(obrDisbursementVouchers.id, obrItems.disbursementRefId),
      );

    if (items.length === 0) return new Success([]);

    const userIds = Array.from(
      new Set(items.flatMap(i => [i.requestingOfficialId, i.publishedBy])),
    );

    const [users, officeItems] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          positionName: officePosition.name,
        })
        .from(user)
        .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
        .where(inArray(user.id, userIds)),

      db
        .select({
          id: obrOfficeItem.id,
          itemId: obrOfficeItem.itemId,
          amount: obrOfficeItem.amount,
          rcId: officeCodes.id,
          rcName: officeCodes.aa,
          ecId: expenseClasses.id,
          ecName: expenseClasses.accountName,
          ecFpp: expenseClasses.fpp,
          ecAccountCode: expenseClasses.accountCode,
        })
        .from(obrOfficeItem)
        .innerJoin(officeCodes, eq(officeCodes.id, obrOfficeItem.responsibilityCenterId))
        .innerJoin(expenseClasses, eq(expenseClasses.id, obrOfficeItem.expenseCodeId))
        .where(inArray(obrOfficeItem.itemId, items.map(i => i.id))),
    ]);

    const userMap = new Map(users.map(u => [u.id, u]));

    const officeItemsByItem = new Map<string, ObrItemOfficeData[]>();
    for (const oi of officeItems) {
      const existing = officeItemsByItem.get(oi.itemId) ?? [];
      existing.push({
        id: oi.id,
        amount: oi.amount,
        responsibilityCenter: { id: oi.rcId, name: oi.rcName },
        expenseCode: {
          id: oi.ecId,
          name: oi.ecName,
          fpp: oi.ecFpp,
          accountCode: oi.ecAccountCode,
        },
      });
      officeItemsByItem.set(oi.itemId, existing);
    }

    const overallAmountByItem = new Map<string, string>();
    for (const [itemId, ois] of officeItemsByItem) {
      const sum = ois.reduce((acc, oi) => acc.plus(new Decimal(oi.amount)), new Decimal(0));
      overallAmountByItem.set(itemId, sum.toFixed(2));
    }

    return new Success(items.map(i => ({
      id: i.id,
      obrRefNumber: i.obrRefNumber,
      dvRefNumber: i.dvRefNumber,
      date: i.date,
      payee: i.payee,
      address: i.address,
      particulars: i.particulars,
      amounts: officeItemsByItem.get(i.id) ?? [],
      overallAmount: overallAmountByItem.get(i.id) ?? "0.00",
      requestingOfficial: {
        id: i.requestingOfficialId,
        name: userMap.get(i.requestingOfficialId)?.name ?? "Unknown",
        position: userMap.get(i.requestingOfficialId)?.positionName ?? "Unknown",
      },
      publisher: {
        id: i.publishedBy,
        name: userMap.get(i.publishedBy)?.name ?? "Unknown",
        position: userMap.get(i.publishedBy)?.positionName ?? "Unknown",
      },
    } satisfies ObrItem)));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch list of OBR items", {}, e);
  }
}

/**
 * Creates OBR main data records from an approved OBR request.
 *
 * @description
 * Creates a standalone OBR main data record directly from the supplied payload without requiring an OBR request.
 * Validates the responsibility center, expense code, optional SAAOB entry, and any AIP references before inserting.
 * The `alobs` code is computed from the expense class, current UTC+8 year/month, and the provided OBR number.
 * When `requestId` is provided the record is linked to that request (existence check only, no approval required),
 * and the request's `obrNumber` (and `prNumber` if provided) are propagated.
 *
 * On success, wraps a single-element array of {@link ObrMainDataItem} in a {@link Success}. On validation failure,
 * returns a descriptive {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createObrMainData
 * @param {CreateObrMainDataPayload} payload - Creation payload with all required fields and optional linkage/references.
 * @param {User} author - User creating the OBR main data record (stored as author).
 * @returns {Promise<Result<ObrMainDataItem[]>>} A result wrapper containing the created OBR main data item on success,
 *                                               or a failure result on error.
 *
 * @remarks
 * - `alobs` is derived from: expenseClass-YY-MM-obrNumber (all joined with "-").
 * - AIP references, when provided, are validated and inserted linked to the created record.
 * - If `requestId` is supplied, the linked request's OBR/PR numbers are updated to match.
 */
export async function createObrMainData(
  payload: CreateObrMainDataPayload,
  author: User,
): Promise<Result<ObrMainDataItem[]>> {
  try {
    // Validate responsibility center exists
    const [rcRow] = await db
      .select({ id: officeCodes.id })
      .from(officeCodes)
      .where(eq(officeCodes.id, payload.responsibilityCenterId))
      .limit(1);
    if (!rcRow) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid responsibility center.", { responsibilityCenterId: payload.responsibilityCenterId });
    }

    // Validate expense code exists and resolve its class for alobs
    const [ecRow] = await db
      .select({ id: expenseClasses.id, class: expenseClasses.class })
      .from(expenseClasses)
      .where(eq(expenseClasses.id, payload.expenseCodeId))
      .limit(1);
    if (!ecRow) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid expense code.", { expenseCodeId: payload.expenseCodeId });
    }

    // Validate saaobId if provided
    if (validatorUtilities.isUuid(payload.saaobId)) {
      const [saaobRow] = await db
        .select({ id: saaobEntries.id })
        .from(saaobEntries)
        .where(eq(saaobEntries.id, payload.saaobId!))
        .limit(1);
      if (!saaobRow) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid SAAOB entry.", { saaobId: payload.saaobId });
      }
    }

    // Validate and resolve AIP references if provided
    const aipRefMap = new Map<string, { id: string; code: string; description: string }>();
    if (payload.aipReferences && payload.aipReferences.length > 0) {
      const aipIds = payload.aipReferences.map(r => r.aipId);
      const refs = await db
        .select({ id: aipReferences.id, code: aipReferences.aipReferenceCode, description: aipReferences.description })
        .from(aipReferences)
        .where(inArray(aipReferences.id, aipIds));
      for (const ref of refs) {
        aipRefMap.set(ref.id, { id: ref.id, code: ref.code, description: ref.description });
      }
      for (const aip of payload.aipReferences) {
        if (!aipRefMap.has(aip.aipId)) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "One or more AIP references are not valid.",
            { aipId: aip.aipId },
          );
        }
      }
    }

    // Validate requestId if provided (existence check only)
    if (validatorUtilities.isUuid(payload.requestId)) {
      const [requestRow] = await db
        .select({ id: obrRequests.id })
        .from(obrRequests)
        .where(eq(obrRequests.id, payload.requestId!))
        .limit(1);
      if (!requestRow) {
        return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId: payload.requestId });
      }
    }

    // Compute alobs from expense class + current UTC+8 date + obrNumber
    const now = DateTime.now().setZone("Asia/Manila");
    const yy = now.toFormat("yy");
    const mm = now.toFormat("MM");
    const alobs = [ecRow.class ?? "", yy, mm, payload.obrNumber].join("-");

    const [insertedId] = await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(obrMainData)
        .values({
          obrNumber: payload.obrNumber,
          alobs,
          payee: payload.payee ?? null,
          address: payload.address,
          particulars: payload.particulars,
          obligated: casts.castToDecimal(payload.amount),
          responsibilityCenterId: payload.responsibilityCenterId,
          expenseCodeId: payload.expenseCodeId,
          authorId: author.id,
          ...(validatorUtilities.isNotEmpty(payload.prNumber) ? { prNumber: payload.prNumber } : {}),
          ...(validatorUtilities.isNumber(payload.prAmount)
            ? { prAmount: casts.castToDecimal(payload.prAmount!) }
            : {}),
          ...(validatorUtilities.isUuid(payload.saaobId) ? { saaobId: payload.saaobId } : {}),
          ...(validatorUtilities.isUuid(payload.requestId) ? { requestSourceId: payload.requestId } : {}),
        })
        .returning({ id: obrMainData.id });

      if (payload.aipReferences && payload.aipReferences.length > 0) {
        await tx.insert(obrMainAipReferences).values(
          payload.aipReferences.map((aip, idx) => ({
            aipReferenceId: aip.aipId,
            aipReferenceCode: aipRefMap.get(aip.aipId)!.code,
            aipDescription: aipRefMap.get(aip.aipId)!.description,
            amount: casts.castToDecimal(aip.amount),
            index: idx,
            obrId: inserted.id,
          })),
        );
      }

      // If linked to a request, propagate OBR number (and PR number if provided)
      if (validatorUtilities.isUuid(payload.requestId)) {
        await tx
          .update(obrRequests)
          .set({
            obrNumber: payload.obrNumber,
            ...(validatorUtilities.isNotEmpty(payload.prNumber) ? { prNumber: payload.prNumber } : {}),
          })
          .where(eq(obrRequests.id, payload.requestId!));
      }

      return [inserted.id];
    });

    const mapped = await _fetchObrMainDataItems(eq(obrMainData.id, insertedId));
    return new Success(mapped);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to create OBR main data.",
      { payload, authorId: author.id },
      e,
    );
  }
}

/**
 * Retrieves all OBR main data records sorted by OBR number.
 *
 * @description
 * Fetches all {@link obrMainData} records with their linked responsibility centers, expense codes, publisher details,
 * AIP references, and computed disbursed amounts. Results are sorted in ascending order by OBR number.
 *
 * On success, wraps the mapped OBR main data list in a {@link Success}. On unexpected failure, wraps the error in a
 * fatal {@link Failure}.
 *
 * @async
 * @function getAllObrMainData
 * @returns {Promise<Result<ObrMainDataItem[]>>} A result wrapper containing all OBR main data items on success,
 *                                               or a failure result on error.
 */
export async function getAllObrMainData(): Promise<Result<ObrMainDataItem[]>> {
  try {
    const items = await _fetchObrMainDataItems();
    return new Success(items);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch OBR main data.", {}, e);
  }
}

/**
 * Updates an existing OBR main data record.
 *
 * @description
 * Validates that the target {@link obrMainData} record exists, then applies the provided field updates. When
 * `aipReferences` is supplied, the existing AIP reference entries for this record are replaced with the new set.
 * The updated record is returned in full mapped form.
 *
 * On success, wraps the updated {@link ObrMainDataItem} in a {@link Success}. On record lookup or AIP reference
 * validation failure, returns a descriptive {@link Failure}. If the payload contains no updatable fields, returns
 * a validation {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateObrMainData
 * @param {string} id - Identifier of the OBR main data record to update.
 * @param {UpdateObrMainDataPayload} payload - Fields to update; at least one must be present.
 * @param {User} actor - User performing the update (used for context in error reporting).
 * @returns {Promise<Result<ObrMainDataItem>>} A result wrapper containing the updated OBR main data item on success,
 *                                             or a failure result on error.
 *
 * @remarks
 * - Supported updatable fields: `obrNumber`, `prNumber`, `prAmount`, and `aipReferences`.
 * - When `aipReferences` is provided the existing references are deleted and replaced.
 * - At least one updatable scalar field or an AIP references replacement must be provided.
 */
export async function updateObrMainData(
  id: string,
  payload: UpdateObrMainDataPayload,
  actor: User,
): Promise<Result<ObrMainDataItem>> {
  try {
    const [existing] = await db
      .select({
        id: obrMainData.id,
        obrNumber: obrMainData.obrNumber,
        expenseCodeId: obrMainData.expenseCodeId,
        createdAt: obrMainData.createdAt,
      })
      .from(obrMainData)
      .where(eq(obrMainData.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such OBR main data record found.", { id });
    }

    // Build scalar update payload
    const updateFields: Partial<{
      obrNumber: string;
      prNumber: string;
      prAmount: string;
      saaobId: string | null;
      payee: string | null;
      address: string;
      responsibilityCenterId: string;
      expenseCodeId: string;
      particulars: string;
      obligated: string;
      alobs: string;
    }> = {};

    if (validatorUtilities.isNotEmpty(payload.obrNumber)) {
      updateFields.obrNumber = payload.obrNumber!;
    }
    if (validatorUtilities.isNotEmpty(payload.prNumber)) {
      updateFields.prNumber = payload.prNumber!;
    }
    if (validatorUtilities.isNumber(payload.prAmount)) {
      updateFields.prAmount = casts.castToDecimal(payload.prAmount!);
    }
    if ("saaobId" in payload) {
      updateFields.saaobId = payload.saaobId ?? null;
    }
    if ("payee" in payload) {
      updateFields.payee = validatorUtilities.isNotEmpty(payload.payee)
        ? payload.payee!
        : null;
    }
    if (validatorUtilities.isNotEmpty(payload.address)) {
      updateFields.address = payload.address!;
    }
    if (validatorUtilities.isNotEmpty(payload.particulars)) {
      updateFields.particulars = payload.particulars!;
    }
    if (validatorUtilities.isNumber(payload.amount)) {
      updateFields.obligated = casts.castToDecimal(payload.amount!);
    }

    // Validate and apply responsibility center if provided
    if (validatorUtilities.isUuid(payload.responsibilityCenterId)) {
      const [rcRow] = await db
        .select({ id: officeCodes.id })
        .from(officeCodes)
        .where(eq(officeCodes.id, payload.responsibilityCenterId!))
        .limit(1);
      if (!rcRow) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid responsibility center.", { id, responsibilityCenterId: payload.responsibilityCenterId });
      }
      updateFields.responsibilityCenterId = payload.responsibilityCenterId!;
    }

    // Validate and apply expense code if provided
    if (validatorUtilities.isUuid(payload.expenseCodeId)) {
      const [ecRow] = await db
        .select({ id: expenseClasses.id, class: expenseClasses.class })
        .from(expenseClasses)
        .where(eq(expenseClasses.id, payload.expenseCodeId!))
        .limit(1);
      if (!ecRow) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid expense code.", { id, expenseCodeId: payload.expenseCodeId });
      }
      updateFields.expenseCodeId = payload.expenseCodeId!;
    }

    // Recompute alobs if obrNumber or expenseCodeId is changing
    const isObrNumberChanging = validatorUtilities.isNotEmpty(payload.obrNumber);
    const isExpenseCodeChanging = validatorUtilities.isUuid(payload.expenseCodeId);
    if (isObrNumberChanging || isExpenseCodeChanging) {
      const effectiveObrNumber = updateFields.obrNumber ?? existing.obrNumber;
      const effectiveExpenseCodeId = updateFields.expenseCodeId ?? existing.expenseCodeId;

      const [ecRow] = await db
        .select({ class: expenseClasses.class })
        .from(expenseClasses)
        .where(eq(expenseClasses.id, effectiveExpenseCodeId))
        .limit(1);
      const expenseClass = ecRow?.class ?? "";

      const createdAt = DateTime.fromJSDate(existing.createdAt).setZone("Asia/Manila");
      updateFields.alobs = [expenseClass, createdAt.toFormat("yy"), createdAt.toFormat("MM"), effectiveObrNumber].join("-");
    }

    const hasScalarUpdates = Object.keys(updateFields).length > 0;
    const hasAipUpdates = Array.isArray(payload.aipReferences);

    if (!hasScalarUpdates && !hasAipUpdates) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No updatable fields provided.",
        { id, payload, actorId: actor.id },
      );
    }

    // Validate AIP references if provided
    const aipRefMap = new Map<string, { id: string; code: string; description: string }>();
    if (hasAipUpdates && payload.aipReferences!.length > 0) {
      const aipIds = payload.aipReferences!.map(r => r.aipId);
      const refs = await db
        .select({ id: aipReferences.id, code: aipReferences.aipReferenceCode, description: aipReferences.description })
        .from(aipReferences)
        .where(inArray(aipReferences.id, aipIds));
      for (const ref of refs) {
        aipRefMap.set(ref.id, { id: ref.id, code: ref.code, description: ref.description });
      }
      for (const aip of payload.aipReferences!) {
        if (!aipRefMap.has(aip.aipId)) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "One or more AIP references are not valid.",
            { id, aipId: aip.aipId },
          );
        }
      }
    }

    // Validate saaobId if provided
    if (validatorUtilities.isUuid(payload.saaobId)) {
      const [saaobRow] = await db
        .select({ id: saaobEntries.id })
        .from(saaobEntries)
        .where(eq(saaobEntries.id, payload.saaobId!))
        .limit(1);
      if (!saaobRow) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid SAAOB entry.", { id, saaobId: payload.saaobId });
      }
    }

    await db.transaction(async tx => {
      if (hasScalarUpdates) {
        await tx
          .update(obrMainData)
          .set(updateFields)
          .where(eq(obrMainData.id, id));
      }

      if (hasAipUpdates) {
        // Delete all existing AIP references then re-insert
        await tx
          .delete(obrMainAipReferences)
          .where(eq(obrMainAipReferences.obrId, id));

        if (payload.aipReferences!.length > 0) {
          await tx.insert(obrMainAipReferences).values(
            payload.aipReferences!.map((aip, idx) => ({
              aipReferenceId: aip.aipId,
              aipReferenceCode: aipRefMap.get(aip.aipId)!.code,
              aipDescription: aipRefMap.get(aip.aipId)!.description,
              amount: casts.castToDecimal(aip.amount),
              index: idx,
              obrId: id,
            })),
          );
        }
      }
    });

    const [updated] = await _fetchObrMainDataItems(eq(obrMainData.id, id));
    if (!updated) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve updated OBR main data.", { id });
    }

    return new Success(updated);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to update OBR main data.",
      { id, payload, actorId: actor.id },
      e,
    );
  }
}

export async function deleteObrMainData(
  id: string,
  actor: User,
): Promise<Result<void>> {
  try {
    const [existing] = await db
      .select({ id: obrMainData.id, requestSourceId: obrMainData.requestSourceId })
      .from(obrMainData)
      .where(eq(obrMainData.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such OBR main data record found.", { id });
    }

    await db.transaction(async tx => {
      await tx
        .delete(obrMainData)
        .where(eq(obrMainData.id, id));

      if (existing.requestSourceId) {
        await tx
          .update(obrRequests)
          .set({ obrNumber: null, prNumber: null })
          .where(eq(obrRequests.id, existing.requestSourceId));
      }
    });

    return new Success(undefined);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to delete OBR main data.",
      { id, actorId: actor.id },
      e,
    );
  }
}

/**
 * Searches OBR main data records by keyword across key descriptive and reference fields.
 *
 * @description
 * Performs a case-insensitive partial match against OBR main data payee, address, particulars,
 * OBR number, PR number, and alobs. No joins are required as all searchable fields exist on
 * the main data table. Returns a lightweight result shape optimised for search result lists.
 *
 * On success, wraps the matching records in a {@link Success}. If no matches are found,
 * returns an empty success list. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function searchObrItems
 * @param {string} query - Search keyword used for partial matching.
 * @returns {Promise<Result<ObrMainDataSearchResultItem[]>>} A result wrapper containing matching records on success,
 *                                                           or a failure result on error.
 */
export async function searchObrItems(query: string): Promise<Result<ObrMainDataSearchResultItem[]>> {
  try {
    const normalized = query.trim();
    if (!validatorUtilities.isNotEmpty(normalized)) {
      return new Success([]);
    }

    const wildcard = `%${normalized}%`;

    const items = await db
      .select({
        id: obrMainData.id,
        alobs: obrMainData.alobs,
        createdAt: obrMainData.createdAt,
        particulars: obrMainData.particulars,
        obrNumber: obrMainData.obrNumber,
        address: obrMainData.address,
        payee: obrMainData.payee,
        ecId: expenseClasses.id,
        ecAccountName: expenseClasses.accountName,
        ecAccountCode: expenseClasses.accountCode,
        ecSubClassification: expenseClasses.subClassification,
        officeId: office.id,
        officeName: office.name,
      })
      .from(obrMainData)
      .leftJoin(expenseClasses, eq(expenseClasses.id, obrMainData.expenseCodeId))
      .leftJoin(officeCodes, eq(officeCodes.id, obrMainData.responsibilityCenterId))
      .leftJoin(office, eq(office.id, officeCodes.officeId))
      .where(
        or(
          ilike(obrMainData.obrNumber, wildcard),
          ilike(obrMainData.prNumber, wildcard),
          ilike(obrMainData.particulars, wildcard),
          ilike(obrMainData.payee, wildcard),
          ilike(obrMainData.address, wildcard),
          ilike(obrMainData.alobs, wildcard),
        ),
      )
      .orderBy(asc(obrMainData.obrNumber));

    return new Success(
      items.map(i => ({
        id: i.id,
        alobs: i.alobs,
        date: DateTime.fromJSDate(i.createdAt).setZone("Asia/Manila").toISO()!,
        particulars: i.particulars,
        obrNumber: i.obrNumber,
        address: i.address,
        payee: i.payee,
        expenseClass: i.ecId ? {
          id: i.ecId,
          accountName: i.ecAccountName!,
          accountCode: i.ecAccountCode ?? null,
          subClassification: i.ecSubClassification ?? null,
        } : null,
        office: i.officeId ? { id: i.officeId, name: i.officeName! } : null,
      } satisfies ObrMainDataSearchResultItem)),
    );
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to search OBR main data", { query }, e);
  }
}

/**
 * Retrieves users who are valid approvers for a specific disbursement approval role.
 *
 * @description
 * Validates the requested disbursement approval permission filter, then fetches users whose assigned office position
 * includes that permission. The returned users are mapped into lightweight identifier/name objects suitable for signer
 * selection lists.
 *
 * On success, wraps the matching users in a {@link Success}. On invalid filter input, returns a validation
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function getValidUsersAsApprovers
 * @param {ValidApproverPermissionType} filter - Disbursement approval permission used to filter eligible users.
 * @returns {Promise<Result<{ id: string; name: string; }[]>>} A result wrapper containing valid approver users on
 *                                                             success, or a failure result on error.
 *
 * @remarks
 * - Only supported disbursement approval permission filters are accepted.
 * - Users must have the requested permission through their assigned office position.
 * - Intended for disbursement signer selection flows.
 */
export async function getValidUsersAsApprovers(
  filter: ValidApproverPermissionType,
): Promise<Result<{ id: string; name: string; }[]>> {
  try {
    if (
      filter !== "obr.disbursement.mayor.approve" &&
      filter !== "obr.disbursement.accountant.approve" &&
      filter !== "obr.disbursement.treasurer.approve"
    ) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid filter.", { filter });
    }

    const users = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(sql`${officePosition.permissions} @> ARRAY[${filter}]`);

    return new Success(users);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch valid users.", { filter }, e);
  }
}

/**
 * Computes the overall approval status from a list of approver states.
 *
 * @description
 * Evaluates the provided approver states and returns a single summary status. If any approver is still pending, the
 * summary is pending. If no approvers are pending and one or more are binned, the summary is mixed. If all approvers
 * are no longer pending but do not share the same state, the summary is mixed. Otherwise, the shared approver state
 * is returned.
 *
 * @function getSummaryOfStates
 * @param {Array<{ status: ApprovalState }>} states - Approver state entries to summarize.
 * @returns {ApprovalStateResponseType} The computed summary status for the provided approver states.
 *
 * @remarks
 * - Pending takes priority over all other states.
 * - If any non-pending state is binned, mixed is returned.
 * - Mixed is returned when completed approver states differ.
 * - The function expects at least one state entry.
 */
function getSummaryOfStates(states: Array<{ status: "pending" | "approved" | "binned" }>): ApprovalStateResponseType {
  if (states.length === 0) return "pending";

  const isEqualState = states.every(s => s.status === states[0].status);
  if (isEqualState) return states[0].status;

  // If binned is present among completed states, treat it as mixed for summary purposes.
  const hasBinned = states.some(s => s.status === "binned");
  if (hasBinned) return "mixed";

  return "pending";
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
      .where(eq(officePosition.id, user.office.role.id));
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

    // There's a conflict of the permission between OBR_APPROVERS_* where sometimes there are
    // approvers that are also have ability to create OBR Requests.
    //
    // Here's how it should be limited to office:
    // OBR_REQUEST_READ && OBR_APPROVER_BASIC_READ       => true
    // OBR_REQUEST_READ && OBR_APPROVER_BASIC_HIGH_WRITE => false
    // OBR_REQUEST_READ && OBR_APPROVER_ADVANCED_READ    => false
    // OBR_REQUEST_READ                                  => true
    const isOfficeLimited = permissionSet.has(permissions.OBR_REQUEST_READ)
      && !permissionSet.has(permissions.OBR_APPROVER_BASIC_HIGH_WRITE)
      && !permissionSet.has(permissions.OBR_APPROVER_ADVANCED_READ);
    return {
      officeLimited: isOfficeLimited,
      positionId: isOfficeLimited ? undefined : role.id,
    };
  } catch (e) {
    return {
      error: ErrorCodes.Fatal,
      stack: e,
    };
  }
}

/**
 * Validates whether a user can write disbursement-related OBR data.
 *
 * @description
 * Resolves the user's office position and checks whether it includes the budget-officer approval write permission
 * required for disbursement write operations. Returns `null` when the user is valid, or a lightweight validation
 * result when access is denied or an unexpected error occurs.
 *
 * On success, returns `null`. On permission failure, returns an insufficient-permissions error. On unexpected failure,
 * returns a fatal error with the caught stack value.
 *
 * @async
 * @function isWriterUserValidForDisbursement
 * @param {User} user - User whose disbursement write access should be validated.
 * @returns {Promise<null | AccessRequestValidationResult>} `null` when the user is allowed to write disbursement
 *                                                               data, or a validation error result otherwise.
 *
 * @remarks
 * - Requires the configured budget-officer approval write permission.
 * - Intended to be used as a guard before disbursement write operations.
 */
async function isWriterUserValidForDisbursement(user: User): Promise<null | AccessRequestValidationResult> {
  try {
    // Fetch the position of the user in the office
    const [role] = await db
      .select({ id: officePosition.id, name: officePosition.name, permissions: officePosition.permissions })
      .from(officePosition)
      .where(eq(officePosition.id, user.office.role.id));
    if (!role) {
      return { error: ErrorCodes.InsufficientPermissions };
    }

    // Check for the position if the user contains the required permissions.
    const permissionSet = new Set(role.permissions);
    if (!permissionSet.has(permissions.OBR_DISBURSEMENT_CREATE)) {
      return { error: ErrorCodes.InsufficientPermissions };
    }

    return null;
  } catch (e) {
    return { error: ErrorCodes.Fatal, stack: e };
  }
}

/**
 * Validates whether a user can access OBR management operations.
 *
 * @description
 * Resolves the user's office position and checks whether the position has the required OBR management permissions.
 * Returns `null` when the user is valid, or a lightweight validation result when access is denied or an unexpected error
 * occurs.
 *
 * On success, returns `null`. On permission failure, returns an insufficient-permissions error. On unexpected failure,
 * returns a fatal error with the caught stack value.
 *
 * @async
 * @function isUserValidForObrManagement
 * @param {User} user - User whose OBR management access should be validated.
 * @returns {Promise<null | AccessRequestValidationResult>} `null` when the user is allowed to access OBR management
 *                                                               operations, or a validation error result otherwise.
 *
 * @remarks
 * - Requires the configured OBR management permissions.
 * - Intended to be used as a guard before OBR management read or write operations.
 */
async function isUserValidForObrManagement(user: User): Promise<null | AccessRequestValidationResult> {
  try {
    // Fetch the position of the user in the office
    const [role] = await db
      .select({ id: officePosition.id, name: officePosition.name, permissions: officePosition.permissions })
      .from(officePosition)
      .where(eq(officePosition.id, user.office.role.id));
    if (!role) {
      return { error: ErrorCodes.InsufficientPermissions };
    }

    // Check for the position if the user contains the required permissions.
    const permissionSet = new Set(role.permissions);
    if (!(permissionSet.has(permissions.OBR_APPROVER_BASIC_READ) && permissions.OBR_APPROVER_BASIC_WRITE)) {
      return { error: ErrorCodes.InsufficientPermissions };
    }

    return null;
  } catch (e) {
    return { error: ErrorCodes.Fatal, stack: e };
  }
}

/**
 * Creates a tax breakdown for an OBR disbursement amount.
 *
 * @description
 * Validates the provided VAT/base amount, determines the applicable tax label from the tax type, then computes the
 * withholding tax values and resulting net amount. If the amount is invalid, returns an empty breakdown with all
 * computed fields set to `null`.
 *
 * @function createTaxBreakdown
 * @param {Optional<string>} vat - VAT or base amount used to compute the tax breakdown.
 * @param {TaxType} type - Tax classification used to determine which tax rates apply.
 * @returns {ObrDisbursementTaxBreakdown} The computed tax breakdown, or an empty breakdown when the amount is invalid.
 *
 * @remarks
 * - VAT-based tax types use VAT-derived calculations.
 * - Non-VAT tax types use direct amount-based calculations.
 * - `netAmount` is returned as `null` when no deductions are applied.
 */
function createTaxBreakdown(vat: Optional<string>, type: Optional<TaxType>): ObrDisbursementTaxBreakdown {
  if (!validatorUtilities.isNumber(vat) || !validatorUtilities.isNotEmpty(type)) {
    return {
      tax: null,
      vat5: null,
      pt3: null,
      ewt2: null,
      ewt1: null,
      netAmount: null,
    };
  }

  const vatDecimal = casts.castFromDecimal(vat!);

  let tax: Optional<string> = "PT 3%";
  if (type === "vat-g" || type === "vat-s") {
    tax = "VAT 5%";
  }

  let vat5: Optional<Decimal> = null;
  let pt3: Optional<Decimal> = null;
  let ewt2: Optional<Decimal> = null;
  let ewt1: Optional<Decimal> = null;
  let netAmount: Optional<Decimal> = null;

  if (tax === "VAT 5%") {
    vat5 =  vatDecimal!
      .div("1.12")
      .mul("0.05");
  }

  if (tax === "PT 3%") {
    pt3 = vatDecimal.mul("0.02");
  }

  if (type === "vat-s") {
    ewt2 = vatDecimal
      .div("1.12")
      .mul("0.02");
  }

  if (type === "nvat-s") {
    ewt2 = vatDecimal.mul("0.02");
  }

  if (type === "vat-g") {
    ewt1 = vatDecimal
      .div("1.12")
      .mul("0.01");
  }

  if (type === "nvat-g") {
    ewt1 = vatDecimal.mul("0.01");
  }

  netAmount = [vat5, pt3, ewt2, ewt1]
    .filter((n): n is Decimal => n !== null)
    .reduce((a, c) => a.sub(c), vatDecimal);

  return {
    tax,
    vat5: vat5?.toString() ?? null,
    pt3: pt3?.toString() ?? null,
    ewt2: ewt2?.toString() ?? null,
    ewt1: ewt1?.toString() ?? null,
    netAmount: netAmount?.toString() ?? null,
  };
}

/**
 * Attempts to resolve a valid disbursement signer by user identifier.
 *
 * @description
 * Looks up the target user with their assigned office position and permissions, then verifies whether the position has
 * one of the configured disbursement approval permissions. Returns a lightweight signer object when the user is eligible,
 * or `null` when the user cannot be found, lacks the required permission, or an unexpected error occurs.
 *
 * On success, returns the signer identity and position name. On lookup, permission, or unexpected failure, returns
 * `null` instead of throwing.
 *
 * @async
 * @function tryGetValidSignerForDisbursement
 * @param {string} userId - Identifier of the user to validate as a disbursement signer.
 * @returns {Promise<{ id: string; name: string; positionName: string; } | null>} The resolved signer information when
 *                                                                                valid, or `null` otherwise.
 *
 * @remarks
 * - Requires one of the configured disbursement approval permissions.
 * - Missing users and users without an eligible position are treated as invalid signers.
 * - Unexpected errors are captured internally and do not propagate to the caller.
 */
async function tryGetValidSignerForDisbursement(userId: string): Promise<{ id: string; name: string; positionName: string; } | null> {
  try {
    // Fetch the position of the user in the office
    const [target] = await db
      .select({
        id: user.id,
        name: user.name,
        roleName: officePosition.name,
        permissions: officePosition.permissions,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(eq(user.id, userId));
    if (!target) return null;

    // Check for the position if the user contains the required permissions.
    const permissionSet = new Set(target.permissions);
    if (
      !permissionSet.has(permissions.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE) &&
      !permissionSet.has(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE) &&
      !permissionSet.has(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE)
    ) {
      return null;
    }

    return { id: target.id, name: target.name, positionName: target.roleName };
  } catch (e) {
    // Report the log. It's not intended to be returned.
    void new Failure(ErrorCodes.Fatal, "Unable to fetch the signer for disbursement", { userId }, e);
    return null;
  }
}

/**
 * Attempts to find an eligible office-head signer from a list of user identifiers.
 *
 * @description
 * Looks up the provided signer users with their assigned office-position permissions, then returns the first signer
 * whose position has the required disbursement approval permission. Duplicate signer identifiers are ignored before
 * lookup.
 *
 * On success, returns the matching signer identity. If no eligible signer is found, or if an unexpected error occurs,
 * returns `null` instead of throwing.
 *
 * @async
 * @function findOfficeHead
 * @param {string[]} signers - User identifiers to search for an eligible office-head signer.
 * @returns {Promise<{ id: string; name: string } | null>} The matching signer identity when found, or `null` otherwise.
 *
 * @remarks
 * - Duplicate signer identifiers are de-duplicated before querying.
 * - Returns the first signer with the required disbursement approval permission.
 * - Unexpected errors are captured internally and do not propagate to the caller.
 */
async function findOfficeHead(signers: string[]): Promise<{ id: string; name: string; positionName: string; } | null> {
  try {
    // Find the information from all signers.
    const allSigners = new Set(signers);
    const signerResult = await db
      .select({
        id: user.id,
        name: user.name,
        positionName: officePosition.name,
        permissions: officePosition.permissions,
      })
      .from(user)
      .innerJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .where(inArray(user.id, [...allSigners]));

    for (const user of signerResult) {
      if (user.permissions?.includes(permissions.OFFICE_HEAD)) {
        return { id: user.id, name: user.name, positionName: user.positionName! };
      }
    }

    return null;
  } catch (e) {
    // Report the log. It's not intended to be returned.
    void new Failure(
      ErrorCodes.Fatal, "Unable to find the office head.", { signers }, e);
    return null;
  }
}

/**
 * Retrieves and maps an OBR request using the provided query conditions.
 *
 * @description
 * Fetches a single OBR request matching the supplied conditions, including its request items and approver states.
 * Related responsibility centers, expense codes, users, approver positions, and originating office details are then
 * resolved and mapped into a complete OBR request object.
 *
 * On success, returns the mapped OBR request. If no matching request is found, returns `null`.
 *
 * @async
 * @function _getObrRequestById
 * @param {string} requestId - Identifier of the OBR request to retrieve and use for related subqueries.
 * @param {SQL[]} whereQuery - Query conditions used to locate the target OBR request.
 * @returns {Promise<ObrRequestType | null>} The mapped OBR request when found, or `null` when no matching request exists.
 *
 * @remarks
 * - Intended as an internal helper for request lookup and mapping.
 * - The returned request includes publisher, originating office, request items, and approver/signing details.
 * - Related records are fetched in parallel after the base request is resolved.
 */
async function _getObrRequestById(requestId: string, whereQuery: SQL[]): Promise<ObrRequestType | null> {
  const [result] = await db
    .select({
      id: obrRequests.id,
      type: obrRequests.type,
      requestNumber: obrRequests.requestNumber,
      payee: obrRequests.payee,
      officeAddress: obrRequests.officeAddress,
      obrNumber: obrRequests.obrNumber,
      prNumber: obrRequests.prNumber,
      publisherId: obrRequests.publisherId,
      officeId: obrRequests.originatingOfficeId,
      requestItems: sql<({ id: string, particulars: string, amount: string, responsibilityCenterId: string, expenseCodeId: string })[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ${obrRequestItems.id},
                'particulars', ${obrRequestItems.particulars},
                'amount', ${obrRequestItems.amount},
                'responsibilityCenterId', ${obrRequestItems.responsibilityCenterId},
                'expenseCodeId', ${obrRequestItems.expenseCodeId}
              )
            ),
            '[]'::json
          )
          FROM ${obrRequestItems}
          WHERE ${obrRequestItems.requestId} = ${requestId}
        )`,
      requestItemsCount: sql<number>`(
          SELECT COUNT(*) FROM ${obrRequestItems} WHERE ${obrRequestItems.requestId} = ${requestId}
        )`,
      approvers: sql<({ status: ApprovalState, positionId: string, reason?: string, actedUserId?: string, actedAt?: Date })[]>`(
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
          WHERE ${obrRequestApprovers.requestId} = ${requestId}
        )`,
    })
    .from(obrRequests)
    .where(whereQuery.length >= 2 ? and(...whereQuery) : whereQuery[0]);
  if (!result) return null;

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
  return {
    id: result.id,
    type: result.type,
    requestNumber: result.requestNumber,
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
      id: i.id,
      particulars: i.particulars,
      amount: i.amount,
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
  } satisfies ObrRequestType;
}

/**
 * Retrieves OBR request summaries with aggregated item counts and approver states.
 *
 * @description
 * Constructs and executes a query that fetches OBR requests with their aggregated request item counts and approver
 * states. The results are filtered using the provided SQL condition and ordered by creation date in descending order.
 * Request item counts and approver states are joined from subqueries that aggregate counts and approval statuses
 * respectively.
 *
 * On success, returns the list of OBR request summaries. If no requests match the provided filter, returns an empty list.
 *
 * @async
 * @function _getAllObrRequestAsSummaries
 * @param {SQL} filter - SQL condition used to filter OBR requests. Common filters include existence checks for related
 *                       disbursement vouchers or office-limited conditions.
 * @returns {Promise<Array<{id: string, requestNumber: string, type: string, payee: string, officeAddress: string, obrNumber?: string, prNumber?: string, requestItemsCount: number, approvers: Array<{status: ApprovalState}>}>>}
 *          A promise resolving to an array of OBR request summaries with aggregated counts and approver states.
 *
 * @remarks
 * - Intended as an internal helper function for request listing operations.
 * - Results are ordered by creation date in descending order (newest first).
 * - Request item counts default to 0 when no items exist.
 * - Approver states default to an empty array when no approvers exist.
 * - The filter parameter is required and should be a valid Drizzle SQL condition.
 */
async function _getAllObrRequestAsSummaries(filter: SQL) {
  const requestItemCountSubquery = db
    .select({
      requestId: obrRequestItems.requestId,
      requestItemsCount: sql<number>`CAST(COUNT(*) AS INT)`.as("requestItemsCount"),
    })
    .from(obrRequestItems)
    .groupBy(obrRequestItems.requestId)
    .as("request_item_count_subquery");

  const requestApproversSubquery = db
    .select({
      requestId: obrRequestApprovers.requestId,
      approvers: sql<({ status: ApprovalState })[]>`COALESCE(
          json_agg(
            json_build_object(
              'status', ${obrRequestApprovers.status}
            )
          ),
          '[]'::json
        )`.as("approvers"),
    })
    .from(obrRequestApprovers)
    .groupBy(obrRequestApprovers.requestId)
    .as("request_approvers_subquery");

  // Fetch all items
  const all = await db
    .select({
      id: obrRequests.id,
      requestNumber: obrRequests.requestNumber,
      type: obrRequests.type,
      payee: obrRequests.payee,
      officeAddress: obrRequests.officeAddress,
      obrNumber: obrRequests.obrNumber,
      prNumber: obrRequests.prNumber,
      requestItemsCount: sql<number>`COALESCE(${requestItemCountSubquery.requestItemsCount}, 0)`,
      approvers: sql<({ status: ApprovalState })[]>`COALESCE(${requestApproversSubquery.approvers}, '[]'::json)`,
    })
    .from(obrRequests)
    .leftJoin(
      requestItemCountSubquery,
      eq(requestItemCountSubquery.requestId, obrRequests.id),
    )
    .leftJoin(
      requestApproversSubquery,
      eq(requestApproversSubquery.requestId, obrRequests.id),
    )
    .where(filter)
    .orderBy(desc(obrRequests.createdAt));

  return all;
}

/**
 * Fetches and maps OBR main data records into {@link ObrMainDataItem} objects.
 *
 * @description
 * Selects OBR main data records with their joined responsibility center, expense code, and author details, then
 * fetches associated AIP references and ESRE disbursed totals in parallel. Computes derived fields including
 * disbursed variance, AIP-vs-F4 variance, quarter, and UTC+8-formatted date. When `filter` is omitted, all
 * records are returned sorted by OBR number.
 *
 * @async
 * @function _fetchObrMainDataItems
 * @param {SQL} [filter] - Optional Drizzle SQL condition used to narrow the result set.
 * @returns {Promise<ObrMainDataItem[]>} The mapped array of OBR main data items. Returns an empty array when no
 *                                       records match the filter.
 *
 * @remarks
 * - Intended as an internal helper shared across create, update, and list operations.
 * - AIP references are ordered by their stored index.
 * - Disbursed amounts are derived from linked ESRE records.
 */
async function _fetchObrMainDataItems(filter?: SQL): Promise<ObrMainDataItem[]> {
  const rows = await db
    .select({
      id: obrMainData.id,
      obrNumber: obrMainData.obrNumber,
      alobs: obrMainData.alobs,
      payee: obrMainData.payee,
      address: obrMainData.address,
      prNumber: obrMainData.prNumber,
      particulars: obrMainData.particulars,
      obligated: obrMainData.obligated,
      prAmount: obrMainData.prAmount,
      createdAt: obrMainData.createdAt,
      requestSourceId: obrMainData.requestSourceId,
      saaobId: obrMainData.saaobId,
      saaobName: saaobEntries.name,

      rcId: officeCodes.id,
      rcName: officeCodes.aa,
      rcSector: officeCodes.sector,
      rcFunction: officeCodes.function,

      ecId: expenseClasses.id,
      ecName: expenseClasses.accountName,
      ecAccountCode: expenseClasses.accountCode,
      ecSubClassification: expenseClasses.subClassification,
      ecClass: expenseClasses.class,

      authorId: userSchema.id,
      authorName: userSchema.name,
    })
    .from(obrMainData)
    .innerJoin(officeCodes, eq(officeCodes.id, obrMainData.responsibilityCenterId))
    .innerJoin(expenseClasses, eq(expenseClasses.id, obrMainData.expenseCodeId))
    .innerJoin(userSchema, eq(userSchema.id, obrMainData.authorId))
    .leftJoin(saaobEntries, eq(saaobEntries.id, obrMainData.saaobId))
    .where(filter)
    .orderBy(asc(obrMainData.obrNumber));

  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);

  const [aipRefs, esreSums] = await Promise.all([
    db
      .select({
        id: obrMainAipReferences.id,
        obrId: obrMainAipReferences.obrId,
        aipReferenceId: obrMainAipReferences.aipReferenceId,
        aipReferenceCode: obrMainAipReferences.aipReferenceCode,
        aipDescription: obrMainAipReferences.aipDescription,
        amount: obrMainAipReferences.amount,
      })
      .from(obrMainAipReferences)
      .where(inArray(obrMainAipReferences.obrId, ids))
      .orderBy(asc(obrMainAipReferences.index)),

    db
      .select({
        obrItemId: esre.obrItemId,
        total: sql<string>`COALESCE(SUM(${esre.amount}), '0')`,
      })
      .from(esre)
      .where(inArray(esre.obrItemId, ids))
      .groupBy(esre.obrItemId),
  ]);

  const aipRefsByItem = new Map<string, Array<{ id: string; aipReferenceId: string; aipCode: string; aipDescription: string; amount: string }>>();
  for (const ref of aipRefs) {
    const existing = aipRefsByItem.get(ref.obrId) ?? [];
    existing.push({
      id: ref.id,
      aipReferenceId: ref.aipReferenceId ?? "",
      aipCode: ref.aipReferenceCode ?? "",
      aipDescription: ref.aipDescription ?? "",
      amount: ref.amount ?? "0",
    });
    aipRefsByItem.set(ref.obrId, existing);
  }

  const esreByItem = new Map<string, string>(
    esreSums
      .filter(e => e.obrItemId !== null)
      .map(e => [e.obrItemId!, e.total]),
  );

  return rows.map(r => {
    const disbursedStr = esreByItem.get(r.id) ?? "0";
    const aipRefsForItem = aipRefsByItem.get(r.id) ?? [];
    const aipTotal = aipRefsForItem.reduce(
      (acc, ref) => acc.plus(new Decimal(ref.amount)),
      new Decimal(0),
    );
    const obligatedDec = casts.castFromDecimal(r.obligated);
    const disbursedDec = new Decimal(disbursedStr);
    const dt = DateTime.fromJSDate(r.createdAt).setZone("Asia/Manila");

    return {
      id: r.id,
      obrNumber: r.obrNumber,
      alobs: r.alobs,
      date: dt.toISO()!,
      payee: r.payee ?? null,
      address: r.address,
      requestSourceId: r.requestSourceId ?? null,
      saaob: r.saaobId ? { id: r.saaobId, name: r.saaobName ?? "" } : null,
      responsibilityCenter: {
        id: r.rcId,
        name: r.rcName,
        sector: r.rcSector,
        function: r.rcFunction,
      },
      expenseCode: {
        id: r.ecId,
        expenseName: r.ecName,
        accountCode: r.ecAccountCode,
        subClassification: r.ecSubClassification,
        expenseClass: r.ecClass,
      },
      prNumber: r.prNumber ?? "",
      particulars: r.particulars,
      obligated: r.obligated,
      prAmount: r.prAmount ?? "0",
      disbursed: disbursedDec.toFixed(2),
      varianceDisbursed: obligatedDec.minus(disbursedDec).toFixed(2),
      remarks: null,
      aipReferences: aipRefsForItem,
      varObrVsF4: obligatedDec.minus(aipTotal).toFixed(2),
      quarter: String(Math.ceil(dt.month / 3)),
      publisher: {
        id: r.authorId,
        name: r.authorName,
      },
    } satisfies ObrMainDataItem;
  });
}

type AccessRequestReaderValidationResult = {
  error?: ErrorCodes | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stack?: any,
  officeLimited?: boolean,
  positionId?: string,
}

type AccessRequestValidationResult = Omit<AccessRequestReaderValidationResult, "officeLimited">;

type ApprovalState = "pending" | "approved" | "binned";
type ApprovalStateResponseType = ApprovalState | "mixed";

type CreateNewRequestType = {
  requestNumber: string;
  payee: Optional<string>;
  officeAddress: string;
  obrNumber?: string;
  prNumber?: string;
  requestItems: Array<{
    responsibilityCenterId: string;
    expenseCodeId: string;
    particulars: string;
    amount: string;
  }>
}

type BaseObrRequestType = {
  id: string;
  type: string;
  requestNumber: string;
  payee: Optional<string>;
  officeAddress: string;
  obrNumber: Optional<string>;
  prNumber: Optional<string>;
  requestItemsCount: number;
}

type ObrRequestSummaryType = {
  approvalStatus:  "pending" | "approved" | "binned" | "mixed"
} & BaseObrRequestType;

type ExpenseCodeObject = {
  id: string;
  name: string;
  fpp: Optional<string>;
  accountCode: Optional<string>;
}

type ObrRequestType = {
  office: {
    id: string;
    name: string;
  }
  requestItems: Array<{
    id: string;
    particulars: string;
    amount: string;
    expenseCode: ExpenseCodeObject;
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

type ObrDisbursementTaxBreakdown = {
  tax: Optional<string>;
  vat5: Optional<string>;
  pt3: Optional<string>;
  ewt2: Optional<string>;
  ewt1: Optional<string>;
  netAmount: Optional<string>;
}

type ObrDisbursementVoucher = {
  id: string;
  disbursementVoucherNumber: string;
  createdAt: Date;
  payee?: string | null;
  address: string;
  particulars: string;
  grossAmount: Optional<string>;
  vatableAmount: Optional<string>;
  taxType: Optional<string>;
  taxBreakdown: ObrDisbursementTaxBreakdown,
  responsibilityCenter: {
    id: string;
    aa: string;
  }
  signers: {
    accountant: {
      id: string;
      name: string;
      position: string;
    }
    treasurer: {
      id: string;
      name: string;
      position: string;
    }
    mayor: {
      id: string;
      name: string;
      position: string;
    }
    headOfOffice: {
      id: string;
      name: string;
      position: string;
    }
  }
  fundType: Optional<{
    id: string;
    name: string;
    description: Optional<string>;
  }>
  status: Optional<string>;
  prNumber: Optional<string>;
  hasElecData: boolean;
}

export type ValidApproverPermissionType =
  | "obr.disbursement.accountant.approve"
  | "obr.disbursement.treasurer.approve"
  | "obr.disbursement.mayor.approve";

type TaxType = "vat-g" | "vat-s" | "nvat-g" | "nvat-s";
type DisbursementStatus = "PREPARATION" | "PROCESSING" | "ON HOLD" | "FOR RELEASE" | "PAID";

type CreateDisbursementVoucherPayload = {
  targetItemId: string;
  vatableAmount: Optional<string>;
  taxType: Optional<TaxType>;
  fundTypeId: Optional<string>;
  status: Optional<DisbursementStatus>;

  accountantId: string;
  treasurerId: string;
  mayorId: string;
};

type UpdateDisbursementVoucherPayload = {
  vatableAmount: Optional<string>;
  taxType: Optional<TaxType>;
  fundTypeId: Optional<string>;
  status: Optional<DisbursementStatus>;
  obrItemId: Optional<string>;
}

type ObrItemOfficeData = {
  id: string;
  amount: string;
  responsibilityCenter: {
    id: string;
    name: string;
  }
  expenseCode: ExpenseCodeObject;
}

type ObrItem = {
  id: string;
  obrRefNumber: string;
  dvRefNumber: Optional<string>;
  date: Date;
  payee: Optional<string>;
  address: string;
  particulars: string;
  amounts: ObrItemOfficeData[];
  overallAmount: string;
  requestingOfficial: {
    id: string;
    name: string;
    position: string;
  }
  publisher: {
    id: string;
    name: string;
    position: string;
  }
};

export type ObrSearchResultItem = {
  id: string;
  obrRefNumber: string;
  dvRefNumber: string;
  payee: Optional<string>;
  address: string;
  particulars: string;
  expenseClass: {
    id: string;
    accountName: string;
    accountCode: string | null;
    subClassification: string | null;
  } | null;
  office: {
    id: string;
    name: string;
  } | null;
};

export type ObrMainDataItem = {
  id: string;
  obrNumber: string;
  alobs: string;
  date: string;
  payee: Optional<string>;
  address: string;
  requestSourceId: string | null;
  saaob: { id: string; name: string } | null;
  responsibilityCenter: {
    id: string;
    name: string;
    sector: Optional<string>;
    function: Optional<string>;
  };
  expenseCode: {
    id: string;
    expenseName: string;
    accountCode: Optional<string>;
    subClassification: Optional<string>;
    expenseClass: Optional<string>;
  };
  prNumber: string;
  particulars: string;
  obligated: string;
  prAmount: string;
  disbursed: string;
  varianceDisbursed: string;
  remarks: Optional<string>;
  aipReferences: Array<{
    id: string;
    aipReferenceId: string;
    aipCode: string;
    aipDescription: string;
    amount: string;
  }>;
  varObrVsF4: string;
  quarter: string;
  publisher: {
    id: string;
    name: string;
  };
};

export type ObrMainDataSearchResultItem = {
  id: string;
  alobs: string;
  date: string;
  particulars: string;
  obrNumber: string;
  address: string;
  payee: Optional<string>;
  expenseClass: {
    id: string;
    accountName: string;
    accountCode: string | null;
    subClassification: string | null;
  } | null;
  office: {
    id: string;
    name: string;
  } | null;
};

type CreateObrMainDataPayload = {
  obrNumber: string;
  prNumber?: string;
  prAmount?: string;
  saaobId?: string;
  aipReferences?: Array<{
    aipId: string;
    amount: string;
  }>;
  payee?: string | null;
  address: string;
  responsibilityCenterId: string;
  expenseCodeId: string;
  particulars: string;
  amount: string;
  requestId?: string;
};

type UpdateObrMainDataPayload = {
  obrNumber?: string;
  prNumber?: string;
  prAmount?: string;
  saaobId?: string | null;
  aipReferences?: Array<{
    aipId: string;
    amount: string;
  }>;
  payee?: string | null;
  address?: string;
  responsibilityCenterId?: string;
  expenseCodeId?: string;
  particulars?: string;
  amount?: string;
};
