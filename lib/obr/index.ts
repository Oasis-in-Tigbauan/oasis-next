import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";
import { v7 as uuidv7 } from "uuid";

import * as templateBucket from "@/lib/buckets/templates";
import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { publishEvent } from "@/lib/events";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  amountToWords,
  buildChargesString,
  type ObrFormSignerBlock,
} from "@/common/obr/form-export-layout";
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

export const OBR_FORM_TEMPLATE_IDENTIFIER = "obr.form";
export const OBR_DV_FORM_TEMPLATE_IDENTIFIER = "obr.dv.form";

const _MERGE_CELL_TYPE = 1; // ValueType.Merge in ExcelTS

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
 * - Basic requests require a budget-officer approver.
 * - Advanced requests additionally require a higher-level approver.
 * - Responsibility centers and expense codes are validated before the transaction is committed.
 * - Responsibility centers and expense codes are validated before the transaction is committed.
 * - Requests always wait until a disbursement is created before entering the approval queue.
 */
export async function createRequest(req: CreateNewRequestType, user: User): Promise<Result<ObrRequestType>> {
  try {
    const submittedForApproval = false;

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

    const budgetOfficerPosition = positions.find(p =>
      p.permissions.includes(permissions.OBR_APPROVER_BASIC_HIGH_WRITE),
    );

    const basicWritePosition = positions.find(p =>
      p.officeId === user.office.id &&
      p.permissions.includes(permissions.OBR_APPROVER_BASIC_WRITE),
    );

    const higherUpSigners = isAdvanced
      ? positions.filter(p =>
        p.permissions.includes(permissions.OBR_APPROVER_ADVANCED_WRITE),
      ).slice(0, 1)
      : [];

    if (!budgetOfficerPosition) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "User does not have a budget officer position in the office.",
        { req, userId: user.id },
      );
    }

    if (!basicWritePosition) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No basic approver position found in the requesting office.",
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

    const approverPositions = [
      budgetOfficerPosition,
      basicWritePosition,
      ...higherUpSigners,
    ];

    const transaction = await db.transaction(async tx => {
      const requestType = isAdvanced ? "advanced" : "basic";

      const [request] = await tx
        .insert(obrRequests)
        .values({
          requestNumber: req.requestNumber,
          payee: req.payee,
          officeAddress: req.officeAddress,
          originatingOfficeId: user.office.id,
          submittedForApproval,
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

      await tx.insert(obrRequestApprovers).values(
        approverPositions.map(p => ({
          requestId: request.id,
          positionId: p.id,
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
    const createdRequest = {
      id: transaction.id,
      type: transaction.type,
      requestNumber: transaction.requestNumber,
      payee: transaction.payee,
      officeAddress: transaction.officeAddress,
      obrNumber: transaction.obrNumber,
      prNumber: transaction.prNumber,
      submittedForApproval: transaction.submittedForApproval,
      disbursementApproved: false,
      promoted: false,
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
      approvers: approverPositions.map(p => ({
        status: "pending" as const,
        reason: null,
        position: { id: p.id, name: p.name },
        signer: null,
        signedAt: null,
      })),
    } satisfies ObrRequestType;

    return new Success(createdRequest);
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
 * - Requires the budget officer approval write permission.
 * - The user's position must be assigned as a signer for the request.
 * - Already-signed approver entries cannot be changed.
 * - On budget officer approval, autofills the originating office basic approver and, for advanced requests, the vice
 *   mayor (first user with advanced write permission) using their own user records rather than the acting user.
 */
export async function setApproverState(entryId: string, user: User, status: "pending" | "approved" | "binned", reason?: string): Promise<Result<ApproverObject>> {
  try {
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

    const permissionSet = new Set(role.permissions);
    if (!permissionSet.has(permissions.OBR_APPROVER_BASIC_HIGH_WRITE)) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "Only the budget officer may approve or reject this request.",
        { entryId, userId: user.id, permissions: user.office.role.permissions, status },
      );
    }

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

    if (approverObject.status !== "pending" && approverObject.actorId !== null) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This request has already been signed. Contact your Budget Officer for assistance.",
        { entryId, userId: user.id, status },
      );
    }

    const [requestRow] = await db
      .select({
        id: obrRequests.id,
        type: obrRequests.type,
        originatingOfficeId: obrRequests.originatingOfficeId,
      })
      .from(obrRequests)
      .where(eq(obrRequests.id, entryId))
      .limit(1);
    if (!requestRow) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { entryId });
    }

    const allPositions = await db
      .select({
        id: officePosition.id,
        permissions: officePosition.permissions,
        officeId: officePosition.officeId,
      })
      .from(officePosition);

    const basicWritePosition = allPositions.find(p =>
      p.officeId === requestRow.originatingOfficeId &&
      p.permissions.includes(permissions.OBR_APPROVER_BASIC_WRITE),
    );
    const advancedWritePosition = requestRow.type === "advanced"
      ? allPositions.find(p => p.permissions.includes(permissions.OBR_APPROVER_ADVANCED_WRITE))
      : undefined;

    const [basicWriteSigner, advancedWriteSigner] = await Promise.all([
      basicWritePosition
        ? findFirstUserWithApprovalPermission(
          permissions.OBR_APPROVER_BASIC_WRITE,
          requestRow.originatingOfficeId,
        )
        : Promise.resolve(null),
      advancedWritePosition
        ? findFirstUserWithApprovalPermission(permissions.OBR_APPROVER_ADVANCED_WRITE)
        : Promise.resolve(null),
    ]);

    const autoFillEntries = [
      basicWritePosition && basicWriteSigner
        ? { positionId: basicWritePosition.id, actedUserId: basicWriteSigner.id }
        : null,
      advancedWritePosition && advancedWriteSigner
        ? { positionId: advancedWritePosition.id, actedUserId: advancedWriteSigner.id }
        : null,
    ].filter((entry): entry is { positionId: string; actedUserId: string } => entry !== null);

    const actedAt = DateTime.utc().toJSDate();

    const [result] = await db.transaction(async tx => {
      const [updated] = await tx
        .update(obrRequestApprovers)
        .set({
          actedUserId: user.id,
          actedAt,
          status,
          ...(validatorUtilities.isNotEmpty(reason) ? { reason } : {}),
        })
        .where(eq(obrRequestApprovers.id, approverObject.id))
        .returning();
      if (!updated) throw new Error("Unable to set approver state");

      if (autoFillEntries.length > 0) {
        for (const entry of autoFillEntries) {
          await tx
            .update(obrRequestApprovers)
            .set({
              actedUserId: entry.actedUserId,
              actedAt,
              status,
              ...(validatorUtilities.isNotEmpty(reason) ? { reason } : {}),
            })
            .where(
              and(
                eq(obrRequestApprovers.requestId, entryId),
                eq(obrRequestApprovers.positionId, entry.positionId),
              ),
            );
        }
      }

      return [updated];
    });

    await checkAndPromoteRequest(entryId);

    const [requestSummary] = await db
      .select({
        requestNumber: obrRequests.requestNumber,
        officeId: obrRequests.originatingOfficeId,
        approvers: sql<({ status: ApprovalState; positionId: string })[]>`COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'status', ${obrRequestApprovers.status},
                'positionId', ${obrRequestApprovers.positionId}
              )
            )
            FROM ${obrRequestApprovers}
            WHERE ${obrRequestApprovers.requestId} = ${entryId}
              AND NOT EXISTS (
                SELECT 1 FROM ${officePosition}
                WHERE ${officePosition.id} = ${obrRequestApprovers.positionId}
                  AND ${permissions.OFFICE_HEAD} = ANY(${officePosition.permissions})
              )
          ),
          '[]'::json
        )`,
      })
      .from(obrRequests)
      .where(eq(obrRequests.id, entryId))
      .limit(1);

    if (requestSummary) {
      await publishEvent({
        type: "obr.request.approval-moved",
        payload: {
          requestId: entryId,
          requestNumber: requestSummary.requestNumber,
          officeId: requestSummary.officeId,
          actorName: user.fullName,
          status,
          overallStatus: getSummaryOfStates(requestSummary.approvers),
          nextApproverPositionIds: requestSummary.approvers
            .filter((approver) => approver.status === "pending")
            .map((approver) => approver.positionId),
        },
      });
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
        !validate.officeLimited ? eq(obrRequests.submittedForApproval, true) : undefined,
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
 * Updates a request line item and propagates changes to its linked disbursement voucher.
 *
 * @description
 * Allows a budget officer to edit request item particulars and amount while the request has not yet been promoted
 * to OBR main data. Changes are mirrored to the associated disbursement voucher when one exists.
 *
 * On success, wraps the updated request item in a {@link Success}. On permission, validation, or not-found failure,
 * returns a {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateObrRequestItem
 * @param {string} requestId - Identifier of the parent OBR request.
 * @param {string} itemId - Identifier of the request item to update.
 * @param {UpdateObrRequestItemPayload} payload - Updated item fields.
 * @param {User} user - User attempting to update the request item.
 * @returns {Promise<Result<ObrRequestItemObject>>} A result wrapper containing the updated item on success.
 */
export async function updateObrRequestItem(
  requestId: string,
  itemId: string,
  payload: UpdateObrRequestItemPayload,
  user: User,
): Promise<Result<ObrRequestItemObject>> {
  try {
    const validate = await isBudgetOfficerValidForRequestEdit(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to update the request item.",
        { requestId, itemId, userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    if (await isRequestPromoted(requestId)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This request has already been promoted and can no longer be edited.",
        { requestId, itemId },
      );
    }

    if (await _hasApprovedDisbursementForRequest(requestId)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "The disbursement for this request has already been approved and can no longer be edited.",
        { requestId, itemId },
      );
    }

    const [item] = await db
      .select({
        id: obrRequestItems.id,
        particulars: obrRequestItems.particulars,
        amount: obrRequestItems.amount,
        responsibilityCenterId: obrRequestItems.responsibilityCenterId,
        expenseCodeId: obrRequestItems.expenseCodeId,
      })
      .from(obrRequestItems)
      .where(
        and(
          eq(obrRequestItems.id, itemId),
          eq(obrRequestItems.requestId, requestId),
        ),
      )
      .limit(1);
    if (!item) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request item found.", { requestId, itemId });
    }

    const updatePayload = {
      ...(validatorUtilities.isNotEmpty(payload.particulars) ? { particulars: payload.particulars! } : {}),
      ...(validatorUtilities.isNumber(payload.amount) ? { amount: casts.castToDecimal(payload.amount!) } : {}),
    };
    if (Object.keys(updatePayload).length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "No updatable fields provided.", { requestId, itemId, payload });
    }

    await db.transaction(async tx => {
      await tx
        .update(obrRequestItems)
        .set(updatePayload)
        .where(eq(obrRequestItems.id, itemId));

      const dvUpdate: Record<string, unknown> = {};
      if (updatePayload.particulars) dvUpdate.particulars = updatePayload.particulars;
      if (updatePayload.amount) {
        dvUpdate.grossAmount = updatePayload.amount;
      }
      if (Object.keys(dvUpdate).length > 0) {
        await tx
          .update(obrDisbursementVouchers)
          .set(dvUpdate)
          .where(
            and(
              eq(obrDisbursementVouchers.requestItemId, itemId),
              eq(obrDisbursementVouchers.accountantSigningStatus, "pending"),
            ),
          );
      }
    });

    const [rc] = await db
      .select({ id: officeCodes.id, aa: officeCodes.aa })
      .from(officeCodes)
      .where(eq(officeCodes.id, item.responsibilityCenterId))
      .limit(1);
    const [ec] = await db
      .select({
        id: expenseClasses.id,
        name: expenseClasses.accountName,
        fpp: expenseClasses.fpp,
        accountCode: expenseClasses.accountCode,
      })
      .from(expenseClasses)
      .where(eq(expenseClasses.id, item.expenseCodeId))
      .limit(1);

    const [updated] = await db
      .select({
        id: obrRequestItems.id,
        particulars: obrRequestItems.particulars,
        amount: obrRequestItems.amount,
        responsibilityCenterId: obrRequestItems.responsibilityCenterId,
        expenseCodeId: obrRequestItems.expenseCodeId,
      })
      .from(obrRequestItems)
      .where(eq(obrRequestItems.id, itemId))
      .limit(1);

    return new Success({
      id: updated!.id,
      particulars: updated!.particulars,
      amount: updated!.amount,
      responsibilityCenter: { id: rc!.id, name: rc!.aa },
      expenseCode: {
        id: ec!.id,
        name: ec!.name,
        fpp: ec!.fpp,
        accountCode: ec!.accountCode,
      },
    } satisfies ObrRequestItemObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update request item.", { requestId, itemId, userId: user.id }, e);
  }
}

/**
 * Lists disbursement vouchers pending accountant approval.
 *
 * @description
 * Returns all disbursement vouchers whose accountant signing status is pending, including linked request metadata.
 *
 * On success, wraps the pending disbursement list in a {@link Success}. On permission failure, returns a
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function listPendingDisbursementsForAccountant
 * @param {User} user - User attempting to list pending disbursements.
 * @returns {Promise<Result<PendingDisbursementBatchForAccountant[]>>} Pending disbursement batches on success.
 */
export async function listPendingDisbursementsForAccountant(
  user: User,
): Promise<Result<PendingDisbursementBatchForAccountant[]>> {
  try {
    const validate = await isAccountantValidForDisbursement(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to list pending disbursements.",
        { userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const rows = await db
      .select({
        id: obrDisbursementVouchers.id,
        disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
        disbursementBatchId: obrDisbursementVouchers.disbursementBatchId,
        createdAt: obrDisbursementVouchers.createdAt,
        payee: obrDisbursementVouchers.payee,
        address: obrDisbursementVouchers.address,
        particulars: obrDisbursementVouchers.particulars,
        explanation: obrDisbursementVouchers.explanation,
        isOneForAll: obrDisbursementVouchers.isOneForAll,
        withCheque: obrDisbursementVouchers.withCheque,
        grossAmount: obrDisbursementVouchers.grossAmount,
        vatableAmount: obrDisbursementVouchers.vatableAmount,
        taxType: obrDisbursementVouchers.taxType,
        status: obrDisbursementVouchers.status,
        accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,
        fundTypeId: fundTypes.id,
        fundTypeName: fundTypes.name,
        fundTypeDescription: fundTypes.description,
        prNumber: obrDisbursementVouchers.prNumber,
        responsibilityCenterId: officeCodes.id,
        responsibilityCenterAA: officeCodes.aa,
        requestId: obrDisbursementVouchers.requestId,
        requestNumber: obrRequests.requestNumber,
        requestItemId: obrRequestItems.id,
        requestItemParticulars: obrRequestItems.particulars,
        requestItemAmount: obrRequestItems.amount,
      })
      .from(obrDisbursementVouchers)
      .leftJoin(obrRequests, eq(obrRequests.id, obrDisbursementVouchers.requestId))
      .leftJoin(obrRequestItems, eq(obrRequestItems.id, obrDisbursementVouchers.requestItemId))
      .innerJoin(officeCodes, eq(officeCodes.id, obrDisbursementVouchers.responsibilityCenterId))
      .leftJoin(fundTypes, eq(fundTypes.id, obrDisbursementVouchers.fundTypeId))
      .where(
        and(
          eq(obrDisbursementVouchers.accountantSigningStatus, "pending"),
          or(
            isNull(obrDisbursementVouchers.requestId),
            eq(obrRequests.submittedForApproval, true),
          ),
        ),
      )
      .orderBy(desc(obrDisbursementVouchers.createdAt));

    type PendingRow = typeof rows[number];

    const mapRow = (row: PendingRow): PendingDisbursementForAccountant => ({
      id: row.id,
      disbursementVoucherNumber: row.disbursementVoucherNumber,
      createdAt: row.createdAt,
      payee: row.payee,
      address: row.address,
      particulars: row.particulars,
      explanation: validatorUtilities.isNotEmpty(row.explanation) ? row.explanation : null,
      isOneForAll: row.isOneForAll,
      withCheque: row.withCheque,
      grossAmount: validatorUtilities.isNotEmpty(row.grossAmount) ? row.grossAmount! : null,
      vatableAmount: validatorUtilities.isNotEmpty(row.vatableAmount) ? row.vatableAmount! : null,
      taxType: row.taxType ?? null,
      status: row.status ?? null,
      accountantSigningStatus: row.accountantSigningStatus,
      taxBreakdown: createTaxBreakdown(
        validatorUtilities.isNotEmpty(row.vatableAmount) ? row.vatableAmount! : null,
        row.taxType ?? null,
      ),
      responsibilityCenter: {
        id: row.responsibilityCenterId,
        aa: row.responsibilityCenterAA,
      },
      fundType: validatorUtilities.isNotEmpty(row.fundTypeId)
        ? { id: row.fundTypeId!, name: row.fundTypeName!, description: row.fundTypeDescription! }
        : null,
      request: row.requestId
        ? { id: row.requestId, requestNumber: row.requestNumber! }
        : null,
      requestItem: row.requestItemId
        ? {
          id: row.requestItemId,
          particulars: row.requestItemParticulars!,
          amount: row.requestItemAmount!,
        }
        : {
          id: row.id,
          particulars: row.particulars,
          amount: row.grossAmount ?? "0",
        },
      prNumber: validatorUtilities.isNotEmpty(row.prNumber) ? row.prNumber : null,
    });

    const grouped = new Map<string, PendingDisbursementBatchForAccountant>();
    for (const row of rows) {
      const groupKey = row.requestId ?? row.disbursementBatchId;
      const item = mapRow(row);
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.items.push(item);
        existing.itemCount += 1;
        if (validatorUtilities.isNotEmpty(item.grossAmount)) {
          existing.totalGrossAmount = casts.castFromDecimal(existing.totalGrossAmount)
            .add(casts.castFromDecimal(item.grossAmount!))
            .toString();
        }
      } else {
        grouped.set(groupKey, {
          batchId: row.disbursementBatchId,
          requestId: row.requestId,
          requestNumber: row.requestNumber,
          isHeadless: !row.requestId,
          payee: row.payee,
          address: row.address,
          isOneForAll: row.isOneForAll,
          withCheque: row.withCheque,
          accountantSigningStatus: row.accountantSigningStatus,
          totalGrossAmount: validatorUtilities.isNotEmpty(item.grossAmount) ? item.grossAmount! : "0",
          itemCount: 1,
          items: [item],
          requestItems: [],
        });
      }
    }

    const batches = [...grouped.values()];
    const oneForAllRequestIds = [
      ...new Set(
        batches
          .filter(batch => batch.isOneForAll && validatorUtilities.isNotEmpty(batch.requestId))
          .map(batch => batch.requestId!),
      ),
    ];

    if (oneForAllRequestIds.length > 0) {
      const requestItemRows = await db
        .select({
          id: obrRequestItems.id,
          requestId: obrRequestItems.requestId,
          particulars: obrRequestItems.particulars,
          amount: obrRequestItems.amount,
          responsibilityCenter: officeCodes.aa,
          expenseName: expenseClasses.accountName,
        })
        .from(obrRequestItems)
        .innerJoin(officeCodes, eq(officeCodes.id, obrRequestItems.responsibilityCenterId))
        .innerJoin(expenseClasses, eq(expenseClasses.id, obrRequestItems.expenseCodeId))
        .where(inArray(obrRequestItems.requestId, oneForAllRequestIds));

      const requestItemsByRequestId = new Map<string, Array<{
        id: string;
        particulars: string;
        amount: string;
        responsibilityCenter: string;
        expenseName: string;
      }>>();

      for (const requestItem of requestItemRows) {
        const existing = requestItemsByRequestId.get(requestItem.requestId) ?? [];
        existing.push({
          id: requestItem.id,
          particulars: requestItem.particulars,
          amount: casts.castToDecimal(String(requestItem.amount)),
          responsibilityCenter: requestItem.responsibilityCenter,
          expenseName: requestItem.expenseName,
        });
        requestItemsByRequestId.set(requestItem.requestId, existing);
      }

      for (const batch of batches) {
        if (batch.isOneForAll && batch.requestId) {
          batch.requestItems = requestItemsByRequestId.get(batch.requestId) ?? [];
        }
      }
    }

    return new Success(batches);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to list pending disbursements.", { userId: user.id }, e);
  }
}

/**
 * Updates the accountant approval state for all disbursement vouchers on an OBR request.
 *
 * @description
 * Allows an accountant to approve or reject every disbursement voucher linked to a request in one action. On approval,
 * auto-fills mayor, treasurer, and office-head signer slots on each voucher, then attempts to promote the parent
 * request to OBR main data and ESRE when all conditions are met.
 *
 * On success, wraps the updated disbursement vouchers in a {@link Success}. On permission or validation failure,
 * returns a {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function approveDisbursementsForRequest
 * @param {string} requestId - Identifier of the parent OBR request.
 * @param {User} user - Accountant user performing the approval action.
 * @param {"pending" | "approved" | "binned"} status - Approval status to apply to all vouchers on the request.
 * @param {string} [reason] - Optional reason for the decision.
 * @returns {Promise<Result<ObrDisbursementVoucher[]>>} Updated disbursement vouchers on success.
 */
export async function approveDisbursementsForRequest(
  requestId: string,
  user: User,
  status: "pending" | "approved" | "binned",
  reason?: string,
): Promise<Result<ObrDisbursementVoucher[]>> {
  try {
    const validate = await isAccountantValidForDisbursement(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to approve the disbursement vouchers.",
        { requestId, userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const [requestRow] = await db
      .select({
        id: obrRequests.id,
        originatingOfficeId: obrRequests.originatingOfficeId,
        submittedForApproval: obrRequests.submittedForApproval,
      })
      .from(obrRequests)
      .where(eq(obrRequests.id, requestId))
      .limit(1);
    if (!requestRow) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId });
    }
    if (!requestRow.submittedForApproval) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This request has not been submitted for approval yet.",
        { requestId },
      );
    }

    const vouchers = await db
      .select({
        id: obrDisbursementVouchers.id,
        accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,
        fundTypeId: obrDisbursementVouchers.fundTypeId,
        headUserId: obrDisbursementVouchers.headUserId,
      })
      .from(obrDisbursementVouchers)
      .where(eq(obrDisbursementVouchers.requestId, requestId));

    if (vouchers.length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No disbursement vouchers found for this request.",
        { requestId },
      );
    }

    if (vouchers.some(v => v.accountantSigningStatus !== "pending")) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "One or more disbursement vouchers on this request have already been reviewed.",
        { requestId },
      );
    }

    if (status === "approved" && vouchers.some(v => !validatorUtilities.isNotEmpty(v.fundTypeId))) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "A funding source must be assigned to every disbursement voucher before approving.",
        { requestId },
      );
    }

    const mayorSigner = await findFirstUserWithDisbursementPermission(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE);
    const treasurerSigner = await findFirstUserWithDisbursementPermission(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE);
    const headSigner = vouchers[0]?.headUserId
      ? null
      : await findOfficeHeadByOffice(requestRow.originatingOfficeId);

    const actedAt = DateTime.utc().toJSDate();

    await db.transaction(async tx => {
      for (const voucher of vouchers) {
        const updatePayload: Record<string, unknown> = {
          accountantSigningStatus: status,
          accountantReason: validatorUtilities.isNotEmpty(reason) ? reason : null,
          accountantActedAt: actedAt,
          accountantId: user.id,
          accountantName: user.fullName,
          accountantPositionName: user.office.role.name,
        };

        if (status === "approved") {
          if (mayorSigner) {
            updatePayload.mayorId = mayorSigner.id;
            updatePayload.mayorName = mayorSigner.name;
            updatePayload.mayorPositionName = mayorSigner.positionName;
          }
          if (treasurerSigner) {
            updatePayload.treasurerId = treasurerSigner.id;
            updatePayload.treasurerName = treasurerSigner.name;
            updatePayload.treasurerPositionName = treasurerSigner.positionName;
          }
          if (headSigner) {
            updatePayload.headUserId = headSigner.id;
            updatePayload.headUserName = headSigner.name;
            updatePayload.headUserPositionName = headSigner.positionName;
          }
        }

        await tx
          .update(obrDisbursementVouchers)
          .set(updatePayload)
          .where(eq(obrDisbursementVouchers.id, voucher.id));
      }
    });

    if (status === "approved") {
      await checkAndPromoteRequest(requestId);
    }

    const updated: ObrDisbursementVoucher[] = [];
    for (const voucher of vouchers) {
      const dv = await _getDisbursementVoucherById(voucher.id);
      if (dv) updated.push(dv);
    }

    return new Success(updated);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to approve disbursements.", { requestId, userId: user.id }, e);
  }
}

/**
 * @deprecated Use {@link approveDisbursementsForRequest} instead. The `dvId` parameter is treated as `requestId`.
 */
export async function approveDisbursement(
  dvId: string,
  user: User,
  status: "pending" | "approved" | "binned",
  reason?: string,
): Promise<Result<ObrDisbursementVoucher>> {
  const result = await approveDisbursementsForRequest(dvId, user, status, reason);
  if (result instanceof Failure) return result;
  const first = result.value[0];
  if (!first) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve updated disbursement voucher.", { dvId });
  }
  return new Success(first);
}

/**
 * Updates the accountant approval state for all standalone disbursement vouchers in a batch.
 *
 * @description
 * Allows an accountant to approve or reject every headless disbursement voucher in a batch. On approval, auto-fills
 * signer slots and creates ESRE records with cheque numbers when `withCheque` is enabled on the vouchers.
 *
 * On success, wraps the updated disbursement vouchers in a {@link Success}. On permission or validation failure,
 * returns a {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function approveDisbursementsForBatch
 * @param {string} batchId - Identifier grouping standalone disbursement vouchers.
 * @param {User} user - Accountant user performing the approval action.
 * @param {"pending" | "approved" | "binned"} status - Approval status to apply to all vouchers in the batch.
 * @param {string} [reason] - Optional reason for the decision.
 * @returns {Promise<Result<ObrDisbursementVoucher[]>>} Updated disbursement vouchers on success.
 */
export async function approveDisbursementsForBatch(
  batchId: string,
  user: User,
  status: "pending" | "approved" | "binned",
  reason?: string,
): Promise<Result<ObrDisbursementVoucher[]>> {
  try {
    const validate = await isAccountantValidForDisbursement(user);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to approve the disbursement vouchers.",
        { batchId, userId: user.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const vouchers = await db
      .select({
        id: obrDisbursementVouchers.id,
        accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,
        fundTypeId: obrDisbursementVouchers.fundTypeId,
        headUserId: obrDisbursementVouchers.headUserId,
        disbursedBy: obrDisbursementVouchers.disbursedBy,
      })
      .from(obrDisbursementVouchers)
      .where(
        and(
          eq(obrDisbursementVouchers.disbursementBatchId, batchId),
          isNull(obrDisbursementVouchers.requestId),
        ),
      );

    if (vouchers.length === 0) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such standalone disbursement batch found.", { batchId });
    }

    if (vouchers.some(v => v.accountantSigningStatus !== "pending")) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "One or more disbursement vouchers in this batch have already been reviewed.",
        { batchId },
      );
    }

    if (status === "approved" && vouchers.some(v => !validatorUtilities.isNotEmpty(v.fundTypeId))) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "A funding source must be assigned to every disbursement voucher before approving.",
        { batchId },
      );
    }

    const [disburser] = await db
      .select({ officeId: userSchema.officeId })
      .from(userSchema)
      .where(eq(userSchema.id, vouchers[0]!.disbursedBy))
      .limit(1);

    const mayorSigner = await findFirstUserWithDisbursementPermission(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE);
    const treasurerSigner = await findFirstUserWithDisbursementPermission(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE);
    const headSigner = vouchers[0]?.headUserId
      ? null
      : (disburser ? await findOfficeHeadByOffice(disburser.officeId) : null);

    const actedAt = DateTime.utc().toJSDate();

    await db.transaction(async tx => {
      for (const voucher of vouchers) {
        const updatePayload: Record<string, unknown> = {
          accountantSigningStatus: status,
          accountantReason: validatorUtilities.isNotEmpty(reason) ? reason : null,
          accountantActedAt: actedAt,
          accountantId: user.id,
          accountantName: user.fullName,
          accountantPositionName: user.office.role.name,
        };

        if (status === "approved") {
          if (mayorSigner) {
            updatePayload.mayorId = mayorSigner.id;
            updatePayload.mayorName = mayorSigner.name;
            updatePayload.mayorPositionName = mayorSigner.positionName;
          }
          if (treasurerSigner) {
            updatePayload.treasurerId = treasurerSigner.id;
            updatePayload.treasurerName = treasurerSigner.name;
            updatePayload.treasurerPositionName = treasurerSigner.positionName;
          }
          if (headSigner) {
            updatePayload.headUserId = headSigner.id;
            updatePayload.headUserName = headSigner.name;
            updatePayload.headUserPositionName = headSigner.positionName;
          }
        }

        await tx
          .update(obrDisbursementVouchers)
          .set(updatePayload)
          .where(eq(obrDisbursementVouchers.id, voucher.id));
      }

      if (status === "approved") {
        await _createEsreForStandaloneBatch(batchId, tx);
      }
    });

    const updated: ObrDisbursementVoucher[] = [];
    for (const voucher of vouchers) {
      const dv = await _getDisbursementVoucherById(voucher.id);
      if (dv) updated.push(dv);
    }

    return new Success(updated);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to approve standalone disbursements.", { batchId, userId: user.id }, e);
  }
}

/**
 * Creates disbursement vouchers for an OBR request and submits the request for approval.
 *
 * @description
 * Validates that the request requires cheque disbursement, has not yet been submitted for approval, and that every
 * supplied request item belongs to the request. Creates one disbursement voucher row per request item, optionally
 * sharing a single DV number when `oneForAll` is enabled, then marks the request as submitted for approval and
 * publishes the submission event.
 *
 * On success, wraps the created disbursement vouchers in a {@link Success}. On validation failure, returns a
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createDisbursement
 * @param {string} requestId - Identifier of the OBR request to disburse.
 * @param {CreateDisbursementPayload} input - Disbursement creation options and per-item explanations.
 * @param {User} actor - User creating the disbursement vouchers.
 * @returns {Promise<Result<ObrDisbursementVoucher[]>>} Created disbursement vouchers on success.
 *
 * @remarks
 * - Only requests with `submittedForApproval = false` are eligible.
 * - When `oneForAll` is true, creates a single disbursement voucher and one ESRE on approval.
 * - When `oneForAll` is false, creates one voucher per request item with a shared DV base and `-N` suffixes.
 * - `withCheque` is stored on each created voucher and controls ESRE cheque-number assignment on approval.
 */
export async function createDisbursement(
  requestId: string,
  input: CreateDisbursementPayload,
  actor: User,
): Promise<Result<ObrDisbursementVoucher[]>> {
  try {
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to create disbursement vouchers.",
        { requestId, userId: actor.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const withCheque = input.withCheque ?? true;

    const [request] = await db
      .select({
        id: obrRequests.id,
        requestNumber: obrRequests.requestNumber,
        payee: obrRequests.payee,
        officeAddress: obrRequests.officeAddress,
        prNumber: obrRequests.prNumber,
        submittedForApproval: obrRequests.submittedForApproval,
        originatingOfficeId: obrRequests.originatingOfficeId,
      })
      .from(obrRequests)
      .where(eq(obrRequests.id, requestId))
      .limit(1);

    if (!request) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId });
    }
    if (request.originatingOfficeId !== actor.office.id) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such request found.", { requestId });
    }
    if (request.submittedForApproval) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "A disbursement has already been created for this request.",
        { requestId },
      );
    }

    const requestItems = await db
      .select({
        id: obrRequestItems.id,
        particulars: obrRequestItems.particulars,
        amount: obrRequestItems.amount,
        responsibilityCenterId: obrRequestItems.responsibilityCenterId,
      })
      .from(obrRequestItems)
      .where(eq(obrRequestItems.requestId, requestId));

    if (requestItems.length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "This request has no line items.", { requestId });
    }

    const itemIdSet = new Set(requestItems.map(i => i.id));

    if (input.oneForAll) {
      if (!validatorUtilities.isNotEmpty(input.particulars)) {
        return new Failure(ErrorCodes.ValidationFailure, "Particulars are required.", { requestId });
      }
      if (!validatorUtilities.isNotEmpty(input.explanation)) {
        return new Failure(ErrorCodes.ValidationFailure, "An explanation is required.", { requestId });
      }
      if (!validatorUtilities.isNumber(input.grossAmount, false, false)) {
        return new Failure(ErrorCodes.ValidationFailure, "A valid gross amount is required.", { requestId });
      }
      const oneForAllTaxType = parseTaxType(input.taxType);
      if (validatorUtilities.isNotEmpty(input.taxType) && !oneForAllTaxType) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid tax type.", { requestId });
      }
      if (validatorUtilities.isExisty(input.vatableAmount) && !validatorUtilities.isNumber(input.vatableAmount, false, false)) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid vatable amount.", { requestId });
      }
    } else {
      if (input.items.length !== requestItems.length) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "An entry is required for every request item.",
          { requestId },
        );
      }
      for (const entry of input.items) {
        if (!itemIdSet.has(entry.requestItemId)) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "One or more request items do not belong to this request.",
            { requestId, requestItemId: entry.requestItemId },
          );
        }
        if (!validatorUtilities.isNotEmpty(entry.explanation)) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "Each disbursement item requires an explanation.",
            { requestId, requestItemId: entry.requestItemId },
          );
        }
        const entryTaxType = parseTaxType(entry.taxType);
        if (validatorUtilities.isNotEmpty(entry.taxType) && !entryTaxType) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "Invalid tax type.",
            { requestId, requestItemId: entry.requestItemId },
          );
        }
        if (validatorUtilities.isExisty(entry.vatableAmount) && !validatorUtilities.isNumber(entry.vatableAmount, false, false)) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "Invalid vatable amount.",
            { requestId, requestItemId: entry.requestItemId },
          );
        }
      }
    }

    const itemPayloadById = new Map(input.items.map(i => [i.requestItemId, i]));
    const createdIds: string[] = [];
    const batchId = uuidv7();

    const approverPositions = await db
      .select({ positionId: obrRequestApprovers.positionId })
      .from(obrRequestApprovers)
      .where(eq(obrRequestApprovers.requestId, requestId));

    await db.transaction(async tx => {
      const baseSequence = await _getNextDisbursementVoucherSequence(tx);
      const baseDvNumber = String(baseSequence);

      if (input.oneForAll) {
        const oneForAllTaxType = parseTaxType(input.taxType);
        const [created] = await tx
          .insert(obrDisbursementVouchers)
          .values({
            disbursementVoucherNumber: baseDvNumber,
            payee: request.payee,
            address: request.officeAddress,
            particulars: input.particulars!,
            explanation: input.explanation!,
            isOneForAll: true,
            withCheque,
            disbursementBatchId: batchId,
            grossAmount: casts.castToDecimal(input.grossAmount!),
            ...(oneForAllTaxType ? { taxType: oneForAllTaxType } : {}),
            ...(validatorUtilities.isNumber(input.vatableAmount, false, false)
              ? { vatableAmount: casts.castToDecimal(input.vatableAmount!) }
              : {}),
            responsibilityCenterId: requestItems[0]!.responsibilityCenterId,
            requestId: request.id,
            disbursedBy: actor.id,
            status: "PREPARATION",
            accountantSigningStatus: "pending",
            ...(validatorUtilities.isNotEmpty(request.prNumber) ? { prNumber: request.prNumber } : {}),
          })
          .returning({ id: obrDisbursementVouchers.id });

        createdIds.push(created!.id);
      } else {
        const isMulti = requestItems.length > 1;

        for (let idx = 0; idx < requestItems.length; idx++) {
          const item = requestItems[idx]!;
          const entry = itemPayloadById.get(item.id)!;
          const dvNumber = isMulti ? `${baseDvNumber}-${idx + 1}` : baseDvNumber;
          const entryTaxType = parseTaxType(entry.taxType);

          const [created] = await tx
            .insert(obrDisbursementVouchers)
            .values({
              disbursementVoucherNumber: dvNumber,
              payee: request.payee,
              address: request.officeAddress,
              particulars: item.particulars,
              explanation: entry.explanation,
              isOneForAll: false,
              withCheque,
              disbursementBatchId: batchId,
              grossAmount: item.amount,
              ...(entryTaxType ? { taxType: entryTaxType } : {}),
              ...(validatorUtilities.isNumber(entry.vatableAmount, false, false)
                ? { vatableAmount: casts.castToDecimal(entry.vatableAmount!) }
                : {}),
              responsibilityCenterId: item.responsibilityCenterId,
              requestId: request.id,
              requestItemId: item.id,
              disbursedBy: actor.id,
              status: "PREPARATION",
              accountantSigningStatus: "pending",
              ...(validatorUtilities.isNotEmpty(request.prNumber) ? { prNumber: request.prNumber } : {}),
            })
            .returning({ id: obrDisbursementVouchers.id });

          createdIds.push(created!.id);
        }
      }

      await tx
        .update(obrRequests)
        .set({ submittedForApproval: true })
        .where(eq(obrRequests.id, requestId));
    });

    await publishEvent({
      type: "obr.request.submitted",
      payload: {
        requestId: request.id,
        requestNumber: request.requestNumber,
        officeId: request.originatingOfficeId,
        actorName: actor.fullName,
        approverPositionIds: approverPositions.map(p => p.positionId),
      },
    });

    const createdVouchers: ObrDisbursementVoucher[] = [];
    for (const id of createdIds) {
      const dv = await _getDisbursementVoucherById(id);
      if (dv) createdVouchers.push(dv);
    }

    return new Success(createdVouchers);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create disbursement.", { requestId, userId: actor.id }, e);
  }
}

/**
 * Creates standalone disbursement vouchers that are not linked to an OBR request.
 *
 * @description
 * Validates disbursement write access, then creates one or more disbursement voucher rows from user-supplied
 * explanations and amounts. When multiple explanations are provided, DV numbers use a shared base with `-N`
 * suffixes; a single explanation uses the base number without a suffix. Standalone disbursements enter the
 * accountant approval queue immediately.
 *
 * On success, wraps the created disbursement vouchers in a {@link Success}. On validation failure, returns a
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createStandaloneDisbursement
 * @param {CreateStandaloneDisbursementPayload} input - Standalone disbursement header fields and line items.
 * @param {User} actor - User creating the disbursement vouchers.
 * @returns {Promise<Result<ObrDisbursementVoucher[]>>} Created disbursement vouchers on success.
 *
 * @remarks
 * - `withCheque` controls whether ESRE rows receive auto-assigned cheque numbers on accountant approval.
 * - Multiple line items share one DV sequence base with `-1`, `-2`, … suffixes.
 */
export async function createStandaloneDisbursement(
  input: CreateStandaloneDisbursementPayload,
  actor: User,
): Promise<Result<ObrDisbursementVoucher[]>> {
  try {
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to create standalone disbursement vouchers.",
        { userId: actor.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    if (!validatorUtilities.isNotEmpty(input.payee)) {
      return new Failure(ErrorCodes.ValidationFailure, "Payee is required.", { userId: actor.id });
    }
    if (!validatorUtilities.isNotEmpty(input.officeAddress)) {
      return new Failure(ErrorCodes.ValidationFailure, "Office address is required.", { userId: actor.id });
    }
    if (!validatorUtilities.isUuid(input.responsibilityCenterId)) {
      return new Failure(ErrorCodes.ValidationFailure, "A valid responsibility center is required.", { userId: actor.id });
    }
    if (input.items.length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "At least one explanation line is required.", { userId: actor.id });
    }

    for (const item of input.items) {
      if (!validatorUtilities.isNotEmpty(item.particulars)) {
        return new Failure(ErrorCodes.ValidationFailure, "Each line requires particulars.", { userId: actor.id });
      }
      if (!validatorUtilities.isNotEmpty(item.explanation)) {
        return new Failure(ErrorCodes.ValidationFailure, "Each line requires an explanation.", { userId: actor.id });
      }
      if (!validatorUtilities.isNumber(item.grossAmount, false, false)) {
        return new Failure(ErrorCodes.ValidationFailure, "Each line requires a valid gross amount.", { userId: actor.id });
      }
      const itemTaxType = parseTaxType(item.taxType);
      if (validatorUtilities.isNotEmpty(item.taxType) && !itemTaxType) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid tax type.", { userId: actor.id });
      }
      if (validatorUtilities.isExisty(item.vatableAmount) && !validatorUtilities.isNumber(item.vatableAmount, false, false)) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid vatable amount.", { userId: actor.id });
      }
    }

    const [rc] = await db
      .select({ id: officeCodes.id })
      .from(officeCodes)
      .where(eq(officeCodes.id, input.responsibilityCenterId))
      .limit(1);
    if (!rc) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid responsibility center.", { userId: actor.id });
    }

    const withCheque = input.withCheque ?? true;
    const batchId = uuidv7();
    const createdIds: string[] = [];
    const isMulti = input.items.length > 1;

    await db.transaction(async tx => {
      const baseSequence = await _getNextDisbursementVoucherSequence(tx);
      const baseDvNumber = String(baseSequence);

      for (let idx = 0; idx < input.items.length; idx++) {
        const item = input.items[idx]!;
        const dvNumber = isMulti ? `${baseDvNumber}-${idx + 1}` : baseDvNumber;
        const itemTaxType = parseTaxType(item.taxType);

        const [created] = await tx
          .insert(obrDisbursementVouchers)
          .values({
            disbursementVoucherNumber: dvNumber,
            payee: input.payee!,
            address: input.officeAddress,
            particulars: item.particulars,
            explanation: item.explanation,
            isOneForAll: false,
            withCheque,
            disbursementBatchId: batchId,
            grossAmount: casts.castToDecimal(item.grossAmount),
            ...(itemTaxType ? { taxType: itemTaxType } : {}),
            ...(validatorUtilities.isNumber(item.vatableAmount, false, false)
              ? { vatableAmount: casts.castToDecimal(item.vatableAmount!) }
              : {}),
            responsibilityCenterId: input.responsibilityCenterId,
            disbursedBy: actor.id,
            status: "PREPARATION",
            accountantSigningStatus: "pending",
            ...(validatorUtilities.isNotEmpty(input.prNumber) ? { prNumber: input.prNumber } : {}),
          })
          .returning({ id: obrDisbursementVouchers.id });

        createdIds.push(created!.id);
      }
    });

    const createdVouchers: ObrDisbursementVoucher[] = [];
    for (const id of createdIds) {
      const dv = await _getDisbursementVoucherById(id);
      if (dv) createdVouchers.push(dv);
    }

    return new Success(createdVouchers);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create standalone disbursement.", { userId: actor.id }, e);
  }
}

/**
 * Lists OBR requests that are awaiting disbursement creation.
 *
 * @description
 * Returns requests that have not yet been submitted for approval because no disbursement vouchers have been created.
 *
 * On success, wraps the request summaries in a {@link Success}. On permission failure, returns a {@link Failure}.
 * On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function listRequestsPendingDisbursement
 * @param {User} actor - User attempting to list pending disbursement requests.
 * @returns {Promise<Result<ObrRequestSummaryType[]>>} Pending disbursement request summaries on success.
 */
export async function listRequestsPendingDisbursement(
  actor: User,
): Promise<Result<ObrRequestSummaryType[]>> {
  try {
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to list requests pending disbursement.",
        { userId: actor.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const all = await _getAllObrRequestAsSummaries(
      and(
        eq(obrRequests.submittedForApproval, false),
        eq(obrRequests.originatingOfficeId, actor.office.id),
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
    return new Failure(ErrorCodes.Fatal, "Unable to list requests pending disbursement.", { userId: actor.id }, e);
  }
}

/**
 * Updates editable header fields on an OBR request and propagates them to pending disbursement vouchers.
 *
 * @description
 * Allows a budget officer to edit request header fields while the request has not been promoted and no disbursement
 * voucher on the request has been accountant-approved. Header changes are mirrored to all non-approved disbursement
 * vouchers linked to the request.
 *
 * On success, wraps the updated OBR request in a {@link Success}. On permission, validation, or not-found failure,
 * returns a {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateObrRequestHeader
 * @param {string} requestId - Identifier of the OBR request to update.
 * @param {UpdateObrRequestHeaderPayload} payload - Header fields to update.
 * @param {User} actor - User attempting to update the request header.
 * @returns {Promise<Result<ObrRequestType>>} Updated OBR request on success.
 */
export async function updateObrRequestHeader(
  requestId: string,
  payload: UpdateObrRequestHeaderPayload,
  actor: User,
): Promise<Result<ObrRequestType>> {
  try {
    const validate = await isBudgetOfficerValidForRequestEdit(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to update the request header.",
        { requestId, userId: actor.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    if (await isRequestPromoted(requestId)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This request has already been promoted and can no longer be edited.",
        { requestId },
      );
    }

    if (await _hasApprovedDisbursementForRequest(requestId)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "The disbursement for this request has already been approved and can no longer be edited.",
        { requestId },
      );
    }

    const updatePayload = {
      ...(validatorUtilities.isNotEmpty(payload.payee) ? { payee: payload.payee! } : {}),
      ...(validatorUtilities.isNotEmpty(payload.officeAddress) ? { officeAddress: payload.officeAddress! } : {}),
      ...(validatorUtilities.isNotEmpty(payload.obrNumber) ? { obrNumber: payload.obrNumber! } : {}),
      ...(validatorUtilities.isNotEmpty(payload.prNumber) ? { prNumber: payload.prNumber! } : {}),
    };
    if (Object.keys(updatePayload).length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "No updatable fields provided.", { requestId, payload });
    }

    await db.transaction(async tx => {
      await tx
        .update(obrRequests)
        .set(updatePayload)
        .where(eq(obrRequests.id, requestId));

      const dvUpdate: Record<string, unknown> = {};
      if (updatePayload.payee !== undefined) dvUpdate.payee = updatePayload.payee;
      if (updatePayload.officeAddress !== undefined) dvUpdate.address = updatePayload.officeAddress;
      if (updatePayload.prNumber !== undefined) dvUpdate.prNumber = updatePayload.prNumber;

      if (Object.keys(dvUpdate).length > 0) {
        await tx
          .update(obrDisbursementVouchers)
          .set(dvUpdate)
          .where(
            and(
              eq(obrDisbursementVouchers.requestId, requestId),
              eq(obrDisbursementVouchers.accountantSigningStatus, "pending"),
            ),
          );
      }
    });

    const updated = await getObrRequestById(requestId, actor);
    if (updated instanceof Failure) return updated;
    return updated;
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update request header.", { requestId, userId: actor.id }, e);
  }
}

/**
 * Lists all approved OBR requests that are eligible for OBR main data creation.
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
 * Validates an OBR template type from client input.
 *
 * @param {unknown} type - Raw template type.
 * @returns {Result<ObrTemplateType>} Parsed type or validation failure.
 */
export function parseObrTemplateType(type: unknown): Result<ObrTemplateType> {
  if (type !== "header" && type !== "footer") {
    return new Failure(
      ErrorCodes.ValidationFailure,
      "Invalid template type. Must be 'header' or 'footer'.",
    );
  }
  return new Success(type);
}

/**
 * Returns header and footer templates for OBR form export.
 *
 * @description
 * Fetches template metadata for the OBR form export identifier and maps missing template slots to `null`
 * so clients can render upload/replace actions without treating empty slots as errors.
 *
 * @async
 * @function getObrFormTemplates
 * @returns {Promise<Result<ObrTemplatesBundle>>} Combined header/footer metadata or failure.
 */
export async function getObrFormTemplates(): Promise<Result<ObrTemplatesBundle>> {
  return _fetchObrTemplatesBundle(OBR_FORM_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header template for OBR form export.
 *
 * @description
 * Persists a `.xlsx` template to the shared template bucket under the OBR form identifier. The bucket
 * enforces a single template per `(identifier, type)` pair; callers should use `modifyObrFormTemplate`
 * when replacing an existing template.
 *
 * @async
 * @function uploadObrFormTemplate
 * @param {ObrTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<ObrTemplateInfo>>} Template metadata on success, or a failure result.
 */
export async function uploadObrFormTemplate(
  input: ObrTemplateUploadInput,
): Promise<Result<ObrTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: OBR_FORM_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });

  if (result instanceof Success) {
    return new Success(_mapObrTemplate(result.value));
  }

  return result;
}

/**
 * Replaces an existing header template for OBR form export.
 *
 * @description
 * Writes a new template workbook and updates the template bucket metadata for the OBR form identifier.
 * Returns a not-found failure when no existing template slot exists for the requested type.
 *
 * @async
 * @function modifyObrFormTemplate
 * @param {ObrTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<ObrTemplateInfo>>} Updated template metadata on success, or a failure result.
 */
export async function modifyObrFormTemplate(
  input: ObrTemplateUploadInput,
): Promise<Result<ObrTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: OBR_FORM_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });

  if (result instanceof Success) {
    return new Success(_mapObrTemplate(result.value));
  }

  return result;
}

/**
 * Removes a header template for OBR form export.
 *
 * @description
 * Deletes the template bucket record (and backing file) for the requested slot under the OBR form
 * identifier. Returns a not-found failure when no template exists for the slot.
 *
 * @async
 * @function removeObrFormTemplate
 * @param {ObrTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or failure.
 */
export async function removeObrFormTemplate(type: ObrTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: OBR_FORM_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Returns header and footer templates for disbursement voucher form export.
 *
 * @description
 * Fetches template metadata for the disbursement voucher export identifier and maps missing template slots to `null`
 * so clients can render upload/replace actions without treating empty slots as errors.
 *
 * @async
 * @function getObrDvFormTemplates
 * @returns {Promise<Result<ObrTemplatesBundle>>} Combined header/footer metadata or failure.
 */
export async function getObrDvFormTemplates(): Promise<Result<ObrTemplatesBundle>> {
  return _fetchObrTemplatesBundle(OBR_DV_FORM_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header template for disbursement voucher export.
 *
 * @description
 * Persists a `.xlsx` template to the shared template bucket under the disbursement voucher export identifier.
 * The bucket enforces a single template per `(identifier, type)` pair; callers should use
 * `modifyObrDvFormTemplate` when replacing an existing template.
 *
 * @async
 * @function uploadObrDvFormTemplate
 * @param {ObrTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<ObrTemplateInfo>>} Template metadata on success, or a failure result.
 */
export async function uploadObrDvFormTemplate(
  input: ObrTemplateUploadInput,
): Promise<Result<ObrTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: OBR_DV_FORM_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });

  if (result instanceof Success) {
    return new Success(_mapObrTemplate(result.value));
  }

  return result;
}

/**
 * Replaces an existing header template for disbursement voucher export.
 *
 * @description
 * Writes a new template workbook and updates the template bucket metadata for the disbursement voucher export
 * identifier. Returns a not-found failure when no existing template slot exists for the requested type.
 *
 * @async
 * @function modifyObrDvFormTemplate
 * @param {ObrTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<ObrTemplateInfo>>} Updated template metadata on success, or a failure result.
 */
export async function modifyObrDvFormTemplate(
  input: ObrTemplateUploadInput,
): Promise<Result<ObrTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: OBR_DV_FORM_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });

  if (result instanceof Success) {
    return new Success(_mapObrTemplate(result.value));
  }

  return result;
}

/**
 * Removes a header template for disbursement voucher export.
 *
 * @description
 * Deletes the template bucket record (and backing file) for the requested slot under the disbursement voucher export
 * identifier. Returns a not-found failure when no template exists for the slot.
 *
 * @async
 * @function removeObrDvFormTemplate
 * @param {ObrTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or failure.
 */
export async function removeObrDvFormTemplate(type: ObrTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: OBR_DV_FORM_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Exports an OBR request form to an XLSX buffer.
 *
 * @description
 * Validates request read access by reusing {@link getObrRequestById}, loads the optional uploaded OBR header
 * template, and generates a formatted workbook matching the printable OBR form layout.
 *
 * On success, wraps the XLSX bytes in a {@link Success}. On access, validation, or template-storage errors,
 * returns a {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function exportObrRequestFormToBuffer
 * @param {string} requestId - Identifier of the OBR request to export.
 * @param {User} user - User requesting the export.
 * @returns {Promise<Result<Buffer>>} Workbook bytes on success, or a failure result.
 */
export async function exportObrRequestFormToBuffer(requestId: string, user: User): Promise<Result<Buffer>> {
  try {
    const requestResult = await getObrRequestById(requestId, user);
    if (requestResult instanceof Failure) return requestResult;

    const headerPathResult = await _getTemplatePath(OBR_FORM_TEMPLATE_IDENTIFIER, "header");
    if (headerPathResult instanceof Failure) return headerPathResult;

    const buffer = await _buildObrFormExcelBuffer(requestResult.value, headerPathResult.value);
    return new Success(buffer);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Failed to export OBR request form.",
      { requestId, userId: user.id },
      e,
    );
  }
}

/**
 * Exports an OBR disbursement voucher form to an XLSX buffer.
 *
 * @description
 * Validates disbursement write access, loads the requested disbursement voucher, includes optional electronic billing
 * rows when available, loads the optional uploaded disbursement-voucher header template, and generates a formatted
 * workbook matching the printable DV form layout.
 *
 * On success, wraps the XLSX bytes in a {@link Success}. On access, validation, lookup, or template-storage errors,
 * returns a {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function exportDisbursementVoucherToBuffer
 * @param {string} id - Identifier of the disbursement voucher to export.
 * @param {User} actor - User requesting the export.
 * @returns {Promise<Result<Buffer>>} Workbook bytes on success, or a failure result.
 */
export async function exportDisbursementVoucherToBuffer(id: string, actor: User): Promise<Result<Buffer>> {
  try {
    const validate = await isWriterUserValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to export the object you requested.",
        { id, userId: actor.id },
        validate.stack ? validate.stack : undefined,
      );
    }

    const voucher = await _getDisbursementVoucherById(id);
    if (!voucher) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such disbursement voucher found.",
        { id, userId: actor.id },
      );
    }

    const headerPathResult = await _getTemplatePath(OBR_DV_FORM_TEMPLATE_IDENTIFIER, "header");
    if (headerPathResult instanceof Failure) return headerPathResult;

    const elecData = voucher.hasElecData
      ? await _getElecDataForVoucher(voucher.id)
      : [];

    const buffer = await _buildDisbursementVoucherExcelBuffer(voucher, elecData, headerPathResult.value);
    return new Success(buffer);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Failed to export disbursement voucher form.",
      { id, userId: actor.id },
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
    const validate = await isWriterOrAccountantValidForDisbursement(actor);
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
        requestItemId: obrDisbursementVouchers.requestItemId,
        accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,

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

    if (ref.accountantSigningStatus === "approved") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This disbursement voucher has already been approved and can no longer be edited.",
        { id, payload, userId: actor.id },
      );
    }

    const updatePayload = {
      ...(validatorUtilities.isNotEmpty(payload.particulars) ? { particulars: payload.particulars! } : {}),
      ...(validatorUtilities.isNotEmpty(payload.explanation) ? { explanation: payload.explanation! } : {}),
      ...(validatorUtilities.isNumber(payload.grossAmount) ? { grossAmount: casts.castToDecimal(payload.grossAmount!) } : {}),
      ...(validatorUtilities.isNumber(payload.vatableAmount) ? { vatableAmount: casts.castToDecimal(payload.vatableAmount!) } : {}),
      ...(validatorUtilities.isNotEmpty(payload.taxType) ? { taxType: payload.taxType as TaxType } : {}),
      ...(validatorUtilities.isNotEmpty(payload.fundTypeId) ? { fundTypeId: payload.fundTypeId } : {}),
      ...(validatorUtilities.isNotEmpty(payload.status) ? { status: payload.status as DisbursementStatus } : {}),
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

      const [updated] = await tx
        .update(obrDisbursementVouchers)
        .set({
          ...updatePayload,
          ...(validatorUtilities.isExisty(fundType) ? { fundTypeId: fundType!.id } : {}),
        })
        .where(eq(obrDisbursementVouchers.id, ref.id))
        .returning();

      const requestItemUpdate: Record<string, unknown> = {};
      if (updatePayload.particulars) requestItemUpdate.particulars = updatePayload.particulars;
      if (updatePayload.grossAmount) requestItemUpdate.amount = updatePayload.grossAmount;
      if (Object.keys(requestItemUpdate).length > 0 && validatorUtilities.isNotEmpty(ref.requestItemId)) {
        await tx
          .update(obrRequestItems)
          .set(requestItemUpdate)
          .where(eq(obrRequestItems.id, ref.requestItemId!));
      }

      return [updated];
    });

    return new Success({
      id: result.id,
      disbursementVoucherNumber: result.disbursementVoucherNumber,
      createdAt: result.createdAt,
      payee: result.payee,
      address: result.address,
      particulars: result.particulars,
      explanation: validatorUtilities.isNotEmpty(result.explanation) ? result.explanation : null,
      isOneForAll: result.isOneForAll,
      withCheque: result.withCheque,
      disbursementBatchId: result.disbursementBatchId,
      requestId: result.requestId,
      requestItemId: result.requestItemId,
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
        accountant: mapSignerField(result.accountantId, result.accountantName, result.accountantPositionName),
        treasurer: mapSignerField(result.treasurerId, result.treasurerName, result.treasurerPositionName),
        mayor: mapSignerField(result.mayorId, result.mayorName, result.mayorPositionName),
        headOfOffice: mapSignerField(result.headUserId, result.headUserName, result.headUserPositionName),
      },
      accountantSigningStatus: result.accountantSigningStatus,
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

async function _getDisbursementVoucherById(id: string): Promise<ObrDisbursementVoucher | null> {
  const [hasElecData] = await db
    .select({ voucherId: obrDisbursementElectronic.voucherId })
    .from(obrDisbursementElectronic)
    .where(eq(obrDisbursementElectronic.voucherId, id))
    .limit(1);

  const [ref] = await db
    .select({
      id: obrDisbursementVouchers.id,
      disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
      payee: obrDisbursementVouchers.payee,
      address: obrDisbursementVouchers.address,
      particulars: obrDisbursementVouchers.particulars,
      explanation: obrDisbursementVouchers.explanation,
      isOneForAll: obrDisbursementVouchers.isOneForAll,
      withCheque: obrDisbursementVouchers.withCheque,
      disbursementBatchId: obrDisbursementVouchers.disbursementBatchId,
      requestId: obrDisbursementVouchers.requestId,
      requestItemId: obrDisbursementVouchers.requestItemId,
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
      accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,

      treasurerId: obrDisbursementVouchers.treasurerId,
      treasurerName: obrDisbursementVouchers.treasurerName,
      treasurerPositionName: obrDisbursementVouchers.treasurerPositionName,

      mayorId: obrDisbursementVouchers.mayorId,
      mayorName: obrDisbursementVouchers.mayorName,
      mayorPositionName: obrDisbursementVouchers.mayorPositionName,

      fundTypeId: fundTypes.id,
      fundTypeName: fundTypes.name,
      fundTypeDescription: fundTypes.description,
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
    .where(eq(obrDisbursementVouchers.id, id))
    .limit(1);

  if (!ref) {
    return null;
  }

  return {
    id: ref.id,
    disbursementVoucherNumber: ref.disbursementVoucherNumber,
    createdAt: ref.createdAt,
    payee: ref.payee,
    address: ref.address,
    particulars: ref.particulars,
    explanation: validatorUtilities.isNotEmpty(ref.explanation) ? ref.explanation : null,
    isOneForAll: ref.isOneForAll,
    withCheque: ref.withCheque,
    disbursementBatchId: ref.disbursementBatchId,
    requestId: ref.requestId,
    requestItemId: ref.requestItemId,
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
      accountant: mapSignerField(ref.accountantId, ref.accountantName, ref.accountantPositionName),
      treasurer: mapSignerField(ref.treasurerId, ref.treasurerName, ref.treasurerPositionName),
      mayor: mapSignerField(ref.mayorId, ref.mayorName, ref.mayorPositionName),
      headOfOffice: mapSignerField(ref.headUserId, ref.headUserName, ref.headUserPositionName),
    },
    accountantSigningStatus: ref.accountantSigningStatus,
    fundType: validatorUtilities.isNotEmpty(ref.fundTypeId)
      ? { id: ref.fundTypeId!, name: ref.fundTypeName!, description: ref.fundTypeDescription! }
      : null,
    status: validatorUtilities.isNotEmpty(ref.status) ? ref.status : null,
    prNumber: validatorUtilities.isNotEmpty(ref.prNumber) ? ref.prNumber : null,
    hasElecData: !!hasElecData,
  } satisfies ObrDisbursementVoucher;
}

async function _getElecDataForVoucher(voucherId: string): Promise<Array<ObrDisbursementElectronicItem>> {
  const rows = await db
    .select({
      id: obrDisbursementElectronic.id,
      billingName: obrDisbursementElectronic.billingName,
      meterSerial: obrDisbursementElectronic.meterSerial,
      account: obrDisbursementElectronic.account,
      gross: obrDisbursementElectronic.gross,
      vatableSales: obrDisbursementElectronic.vatableSales,
      taxType: obrDisbursementElectronic.taxType,
    })
    .from(obrDisbursementElectronic)
    .where(eq(obrDisbursementElectronic.voucherId, voucherId))
    .orderBy(asc(obrDisbursementElectronic.createdAt));

  return rows.map(row => ({
    id: row.id,
    billingName: row.billingName,
    meterSerial: row.meterSerial,
    account: row.account,
    gross: row.gross,
    vatableSales: row.vatableSales,
    taxType: row.taxType,
  }));
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
 * @param {User} actor - User requesting disbursement vouchers.
 * @returns {Promise<Result<Array<ObrDisbursementVoucher>>>} A result wrapper containing all disbursement vouchers on
 *                                                           success, or a failure result on error.
 *
 * @remarks
 * - Includes responsibility-center information for each voucher.
 * - Includes accountant, treasurer, mayor, and head-of-office signer details.
 * - Includes fund type information when assigned.
 * - Tax breakdowns are computed from each voucher's saved values.
 */
export async function getAllDisbursementVouchers(actor: User): Promise<Result<Array<ObrDisbursementVoucher>>> {
  try {
    const validate = await isWriterOrAccountantValidForDisbursement(actor);
    if (validate?.error) {
      return new Failure(
        validate.error,
        "Unable to fetch disbursement items",
        { userId: actor.id },
        validate.stack ? validate.stack : undefined,
      );
    }

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
        explanation: obrDisbursementVouchers.explanation,
        isOneForAll: obrDisbursementVouchers.isOneForAll,
        withCheque: obrDisbursementVouchers.withCheque,
        disbursementBatchId: obrDisbursementVouchers.disbursementBatchId,
        requestId: obrDisbursementVouchers.requestId,
        requestItemId: obrDisbursementVouchers.requestItemId,
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
        accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,

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
      )
      .where(eq(user.officeId, actor.office.id));

    return new Success(all.map(ref => ({
      id: ref.id,
      disbursementVoucherNumber: ref.disbursementVoucherNumber,
      createdAt: ref.createdAt,
      payee: ref.payee,
      address: ref.address,
      particulars: ref.particulars,
      explanation: validatorUtilities.isNotEmpty(ref.explanation) ? ref.explanation : null,
      isOneForAll: ref.isOneForAll,
      withCheque: ref.withCheque,
      disbursementBatchId: ref.disbursementBatchId,
      requestId: ref.requestId,
      requestItemId: ref.requestItemId,
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
        accountant: mapSignerField(ref.accountantId, ref.accountantName, ref.accountantPositionName),
        treasurer: mapSignerField(ref.treasurerId, ref.treasurerName, ref.treasurerPositionName),
        mayor: mapSignerField(ref.mayorId, ref.mayorName, ref.mayorPositionName),
        headOfOffice: mapSignerField(ref.headUserId, ref.headUserName, ref.headUserPositionName),
      },
      accountantSigningStatus: ref.accountantSigningStatus,
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
 * Retrieves OBR items for the actor's originating office.
 *
 * @description
 * Fetches OBR item records linked to requests from the actor's office, resolves related requesting official and
 * publisher users, loads associated office-item amount entries with responsibility-center and expense-code details,
 * groups those entries by OBR item, and computes each item's overall amount.
 *
 * On success, wraps the mapped OBR items in a {@link Success}. If no OBR items exist for the office, returns an empty
 * success list. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function getObrItems
 * @param {User} actor - User requesting the OBR item list; results are limited to this user's office.
 * @returns {Promise<Result<ObrItem[]>>} A result wrapper containing OBR items on success, or a failure result on error.
 *
 * @remarks
 * - Each returned item includes its amount breakdown entries.
 * - Overall amounts are computed from the item's associated office-item amounts.
 * - Missing user details are represented with fallback `"Unknown"` values.
 * - Items are scoped by the parent request's `originatingOfficeId`.
 */
export async function getObrItems(actor: User): Promise<Result<ObrItem[]>> {
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
      )
      .where(eq(obrRequests.originatingOfficeId, actor.office.id));

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
    const isMulti = payload.items.length > 1;

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

    // Bulk-validate responsibility centers and expense codes across all items
    const uniqueRcIds = [...new Set(payload.items.map(i => i.responsibilityCenterId))];
    const uniqueEcIds = [...new Set(payload.items.map(i => i.expenseCodeId))];

    const rcRows = await db
      .select({ id: officeCodes.id })
      .from(officeCodes)
      .where(inArray(officeCodes.id, uniqueRcIds));
    const rcSet = new Set(rcRows.map(r => r.id));

    const ecRows = await db
      .select({ id: expenseClasses.id, class: expenseClasses.class })
      .from(expenseClasses)
      .where(inArray(expenseClasses.id, uniqueEcIds));
    const ecClassMap = new Map(ecRows.map(r => [r.id, r.class ?? ""]));

    for (let i = 0; i < payload.items.length; i++) {
      const item = payload.items[i]!;
      if (!rcSet.has(item.responsibilityCenterId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          `Invalid responsibility center in item ${i + 1}.`,
          { responsibilityCenterId: item.responsibilityCenterId },
        );
      }
      if (!ecClassMap.has(item.expenseCodeId)) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          `Invalid expense code in item ${i + 1}.`,
          { expenseCodeId: item.expenseCodeId },
        );
      }
    }

    // Bulk-validate SAAOB entries
    const uniqueSaaobIds = [
      ...new Set(
        payload.items
          .filter(i => validatorUtilities.isUuid(i.saaobId))
          .map(i => i.saaobId!),
      ),
    ];
    if (uniqueSaaobIds.length > 0) {
      const saaobRows = await db
        .select({ id: saaobEntries.id })
        .from(saaobEntries)
        .where(inArray(saaobEntries.id, uniqueSaaobIds));
      const saaobSet = new Set(saaobRows.map(r => r.id));
      for (let i = 0; i < payload.items.length; i++) {
        const item = payload.items[i]!;
        if (validatorUtilities.isUuid(item.saaobId) && !saaobSet.has(item.saaobId!)) {
          return new Failure(ErrorCodes.ValidationFailure, `Invalid SAAOB entry in item ${i + 1}.`, { saaobId: item.saaobId });
        }
      }
    }

    // Bulk-validate and resolve AIP references across all items
    const aipRefMap = new Map<string, { id: string; code: string; description: string }>();
    const allAipIds = [
      ...new Set(payload.items.flatMap(i => (i.aipReferences ?? []).map(a => a.aipId))),
    ];
    if (allAipIds.length > 0) {
      const refs = await db
        .select({ id: aipReferences.id, code: aipReferences.aipReferenceCode, description: aipReferences.description })
        .from(aipReferences)
        .where(inArray(aipReferences.id, allAipIds));
      for (const ref of refs) {
        aipRefMap.set(ref.id, { id: ref.id, code: ref.code, description: ref.description });
      }
      for (let i = 0; i < payload.items.length; i++) {
        for (const aip of (payload.items[i]?.aipReferences ?? [])) {
          if (!aipRefMap.has(aip.aipId)) {
            return new Failure(
              ErrorCodes.ValidationFailure,
              `Invalid AIP reference in item ${i + 1}.`,
              { aipId: aip.aipId },
            );
          }
        }
      }
    }

    const now = DateTime.now().setZone("Asia/Manila");
    const yy = now.toFormat("yy");
    const mm = now.toFormat("MM");

    const createdIds = await db.transaction(async tx => {
      const mainDataValues = payload.items.map((item, idx) => {
        const obrNumber = isMulti ? `${payload.obrNumber}-${idx + 1}` : payload.obrNumber;
        const expenseClass = ecClassMap.get(item.expenseCodeId) ?? "";
        const alobs = [expenseClass, yy, mm, obrNumber].join("-");

        return {
          obrNumber,
          alobs,
          payee: item.payee,
          address: item.address,
          particulars: item.particulars,
          obligated: casts.castToDecimal(item.amount),
          responsibilityCenterId: item.responsibilityCenterId,
          expenseCodeId: item.expenseCodeId,
          authorId: author.id,
          ...(validatorUtilities.isNotEmpty(item.prNumber) ? { prNumber: item.prNumber } : {}),
          ...(validatorUtilities.isNumber(item.prAmount) ? { prAmount: casts.castToDecimal(item.prAmount!) } : {}),
          ...(validatorUtilities.isUuid(item.saaobId) ? { saaobId: item.saaobId } : {}),
          ...(validatorUtilities.isUuid(payload.requestId) ? { requestSourceId: payload.requestId } : {}),
        };
      });

      const inserted = await tx
        .insert(obrMainData)
        .values(mainDataValues)
        .returning({ id: obrMainData.id });

      // Insert AIP references for each item
      const aipValues = inserted.flatMap((row, idx) =>
        (payload.items[idx]?.aipReferences ?? []).map((aip, aipIdx) => ({
          aipReferenceId: aip.aipId,
          aipReferenceCode: aipRefMap.get(aip.aipId)!.code,
          aipDescription: aipRefMap.get(aip.aipId)!.description,
          amount: casts.castToDecimal(aip.amount),
          index: aipIdx,
          obrId: row.id,
        })),
      );
      if (aipValues.length > 0) {
        await tx.insert(obrMainAipReferences).values(aipValues);
      }

      // Propagate OBR number to the linked request (use base obrNumber, not suffixed)
      if (validatorUtilities.isUuid(payload.requestId)) {
        const firstItem = payload.items[0];
        await tx
          .update(obrRequests)
          .set({
            obrNumber: payload.obrNumber,
            ...(validatorUtilities.isNotEmpty(firstItem?.prNumber) ? { prNumber: firstItem!.prNumber } : {}),
          })
          .where(eq(obrRequests.id, payload.requestId!));
      }

      return inserted.map(r => r.id);
    });

    const mapped = await _fetchObrMainDataItems(inArray(obrMainData.id, createdIds));

    if (validatorUtilities.isUuid(payload.requestId)) {
      const [requestInfo] = await db
        .select({
          id: obrRequests.id,
          requestNumber: obrRequests.requestNumber,
          officeId: obrRequests.originatingOfficeId,
        })
        .from(obrRequests)
        .where(eq(obrRequests.id, payload.requestId!))
        .limit(1);

      if (requestInfo) {
        await publishEvent({
          type: "obr.request.main-data-created",
          payload: {
            requestId: requestInfo.id,
            requestNumber: requestInfo.requestNumber,
            officeId: requestInfo.officeId,
            actorName: author.fullName,
          },
        });
      }
    }

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
      .where(
        and(
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
          sql`${officePosition.permissions} @> ARRAY[${filter}]`,
        ),
      );

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
      !permissionSet.has(permissions.OBR_REQUEST_READ) &&
      !permissionSet.has(permissions.OBR_DISBURSEMENT_CREATE) &&
      !permissionSet.has(permissions.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE)
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
function parseTaxType(value: Optional<string>): TaxType | null {
  if (!validatorUtilities.isNotEmpty(value)) return null;
  if (value === "vat-g" || value === "vat-s" || value === "nvat-g" || value === "nvat-s") {
    return value;
  }
  return null;
}

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

async function isAccountantValidForDisbursement(user: User): Promise<null | AccessRequestValidationResult> {
  try {
    const [role] = await db
      .select({ permissions: officePosition.permissions })
      .from(officePosition)
      .where(eq(officePosition.id, user.office.role.id));
    if (!role?.permissions.includes(permissions.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE)) {
      return { error: ErrorCodes.InsufficientPermissions };
    }
    return null;
  } catch (e) {
    return { error: ErrorCodes.Fatal, stack: e };
  }
}

async function isWriterOrAccountantValidForDisbursement(user: User): Promise<null | AccessRequestValidationResult> {
  const writer = await isWriterUserValidForDisbursement(user);
  if (!writer?.error) return null;
  return isAccountantValidForDisbursement(user);
}

async function isBudgetOfficerValidForRequestEdit(user: User): Promise<null | AccessRequestValidationResult> {
  try {
    const [role] = await db
      .select({ permissions: officePosition.permissions })
      .from(officePosition)
      .where(eq(officePosition.id, user.office.role.id));
    if (!role?.permissions.includes(permissions.OBR_APPROVER_BASIC_HIGH_WRITE)) {
      return { error: ErrorCodes.InsufficientPermissions };
    }
    return null;
  } catch (e) {
    return { error: ErrorCodes.Fatal, stack: e };
  }
}

async function isRequestPromoted(requestId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: obrMainData.id })
    .from(obrMainData)
    .where(eq(obrMainData.requestSourceId, requestId))
    .limit(1);
  return !!row;
}

/**
 * Checks whether any disbursement voucher on a request has been accountant-approved.
 *
 * @description
 * Returns true when at least one linked disbursement voucher has `accountantSigningStatus = "approved"`.
 *
 * @async
 * @function _hasApprovedDisbursementForRequest
 * @param {string} requestId - Identifier of the OBR request to inspect.
 * @returns {Promise<boolean>} `true` when an approved disbursement exists for the request.
 */
async function _hasApprovedDisbursementForRequest(requestId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: obrDisbursementVouchers.id })
    .from(obrDisbursementVouchers)
    .where(
      and(
        eq(obrDisbursementVouchers.requestId, requestId),
        eq(obrDisbursementVouchers.accountantSigningStatus, "approved"),
      ),
    )
    .limit(1);
  return !!row;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function _getNextDisbursementVoucherSequence(tx: DbTransaction): Promise<number> {
  const rows = await tx
    .select({ number: obrDisbursementVouchers.disbursementVoucherNumber })
    .from(obrDisbursementVouchers);
  let max = 0;
  for (const row of rows) {
    const parsed = parseInt(row.number, 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}

/**
 * Extracts the base OBR number from a stored value for sequence comparison.
 *
 * Supports plain numbers (`1231`), multi-item suffixes (`1230-3`), and legacy
 * year-prefixed values (`2026-001`, `2026-001-1`).
 */
function parseObrBaseNumber(obrNumber: string): number | null {
  const trimmed = obrNumber.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  const legacyMatch = /^(\d{4})-(\d+)(?:-(\d+))?$/.exec(trimmed);
  if (legacyMatch) {
    const year = Number.parseInt(legacyMatch[1]!, 10);
    if (year >= 2000 && year <= 2099) {
      return Number.parseInt(legacyMatch[2]!, 10);
    }
  }

  const suffixMatch = /^(\d+)-(\d+)$/.exec(trimmed);
  if (suffixMatch) {
    return Number.parseInt(suffixMatch[1]!, 10);
  }

  return null;
}

async function _getNextObrNumberSequence(tx: DbTransaction): Promise<number> {
  const rows = await tx
    .select({ obrNumber: obrMainData.obrNumber })
    .from(obrMainData);
  let max = 0;
  for (const row of rows) {
    const parsed = parseObrBaseNumber(row.obrNumber);
    if (parsed !== null && parsed > max) max = parsed;
  }
  return max + 1;
}

async function _getNextChequeNumberSequence(tx: DbTransaction): Promise<number> {
  const rows = await tx
    .select({ checkNumber: esre.checkNumber })
    .from(esre);
  let max = 0;
  for (const row of rows) {
    if (!validatorUtilities.isNotEmpty(row.checkNumber)) continue;
    const parsed = parseInt(row.checkNumber!, 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}

async function findFirstUserWithApprovalPermission(
  permissionFilter: string,
  officeId?: string,
): Promise<{ id: string; name: string; positionName: string } | null> {
  try {
    const [target] = await db
      .select({
        id: user.id,
        name: user.name,
        positionName: officePosition.name,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(
        and(
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
          sql`${officePosition.permissions} @> ARRAY[${permissionFilter}]`,
          ...(officeId ? [eq(user.officeId, officeId)] : []),
        ),
      )
      .limit(1);
    return target ?? null;
  } catch (e) {
    void new Failure(ErrorCodes.Fatal, "Unable to find approval signer.", { permissionFilter, officeId }, e);
    return null;
  }
}

async function findFirstUserWithDisbursementPermission(
  permissionFilter: string,
): Promise<{ id: string; name: string; positionName: string } | null> {
  try {
    const [target] = await db
      .select({
        id: user.id,
        name: user.name,
        positionName: officePosition.name,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(
        and(
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
          sql`${officePosition.permissions} @> ARRAY[${permissionFilter}]`,
        ),
      )
      .limit(1);
    return target ?? null;
  } catch (e) {
    void new Failure(ErrorCodes.Fatal, "Unable to find disbursement signer.", { permissionFilter }, e);
    return null;
  }
}

async function _createEsreForStandaloneBatch(batchId: string, tx: DbTransaction): Promise<void> {
  const vouchers = await tx
    .select({
      id: obrDisbursementVouchers.id,
      disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
      payee: obrDisbursementVouchers.payee,
      particulars: obrDisbursementVouchers.particulars,
      explanation: obrDisbursementVouchers.explanation,
      grossAmount: obrDisbursementVouchers.grossAmount,
      fundTypeId: obrDisbursementVouchers.fundTypeId,
      withCheque: obrDisbursementVouchers.withCheque,
    })
    .from(obrDisbursementVouchers)
    .where(
      and(
        eq(obrDisbursementVouchers.disbursementBatchId, batchId),
        isNull(obrDisbursementVouchers.requestId),
        eq(obrDisbursementVouchers.accountantSigningStatus, "approved"),
      ),
    );

  if (vouchers.length === 0) return;

  let chequeSequence = 0;
  if (vouchers.some(v => v.withCheque)) {
    chequeSequence = await _getNextChequeNumberSequence(tx);
  }

  for (const dv of vouchers) {
    if (!dv.fundTypeId || !validatorUtilities.isNotEmpty(dv.grossAmount)) continue;

    const checkNumber = dv.withCheque ? String(chequeSequence++) : null;

    await tx.insert(esre).values({
      checkNumber,
      fundingSourceId: dv.fundTypeId,
      dvOrPayrollNumber: dv.disbursementVoucherNumber,
      payee: dv.payee,
      natureOfPayment: validatorUtilities.isNotEmpty(dv.explanation) ? dv.explanation! : dv.particulars,
      amount: casts.castToDecimal(dv.grossAmount!),
      checkStatus: "FOR RELEASE",
    });
  }
}

async function checkAndPromoteRequest(requestId: string): Promise<void> {
  const [request] = await db
    .select({
      id: obrRequests.id,
      requestNumber: obrRequests.requestNumber,
      payee: obrRequests.payee,
      officeAddress: obrRequests.officeAddress,
      prNumber: obrRequests.prNumber,
      originatingOfficeId: obrRequests.originatingOfficeId,
      publisherId: obrRequests.publisherId,
    })
    .from(obrRequests)
    .where(eq(obrRequests.id, requestId))
    .limit(1);
  if (!request) return;

  if (await isRequestPromoted(requestId)) return;

  const approvers = await db
    .select({ status: obrRequestApprovers.status })
    .from(obrRequestApprovers)
    .where(eq(obrRequestApprovers.requestId, requestId));
  if (getSummaryOfStates(approvers) !== "approved") return;

  const requestItems = await db
    .select({
      id: obrRequestItems.id,
      particulars: obrRequestItems.particulars,
      amount: obrRequestItems.amount,
      responsibilityCenterId: obrRequestItems.responsibilityCenterId,
      expenseCodeId: obrRequestItems.expenseCodeId,
    })
    .from(obrRequestItems)
    .where(eq(obrRequestItems.requestId, requestId));

  const disbursements = await db
    .select({
      id: obrDisbursementVouchers.id,
      requestItemId: obrDisbursementVouchers.requestItemId,
      disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
      fundTypeId: obrDisbursementVouchers.fundTypeId,
      particulars: obrDisbursementVouchers.particulars,
      explanation: obrDisbursementVouchers.explanation,
      grossAmount: obrDisbursementVouchers.grossAmount,
      isOneForAll: obrDisbursementVouchers.isOneForAll,
      withCheque: obrDisbursementVouchers.withCheque,
      accountantSigningStatus: obrDisbursementVouchers.accountantSigningStatus,
      disbursedBy: obrDisbursementVouchers.disbursedBy,
      headUserId: obrDisbursementVouchers.headUserId,
    })
    .from(obrDisbursementVouchers)
    .where(eq(obrDisbursementVouchers.requestId, requestId));

  if (disbursements.length === 0) return;
  if (disbursements.some(d => d.accountantSigningStatus !== "approved")) return;

  const ecRows = await db
    .select({ id: expenseClasses.id, class: expenseClasses.class })
    .from(expenseClasses)
    .where(inArray(expenseClasses.id, [...new Set(requestItems.map(i => i.expenseCodeId))]));
  const ecClassMap = new Map(ecRows.map(r => [r.id, r.class ?? ""]));

  const officeHead = await findOfficeHeadByOffice(request.originatingOfficeId);
  const defaultRequestingOfficialId = officeHead?.id ?? request.publisherId;

  const now = DateTime.now().setZone("Asia/Manila");
  const yy = now.toFormat("yy");
  const mm = now.toFormat("MM");

  let promoted = false;

  await db.transaction(async tx => {
    const [existingMain] = await tx
      .select({ id: obrMainData.id })
      .from(obrMainData)
      .where(eq(obrMainData.requestSourceId, requestId))
      .limit(1);
    if (existingMain) return;

    const baseSequence = await _getNextObrNumberSequence(tx);
    const baseObrNumber = String(baseSequence);
    const isMulti = requestItems.length > 1;
    const isOneForAll = disbursements.some(d => d.isOneForAll);
    let chequeSequence = 0;
    const anyWithCheque = isOneForAll
      ? (disbursements[0]?.withCheque ?? false)
      : disbursements.some(d => d.withCheque);
    if (anyWithCheque) {
      chequeSequence = await _getNextChequeNumberSequence(tx);
    }
    const sharedChequeNumber = isOneForAll && anyWithCheque ? String(chequeSequence) : null;

    const resolveDisbursementForItem = (itemId: string) => (
      isOneForAll
        ? disbursements[0]
        : disbursements.find(d => d.requestItemId === itemId)
    );

    for (let idx = 0; idx < requestItems.length; idx++) {
      const item = requestItems[idx]!;
      const obrNumber = isMulti ? `${baseObrNumber}-${idx + 1}` : baseObrNumber;
      const expenseClass = ecClassMap.get(item.expenseCodeId) ?? "";
      const alobs = [expenseClass, yy, mm, obrNumber].join("-");

      const [mainRow] = await tx
        .insert(obrMainData)
        .values({
          obrNumber,
          alobs,
          payee: request.payee,
          address: request.officeAddress,
          particulars: item.particulars,
          obligated: casts.castToDecimal(item.amount),
          responsibilityCenterId: item.responsibilityCenterId,
          expenseCodeId: item.expenseCodeId,
          authorId: request.publisherId,
          requestSourceId: requestId,
          ...(validatorUtilities.isNotEmpty(request.prNumber) ? { prNumber: request.prNumber } : {}),
        })
        .returning({ id: obrMainData.id });

      const dv = resolveDisbursementForItem(item.id);
      if (dv?.fundTypeId) {
        const checkNumber = dv.withCheque
          ? (isOneForAll ? sharedChequeNumber : String(chequeSequence++))
          : null;

        await tx.insert(esre).values({
          checkNumber,
          fundingSourceId: dv.fundTypeId,
          dvOrPayrollNumber: dv.disbursementVoucherNumber,
          obrItemId: mainRow!.id,
          payee: request.payee,
          natureOfPayment: validatorUtilities.isNotEmpty(dv.explanation) ? dv.explanation! : item.particulars,
          amount: casts.castToDecimal(item.amount),
          checkStatus: "FOR RELEASE",
        });
      }
    }

    for (const item of requestItems) {
      const dv = resolveDisbursementForItem(item.id);
      if (!dv) continue;

      const [obrItemRow] = await tx
        .insert(obrItems)
        .values({
          payee: request.payee,
          address: request.officeAddress,
          particulars: item.particulars,
          requestingOfficialId: dv.headUserId ?? defaultRequestingOfficialId,
          disbursementRefId: dv.id,
          publishedBy: dv.disbursedBy,
          requestId,
          requestItemId: item.id,
        })
        .returning({ id: obrItems.id });

      await tx.insert(obrOfficeItem).values({
        amount: casts.castToDecimal(item.amount),
        responsibilityCenterId: item.responsibilityCenterId,
        expenseCodeId: item.expenseCodeId,
        itemId: obrItemRow!.id,
      });
    }

    await tx
      .update(obrRequests)
      .set({
        obrNumber: baseObrNumber,
        ...(validatorUtilities.isNotEmpty(request.prNumber) ? { prNumber: request.prNumber } : {}),
      })
      .where(eq(obrRequests.id, requestId));

    promoted = true;
  });

  if (!promoted) return;

  const movementPayload = {
    requestId: request.id,
    requestNumber: request.requestNumber,
    officeId: request.originatingOfficeId,
    actorName: "System",
  };

  await publishEvent({
    type: "obr.request.main-data-created",
    payload: movementPayload,
  });

  await publishEvent({
    type: "obr.request.items-created",
    payload: movementPayload,
  });
}

function mapSignerField(id: string | null, name: string | null, position: string | null) {
  return {
    id: id ?? null,
    name: name ?? null,
    position: position ?? null,
  };
}

async function findOfficeHeadByOffice(officeId: string): Promise<{ id: string; name: string; positionName: string; } | null> {
  try {
    const [officeHead] = await db
      .select({
        id: user.id,
        name: user.name,
        positionName: officePosition.name,
      })
      .from(user)
      .innerJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .where(and(
        eq(user.officeId, officeId),
        eq(user.emailVerified, true),
        eq(user.banned, false),
        eq(user.shadowBanned, false),
        sql`${permissions.OFFICE_HEAD} = ANY(${officePosition.permissions})`,
      ))
      .limit(1);

    return officeHead ?? null;
  } catch (e) {
    void new Failure(ErrorCodes.Fatal, "Unable to find office head by office.", { officeId }, e);
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
      submittedForApproval: obrRequests.submittedForApproval,
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

  const promoted = await isRequestPromoted(requestId);
  const disbursementApproved = await _hasApprovedDisbursementForRequest(requestId);

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
      .select({ id: officePosition.id, name: officePosition.name, permissions: officePosition.permissions })
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
  const visibleApprovers = result.approvers.filter((approver) => {
    const position = pMap.get(approver.positionId);
    return !position?.permissions?.includes(permissions.OFFICE_HEAD);
  });

  // Map
  return {
    id: result.id,
    type: result.type,
    requestNumber: result.requestNumber,
    payee: result.payee,
    officeAddress: result.officeAddress,
    obrNumber: result.obrNumber,
    prNumber: result.prNumber,
    submittedForApproval: result.submittedForApproval,
    disbursementApproved,
    promoted,
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
      amount: casts.castToDecimal(String(i.amount)),
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
    approvers: visibleApprovers.map(a => ({
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
    .innerJoin(officePosition, eq(officePosition.id, obrRequestApprovers.positionId))
    .where(sql`NOT (${permissions.OFFICE_HEAD} = ANY(${officePosition.permissions}))`)
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

function _mapObrTemplate(item: templateBucket.TemplateBucketItem): ObrTemplateInfo {
  return {
    id: item.id,
    templateType: item.templateType,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function _getObrTemplateSlot(
  identifier: string,
  type: ObrTemplateType,
): Promise<Result<ObrTemplateInfo | null>> {
  const result = await templateBucket.get({ identifier, type });
  if (result instanceof Success) {
    return new Success(_mapObrTemplate(result.value));
  }
  if (result.type === ErrorCodes.ResourceNotFound) {
    return new Success(null);
  }
  return result;
}

async function _fetchObrTemplatesBundle(identifier: string): Promise<Result<ObrTemplatesBundle>> {
  const headerResult = await _getObrTemplateSlot(identifier, "header");
  if (headerResult instanceof Failure) return headerResult;

  const footerResult = await _getObrTemplateSlot(identifier, "footer");
  if (footerResult instanceof Failure) return footerResult;

  return new Success({
    header: headerResult.value,
    footer: footerResult.value,
  });
}

async function _getTemplatePath(identifier: string, type: ObrTemplateType): Promise<Result<string | null>> {
  const result = await templateBucket.get({ identifier, type });
  if (result instanceof Success) return new Success(result.value.templatePath);
  if (result.type === ErrorCodes.ResourceNotFound) return new Success(null);
  return result;
}

function _toMoneyNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function _applyCellBorder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  row: number,
  colStart: number,
  colEnd: number,
) {
  for (let col = colStart; col <= colEnd; col++) {
    ws.getCell(row, col).border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    ws.getCell(row, col).alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
  }
}

function _renderSignerBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  startRow: number,
  colStart: number,
  colEnd: number,
  signer: ObrFormSignerBlock,
) {
  for (let row = startRow; row < startRow + 5; row++) {
    _applyCellBorder(ws, row, colStart, colEnd);
    if (colEnd > colStart + 1) {
      ws.mergeCells(row, colStart + 1, row, colEnd);
    }
  }

  ws.getCell(startRow, colStart).value = "Signature";
  ws.getCell(startRow + 1, colStart).value = "Printed Name";
  ws.getCell(startRow + 1, colStart + 1).value = signer.printedName;
  ws.getCell(startRow + 2, colStart).value = "Position";
  ws.getCell(startRow + 2, colStart + 1).value = signer.position;
  ws.getCell(startRow + 3, colStart + 1).value = signer.roleLabel;
  ws.getCell(startRow + 4, colStart).value = "Date";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _resolveTemplateValue(cellValue: any): unknown {
  if (cellValue === null || cellValue === undefined) return cellValue;

  if (typeof cellValue === "object") {
    if ("error" in cellValue) return null;
    if ("formula" in cellValue || "sharedFormula" in cellValue) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (cellValue as any).result;
      if (result !== null && result !== undefined && typeof result === "object" && "error" in result) {
        return null;
      }
      return result ?? null;
    }
  }

  return cellValue;
}

function _offsetMergeRange(range: string, rowOffset: number): string | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!match) return null;
  return `${match[1]}${Number.parseInt(match[2], 10) + rowOffset}:${match[3]}${Number.parseInt(match[4], 10) + rowOffset}`;
}

async function _copyTemplateRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcWorkbook: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destWorksheet: any,
  startRow: number,
): Promise<number> {
  const srcWs = srcWorkbook.getWorksheet(1);
  if (!srcWs) return startRow;

  const rowOffset = startRow - 1;
  let currentRow = startRow;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcWs.eachRow({ includeEmpty: true }, (row: any) => {
    const destRow = destWorksheet.getRow(currentRow);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      if (cell.type === _MERGE_CELL_TYPE) return;

      const destCell = destRow.getCell(colNum);
      destCell.value = _resolveTemplateValue(cell.value);
      if (cell.font) destCell.font = cell.font;
      if (cell.fill) destCell.fill = cell.fill;
      if (cell.border) destCell.border = cell.border;
      if (cell.alignment) destCell.alignment = cell.alignment;
      if (cell.numFmt) destCell.numFmt = cell.numFmt;
    });
    if (row.height) destRow.height = row.height;
    destRow.commit();
    currentRow++;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: string[] = (srcWs.model as any)?.mergeCells ?? [];
  for (const range of merges) {
    const adjusted = _offsetMergeRange(range, rowOffset);
    if (!adjusted) continue;
    try {
      destWorksheet.mergeCells(adjusted);
    } catch {
      // Ignore overlapping or invalid ranges.
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destWorkbook = destWorksheet.workbook as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcImages: any[] = srcWs.getImages();
  for (const image of srcImages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageModel = image.model as any;
    if (imageModel.type !== "image") continue;

    const srcImageData = srcWorkbook.getImage(imageModel.imageId);
    if (!srcImageData) continue;

    const newImageId = destWorkbook.addImage(srcImageData);
    const srcRange = imageModel.range;
    const srcExt = srcRange.ext as Optional<{ width: number; height: number }>;
    const squareSize = srcExt
      ? Math.min(srcExt.width, srcExt.height)
      : 52;

    const adjustedRange: {
      tl: {
        nativeCol: number;
        nativeColOff: number;
        nativeRow: number;
        nativeRowOff: number;
      };
      editAs: string;
      ext: {
        width: number;
        height: number;
      };
      hyperlinks?: unknown;
    } = {
      tl: {
        nativeCol: srcRange.tl.nativeCol,
        nativeColOff: srcRange.tl.nativeColOff,
        nativeRow: srcRange.tl.nativeRow + rowOffset,
        nativeRowOff: srcRange.tl.nativeRowOff,
      },
      editAs: srcRange.editAs,
      ext: {
        width: squareSize,
        height: squareSize,
      },
    };

    if (srcRange.hyperlinks) adjustedRange.hyperlinks = srcRange.hyperlinks;

    destWorksheet.addImage(newImageId, adjustedRange);
  }

  return currentRow;
}

function _toDecimal(value: Optional<string>): Decimal {
  if (!validatorUtilities.isNumber(value)) {
    return new Decimal(0);
  }

  return casts.castFromDecimal(value!);
}

function _formatNumber(value: Decimal): string {
  return Number(value.toFixed(2)).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function _formatParens(value: Decimal): string {
  return `(${_formatNumber(value)})`;
}

function _taxTypeLabel(type: Optional<string>): string {
  if (type === "vat-s") return "VAT - Services";
  if (type === "vat-g") return "VAT - Goods";
  if (type === "nvat-s") return "Non-VAT - Services";
  if (type === "nvat-g") return "Non-VAT - Goods";
  return "-";
}

function _withholdingRows(grossAmount: Decimal, taxType: Optional<string>) {
  let vatLabel = "PT 3%";
  if (!validatorUtilities.isNotEmpty(taxType)) {
    vatLabel = "-";
  } else if (taxType === "vat-g" || taxType === "vat-s") {
    vatLabel = "VAT 5%";
  }

  let ewtLabel = "EWT 2%";
  if (!validatorUtilities.isNotEmpty(taxType)) {
    ewtLabel = "-";
  } else if (taxType === "vat-g" || taxType === "nvat-g") {
    ewtLabel = "EWT 1%";
  }

  const vatAmount = vatLabel === "VAT 5%"
    ? grossAmount.div("1.12").mul("0.05")
    : vatLabel === "PT 3%"
      ? grossAmount.mul("0.03")
      : new Decimal(0);

  let ewtAmount = new Decimal(0);
  if (taxType === "vat-g") {
    ewtAmount = grossAmount.div("1.12").mul("0.01");
  } else if (taxType === "vat-s") {
    ewtAmount = grossAmount.div("1.12").mul("0.02");
  } else if (taxType === "nvat-g") {
    ewtAmount = grossAmount.mul("0.01");
  } else if (taxType === "nvat-s") {
    ewtAmount = grossAmount.mul("0.02");
  }

  const totalWithholding = vatAmount.add(ewtAmount);
  const netAmount = grossAmount.sub(totalWithholding);

  return {
    vatLabel,
    vatAmount,
    ewtLabel,
    ewtAmount,
    totalWithholding,
    netAmount,
  };
}

function _applyDisbursementBorder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  row: number,
  colStart: number,
  colEnd: number,
  horizontal: "left" | "center" | "right" = "left",
) {
  for (let col = colStart; col <= colEnd; col++) {
    ws.getCell(row, col).border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    ws.getCell(row, col).alignment = {
      vertical: "middle",
      horizontal,
      wrapText: true,
    };
  }
}

function _applyDisbursementSectionBox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
) {
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      ws.getCell(row, col).border = {
        top: { style: row === rowStart ? "medium" : "thin", color: { argb: "FF000000" } },
        left: { style: col === colStart ? "medium" : "thin", color: { argb: "FF000000" } },
        bottom: { style: row === rowEnd ? "medium" : "thin", color: { argb: "FF000000" } },
        right: { style: col === colEnd ? "medium" : "thin", color: { argb: "FF000000" } },
      };
      if (!ws.getCell(row, col).alignment) {
        ws.getCell(row, col).alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
      }
    }
  }
}

async function _buildDisbursementVoucherExcelBuffer(
  voucher: ObrDisbursementVoucher,
  elecData: Array<ObrDisbursementElectronicItem>,
  headerTemplatePath: string | null,
): Promise<Buffer> {
  const { Workbook } = await import("@cj-tech-master/excelts");

  const wb = new Workbook();
  const ws = wb.addWorksheet("Disbursement Voucher");
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 12;
  ws.getColumn(8).width = 13;
  ws.getColumn(9).width = 14;

  // Extra columns used only by electric-detail rows inside EXPLANATION.
  ws.getColumn(10).width = 12;
  ws.getColumn(11).width = 11;
  ws.getColumn(12).width = 13;
  ws.getColumn(13).width = 14;
  ws.getColumn(14).width = 13;
  ws.getColumn(15).width = 14;

  const isElecLayout = elecData.length > 0;
  const explanationLeftStartCol = 1;
  const explanationLeftEndCol = isElecLayout ? 12 : 7;
  const explanationAmountStartCol = isElecLayout ? 13 : 8;
  const explanationAmountEndCol = isElecLayout ? 15 : 9;

  const headerLeftStartCol = 1;
  const headerLeftEndCol = isElecLayout ? 9 : 6;
  const headerRightStartCol = headerLeftEndCol + 1;
  const headerRightEndCol = isElecLayout ? 15 : 9;

  const payeeValueStartCol = 2;
  const payeeValueEndCol = isElecLayout ? 9 : 6;
  const rightMetaStartCol = isElecLayout ? 10 : 7;
  const rightMetaEndCol = headerRightEndCol;
  const rightMetaCodeStartCol = isElecLayout ? 12 : 8;

  const signerLeftStartCol = 1;
  const signerLeftEndCol = isElecLayout ? 8 : 5;
  const signerRightStartCol = signerLeftEndCol + 1;
  const signerRightEndCol = isElecLayout ? 15 : 9;
  const signerLeftValueStartCol = signerLeftStartCol + 1;
  const signerRightValueStartCol = signerRightStartCol + 1;

  let row = 1;
  if (headerTemplatePath) {
    const headerWb = new Workbook();
    await headerWb.xlsx.readFile(headerTemplatePath);
    row = await _copyTemplateRows(headerWb, ws, row);
  }

  // DV number row - appears above the DISBURSEMENT VOUCHER title, right-aligned, red
  ws.mergeCells(row, headerLeftStartCol, row, headerLeftEndCol);
  ws.mergeCells(row, headerRightStartCol, row, headerRightEndCol);
  ws.getCell(row, headerRightStartCol).value = voucher.disbursementVoucherNumber;
  ws.getCell(row, headerRightStartCol).font = { bold: true, size: 16, color: { argb: "FFFF0000" } };
  ws.getCell(row, headerRightStartCol).alignment = { horizontal: "right", vertical: "middle" };
  row++;

  // DISBURSEMENT VOUCHER title spanning 2 rows; Fund on the right
  ws.mergeCells(row, headerLeftStartCol, row + 1, headerLeftEndCol);
  ws.mergeCells(row, headerRightStartCol, row + 1, headerRightEndCol);
  ws.getCell(row, headerLeftStartCol).value = "DISBURSEMENT VOUCHER";
  ws.getCell(row, headerLeftStartCol).font = { bold: true, size: 18 };
  ws.getCell(row, headerLeftStartCol).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(row, headerRightStartCol).value = `Fund: ${voucher.fundType?.name ?? ""}`;
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  _applyDisbursementBorder(ws, row + 1, headerLeftStartCol, headerRightEndCol);
  row += 2;

  // Mode of Payment + DV No.
  ws.mergeCells(row, headerLeftStartCol, row, headerLeftEndCol);
  ws.mergeCells(row, headerRightStartCol, row, headerRightEndCol);
  ws.getCell(row, headerLeftStartCol).value = "Mode of Payment:      \u2610 Check      \u2610 Cash      \u2610 Others";
  ws.getCell(row, headerRightStartCol).value = `DV No.: ${voucher.disbursementVoucherNumber}`;
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  row++;

  // Payee row 1 of 2: label + value (rowspan 2) + ID No./TIN
  ws.getCell(row, 1).value = "Payee:";
  ws.mergeCells(row, payeeValueStartCol, row + 1, payeeValueEndCol);
  ws.getCell(row, payeeValueStartCol).value = voucher.payee ?? "";
  ws.getCell(row, payeeValueStartCol).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.mergeCells(row, rightMetaStartCol, row, rightMetaEndCol);
  ws.getCell(row, rightMetaStartCol).value = "ID No./TIN:";
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  row++;

  // Payee row 2 of 2: OBR No.
  ws.mergeCells(row, rightMetaStartCol, row, rightMetaEndCol);
  ws.getCell(row, rightMetaStartCol).value = `OBR No.: ${voucher.prNumber ?? ""}`;
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  row++;

  // Address row 1 of 3: label + value (rowspan 3) + Responsibility Center header
  ws.getCell(row, 1).value = "Address:";
  ws.mergeCells(row, payeeValueStartCol, row + 2, payeeValueEndCol);
  ws.getCell(row, payeeValueStartCol).value = voucher.address;
  ws.getCell(row, payeeValueStartCol).alignment = { horizontal: "left", vertical: "top", wrapText: true };
  ws.mergeCells(row, rightMetaStartCol, row, rightMetaEndCol);
  ws.getCell(row, rightMetaStartCol).value = "Responsibility Center:";
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  row++;

  // Address row 2 of 3: Office/Unit/Project | Code column headers
  ws.getCell(row, rightMetaStartCol).value = "Office/Unit/Project";
  ws.getCell(row, rightMetaStartCol).alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(row, rightMetaCodeStartCol, row, rightMetaEndCol);
  ws.getCell(row, rightMetaCodeStartCol).value = "Code";
  ws.getCell(row, rightMetaCodeStartCol).alignment = { horizontal: "center", vertical: "middle" };
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  row++;

  // Address row 3 of 3: RC value
  ws.getCell(row, rightMetaStartCol).value = voucher.responsibilityCenter.aa;
  ws.getCell(row, rightMetaStartCol).alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(row, rightMetaCodeStartCol, row, rightMetaEndCol);
  _applyDisbursementBorder(ws, row, headerLeftStartCol, headerRightEndCol);
  row++;

  // EXPLANATION header
  ws.mergeCells(row, explanationLeftStartCol, row, explanationLeftEndCol);
  ws.mergeCells(row, explanationAmountStartCol, row, explanationAmountEndCol);
  ws.getCell(row, explanationLeftStartCol).value = "EXPLANATION";
  ws.getCell(row, explanationAmountStartCol).value = "Amount";
  _applyDisbursementBorder(ws, row, explanationLeftStartCol, explanationLeftEndCol, "center");
  _applyDisbursementBorder(ws, row, explanationAmountStartCol, explanationAmountEndCol, "center");
  ws.getCell(row, explanationLeftStartCol).font = { bold: true };
  ws.getCell(row, explanationAmountStartCol).font = { bold: true };
  row++;

  const grossAmount = _toDecimal(voucher.grossAmount);
  const withholdings = _withholdingRows(grossAmount, voucher.taxType);

  const explanationStart = row;
  const explanationRows = elecData.length > 0 ? 3 : 2;
  const explanationText = validatorUtilities.isNotEmpty(voucher.explanation)
    ? voucher.explanation!
    : voucher.particulars;
  ws.mergeCells(explanationStart, explanationLeftStartCol, explanationStart + explanationRows, explanationLeftEndCol);
  ws.getCell(explanationStart, explanationLeftStartCol).value = explanationText;
  ws.getCell(explanationStart, explanationLeftStartCol).alignment = { horizontal: "left", vertical: "top", wrapText: true };
  ws.mergeCells(explanationStart, explanationAmountStartCol, explanationStart + explanationRows, explanationAmountEndCol);
  ws.getCell(explanationStart, explanationAmountStartCol).value = `${_formatNumber(withholdings.netAmount)}`;
  ws.getCell(explanationStart, explanationAmountStartCol).font = { bold: true, size: 13 };
  ws.getCell(explanationStart, explanationAmountStartCol).alignment = { horizontal: "right", vertical: "middle" };
  for (let rr = explanationStart; rr <= explanationStart + explanationRows; rr++) {
    _applyDisbursementBorder(ws, rr, explanationLeftStartCol, explanationLeftEndCol);
    _applyDisbursementBorder(ws, rr, explanationAmountStartCol, explanationAmountEndCol, "right");
  }
  row = explanationStart + explanationRows + 1;

  if (elecData.length > 0) {
    const billingStartCol = 2;
    const billingEndCol = 5;
    const meterCol = billingEndCol + 1;
    const accountCol = meterCol + 1;
    const grossCol = accountCol + 1;
    const vatableCol = grossCol + 1;
    const vatCol = vatableCol + 1;
    const evatCol = vatCol + 1;
    const netStartCol = evatCol + 1;
    const netEndCol = netStartCol;

    const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
    const maxBillingLen = Math.max(
      "BILLING NAME".length,
      ...elecData.map((item) => (item.billingName ?? "").trim().length),
    );
    const maxMeterLen = Math.max(
      "METER SERIAL#".length,
      ...elecData.map((item) => (item.meterSerial ?? "").trim().length),
    );
    const maxAccountLen = Math.max(
      "ACCOUNT".length,
      ...elecData.map((item) => (item.account ?? "").trim().length),
    );
    const numberLens = elecData.map((item) => {
      const itemGross = _toDecimal(item.gross);
      const itemVatable = _toDecimal(item.vatableSales);
      const itemVat = itemVatable.mul("0.05");
      const itemEvat = itemVatable.mul("0.02");
      const itemNet = itemGross.sub(itemVat).sub(itemEvat);

      return {
        gross: _formatNumber(itemGross).length,
        vatable: _formatNumber(itemVatable).length,
        vat: _formatNumber(itemVat).length,
        evat: _formatNumber(itemEvat).length,
        net: _formatNumber(itemNet).length,
      };
    });
    const maxGrossLen = Math.max("GROSS".length, ...numberLens.map((item) => item.gross));
    const maxVatableLen = Math.max("VATABLE SALES".length, ...numberLens.map((item) => item.vatable));
    const maxVatLen = Math.max("VAT 5%".length, ...numberLens.map((item) => item.vat));
    const maxEvatLen = Math.max("EVAT 2%".length, ...numberLens.map((item) => item.evat));
    const maxNetLen = Math.max("NET".length, ...numberLens.map((item) => item.net));

    const desiredWidths = {
      billing: clamp(Math.round(maxBillingLen * 0.9 + 6), 30, 54),
      meter: clamp(Math.round(maxMeterLen + 3), 12, 20),
      account: clamp(Math.round(maxAccountLen + 3), 11, 18),
      gross: clamp(Math.round(maxGrossLen + 3), 10, 16),
      vatable: clamp(Math.round(maxVatableLen + 3), 11, 18),
      vat: clamp(Math.round(maxVatLen + 3), 10, 15),
      evat: clamp(Math.round(maxEvatLen + 3), 10, 15),
      net: clamp(Math.round(maxNetLen + 4), 14, 24),
    };
    const targetWidthBudget = 104;
    const totalDesired = Object.values(desiredWidths).reduce((acc, value) => acc + value, 0);
    const widthScale = totalDesired > 0 ? targetWidthBudget / totalDesired : 1;

    const scaled = {
      billing: clamp(Math.round(desiredWidths.billing * widthScale), 30, 54),
      meter: clamp(Math.round(desiredWidths.meter * widthScale), 10, 20),
      account: clamp(Math.round(desiredWidths.account * widthScale), 10, 18),
      gross: clamp(Math.round(desiredWidths.gross * widthScale), 9, 16),
      vatable: clamp(Math.round(desiredWidths.vatable * widthScale), 10, 18),
      vat: clamp(Math.round(desiredWidths.vat * widthScale), 9, 15),
      evat: clamp(Math.round(desiredWidths.evat * widthScale), 9, 15),
      net: clamp(Math.round(desiredWidths.net * widthScale), 14, 24),
    };

    const col5Width = Math.max(9, Math.round(scaled.billing * 0.20));
    const col2Adjusted = Math.max(9, Math.round(scaled.billing * 0.35));
    const col3Adjusted = Math.max(8, Math.round(scaled.billing * 0.23));
    const col4Adjusted = Math.max(8, scaled.billing - col2Adjusted - col3Adjusted - col5Width);

    ws.getColumn(2).width = col2Adjusted;
    ws.getColumn(3).width = col3Adjusted;
    ws.getColumn(4).width = col4Adjusted;
    ws.getColumn(5).width = col5Width;
    ws.getColumn(6).width = scaled.meter;
    ws.getColumn(7).width = scaled.account;
    ws.getColumn(8).width = scaled.gross;
    ws.getColumn(9).width = scaled.vatable;
    ws.getColumn(10).width = scaled.vat;
    ws.getColumn(11).width = scaled.evat;
    ws.getColumn(12).width = scaled.net;
    ws.getColumn(13).width = 5;
    ws.getColumn(14).width = 14;
    ws.getColumn(15).width = 14;

    const billingCombinedWidth = col2Adjusted + col3Adjusted + col4Adjusted + col5Width;
    const billingCharsPerLine = Math.max(24, Math.floor(billingCombinedWidth * 1.5));

    ws.getCell(row, billingStartCol).value = "BILLING NAME";
    ws.mergeCells(row, billingStartCol, row, billingEndCol);
    ws.getCell(row, meterCol).value = "METER SERIAL#";
    ws.getCell(row, accountCol).value = "ACCOUNT";
    ws.getCell(row, grossCol).value = "GROSS";
    ws.getCell(row, vatableCol).value = "VATABLE SALES";
    ws.getCell(row, vatCol).value = "VAT 5%";
    ws.getCell(row, evatCol).value = "EVAT 2%";
    ws.mergeCells(row, netStartCol, row, netEndCol);
    ws.getCell(row, netStartCol).value = "NET";
    ws.getCell(row, billingStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, meterCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, accountCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, grossCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, vatableCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, vatCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, evatCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(row, netStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    _applyDisbursementBorder(ws, row, 2, 12, "center");
    _applyDisbursementBorder(ws, row, 13, 15, "right");
    for (let c = 2; c <= 12; c++) ws.getCell(row, c).font = { bold: true };
    ws.getCell(row, netStartCol).font = { bold: true };
    ws.getRow(row).height = 30;
    row++;

    let totalGross = new Decimal(0);
    let totalVatableSales = new Decimal(0);
    let totalVat = new Decimal(0);
    let totalEvat = new Decimal(0);
    let totalNet = new Decimal(0);

    for (const item of elecData) {
      const itemGross = _toDecimal(item.gross);
      const itemVatable = _toDecimal(item.vatableSales);
      const itemVat = itemVatable.mul("0.05");
      const itemEvat = itemVatable.mul("0.02");
      const itemNet = itemGross.sub(itemVat).sub(itemEvat);
      const billingName = item.billingName?.trim() ?? "";
      const billingLines = Math.max(1, Math.ceil(billingName.length / billingCharsPerLine));
      const rowHeight = Math.max(28, billingLines * 16);

      ws.getCell(row, billingStartCol).value = billingName;
      ws.mergeCells(row, billingStartCol, row, billingEndCol);
      ws.getCell(row, meterCol).value = item.meterSerial;
      ws.getCell(row, accountCol).value = item.account;
      ws.getCell(row, grossCol).value = _formatNumber(itemGross);
      ws.getCell(row, vatableCol).value = _formatNumber(itemVatable);
      ws.getCell(row, vatCol).value = _formatNumber(itemVat);
      ws.getCell(row, evatCol).value = _formatNumber(itemEvat);
      ws.mergeCells(row, netStartCol, row, netEndCol);
      ws.getCell(row, netStartCol).value = _formatNumber(itemNet);
      ws.getCell(row, billingStartCol).alignment = { horizontal: "left", vertical: "top", wrapText: true };
      ws.getCell(row, meterCol).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      ws.getCell(row, accountCol).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      ws.getCell(row, grossCol).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      ws.getCell(row, vatableCol).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      ws.getCell(row, vatCol).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      ws.getCell(row, evatCol).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      ws.getCell(row, netStartCol).alignment = { horizontal: "right", vertical: "middle" };
      _applyDisbursementBorder(ws, row, 2, 12);
      _applyDisbursementBorder(ws, row, 13, 15, "right");
      ws.getRow(row).height = rowHeight;

      totalGross = totalGross.add(itemGross);
      totalVatableSales = totalVatableSales.add(itemVatable);
      totalVat = totalVat.add(itemVat);
      totalEvat = totalEvat.add(itemEvat);
      totalNet = totalNet.add(itemNet);
      row++;
    }

    ws.getCell(row, billingStartCol).value = "TOTAL";
    ws.mergeCells(row, billingStartCol, row, accountCol);
    ws.getCell(row, grossCol).value = _formatNumber(totalGross);
    ws.getCell(row, vatableCol).value = _formatNumber(totalVatableSales);
    ws.getCell(row, vatCol).value = _formatNumber(totalVat);
    ws.getCell(row, evatCol).value = _formatNumber(totalEvat);
    ws.mergeCells(row, netStartCol, row, netEndCol);
    ws.getCell(row, netStartCol).value = _formatNumber(totalNet);
    ws.getCell(row, netStartCol).alignment = { horizontal: "right", vertical: "middle" };
    _applyDisbursementBorder(ws, row, 2, 12);
    _applyDisbursementBorder(ws, row, 13, 15, "right");
    for (let c = 2; c <= 12; c++) ws.getCell(row, c).font = { bold: true };
    ws.getCell(row, netStartCol).font = { bold: true };
    ws.getRow(row).height = 30;
    row++;
  }

  const breakdownRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: "GROSS AMOUNT", value: _formatNumber(grossAmount), bold: true },
    { label: "Less: Withholding Taxes", value: "" },
    { label: _taxTypeLabel(voucher.taxType), value: "" },
    {
      label: withholdings.vatLabel,
      value: withholdings.vatLabel === "-" ? "-" : _formatParens(withholdings.vatAmount),
    },
    {
      label: withholdings.ewtLabel,
      value: withholdings.ewtLabel === "-" ? "-" : _formatParens(withholdings.ewtAmount),
    },
    { label: "TOTAL WITHHOLDING TAXES", value: _formatParens(withholdings.totalWithholding), bold: true },
    { label: "NET AMOUNT", value: _formatNumber(withholdings.netAmount), bold: true },
  ];

  for (const item of breakdownRows) {
    ws.mergeCells(row, explanationLeftStartCol, row, explanationLeftEndCol);
    ws.getCell(row, explanationLeftStartCol).value = item.label;
    ws.mergeCells(row, explanationAmountStartCol, row, explanationAmountEndCol);
    ws.getCell(row, explanationAmountStartCol).value = item.value;
    ws.getCell(row, explanationAmountStartCol).alignment = { horizontal: "right", vertical: "middle" };
    _applyDisbursementBorder(ws, row, explanationLeftStartCol, explanationLeftEndCol);
    _applyDisbursementBorder(ws, row, explanationAmountStartCol, explanationAmountEndCol, "right");
    if (item.bold) {
      ws.getCell(row, explanationLeftStartCol).font = { bold: true };
      ws.getCell(row, explanationAmountStartCol).font = { bold: true };
    }
    row++;
  }

  ws.mergeCells(row, explanationLeftStartCol, row, explanationLeftEndCol);
  ws.mergeCells(row, explanationAmountStartCol, row, explanationAmountEndCol);
  ws.getCell(row, explanationLeftStartCol).value = "Amount Due";
  ws.getCell(row, explanationLeftStartCol).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(row, explanationAmountStartCol).value = `${_formatNumber(withholdings.netAmount)}`;
  ws.getCell(row, explanationAmountStartCol).font = { bold: true, size: 13, color: { argb: "FF0000FF" } };
  ws.getCell(row, explanationAmountStartCol).alignment = { horizontal: "right", vertical: "middle" };
  _applyDisbursementBorder(ws, row, explanationLeftStartCol, explanationLeftEndCol);
  _applyDisbursementBorder(ws, row, explanationAmountStartCol, explanationAmountEndCol, "right");
  row++;

  ws.mergeCells(row, signerLeftStartCol, row, signerLeftEndCol);
  ws.mergeCells(row, signerRightStartCol, row, signerRightEndCol);
  ws.getCell(row, signerLeftStartCol).value = "A. Certified";
  ws.getCell(row, signerRightStartCol).value = "B. Certified";
  ws.getCell(row, signerLeftStartCol).font = { bold: true };
  ws.getCell(row, signerRightStartCol).font = { bold: true };
  _applyDisbursementBorder(ws, row, signerLeftStartCol, signerLeftEndCol);
  _applyDisbursementBorder(ws, row, signerRightStartCol, signerRightEndCol);
  row++;

  ws.mergeCells(row, signerLeftStartCol, row, signerLeftEndCol);
  ws.mergeCells(row, signerRightStartCol, row, signerRightEndCol);
  ws.getCell(row, signerLeftStartCol).value = "\u2611 Allotment obligated for the purpose as indicated above";
  ws.getCell(row, signerRightStartCol).value = "\u2611 Funds Available";
  _applyDisbursementBorder(ws, row, signerLeftStartCol, signerLeftEndCol);
  _applyDisbursementBorder(ws, row, signerRightStartCol, signerRightEndCol);
  row++;

  ws.mergeCells(row, signerLeftStartCol, row, signerLeftEndCol);
  ws.mergeCells(row, signerRightStartCol, row, signerRightEndCol);
  ws.getCell(row, signerLeftStartCol).value = "\u2610 Supporting documents complete";
  _applyDisbursementBorder(ws, row, signerLeftStartCol, signerLeftEndCol);
  _applyDisbursementBorder(ws, row, signerRightStartCol, signerRightEndCol);
  row++;

  for (let i = 0; i < 4; i++) {
    ws.mergeCells(row + i, signerLeftValueStartCol, row + i, signerLeftEndCol);
    ws.mergeCells(row + i, signerRightValueStartCol, row + i, signerRightEndCol);
    _applyDisbursementBorder(ws, row + i, signerLeftStartCol, signerLeftEndCol);
    _applyDisbursementBorder(ws, row + i, signerRightStartCol, signerRightEndCol);
  }
  ws.getCell(row, signerLeftStartCol).value = "Signature:";
  ws.getCell(row, signerRightStartCol).value = "Signature:";
  const signersApproved = voucher.accountantSigningStatus === "approved";
  ws.getCell(row + 1, signerLeftStartCol).value = "Printed Name:";
  ws.getCell(row + 1, signerLeftValueStartCol).value = signersApproved
    ? (voucher.signers.accountant.name ?? "").toUpperCase()
    : "";
  ws.getCell(row + 1, signerLeftValueStartCol).font = { bold: true };
  ws.getCell(row + 1, signerLeftValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell(row + 1, signerRightStartCol).value = "Printed Name:";
  ws.getCell(row + 1, signerRightValueStartCol).value = signersApproved
    ? (voucher.signers.treasurer.name ?? "").toUpperCase()
    : "";
  ws.getCell(row + 1, signerRightValueStartCol).font = { bold: true };
  ws.getCell(row + 1, signerRightValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell(row + 2, signerLeftStartCol).value = "Position:";
  ws.getCell(row + 2, signerLeftValueStartCol).value = signersApproved
    ? (voucher.signers.accountant.position ?? "")
    : "";
  ws.getCell(row + 2, signerLeftValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell(row + 2, signerRightStartCol).value = "Position:";
  ws.getCell(row + 2, signerRightValueStartCol).value = signersApproved
    ? (voucher.signers.treasurer.position ?? "")
    : "";
  ws.getCell(row + 2, signerRightValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell(row + 3, signerLeftStartCol).value = "Date:";
  ws.getCell(row + 3, signerRightStartCol).value = "Date:";
  ws.getRow(row).height = 28;
  ws.getRow(row + 1).height = 34;
  ws.getRow(row + 2).height = 30;
  ws.getRow(row + 3).height = 28;
  row += 4;

  ws.mergeCells(row, signerLeftStartCol, row, signerLeftEndCol);
  ws.mergeCells(row, signerRightStartCol, row, signerRightEndCol);
  ws.getCell(row, signerLeftStartCol).value = "C. Approved for Payment";
  ws.getCell(row, signerRightStartCol).value = "D. Received Payment";
  ws.getCell(row, signerLeftStartCol).font = { bold: true };
  ws.getCell(row, signerRightStartCol).font = { bold: true };
  _applyDisbursementBorder(ws, row, signerLeftStartCol, signerLeftEndCol);
  _applyDisbursementBorder(ws, row, signerRightStartCol, signerRightEndCol);
  row++;

  const sectionCStart = row - 1;
  for (let i = 0; i < 4; i++) {
    ws.mergeCells(row + i, signerLeftValueStartCol, row + i, signerLeftEndCol);
    ws.mergeCells(row + i, signerRightValueStartCol, row + i, signerRightEndCol);
    _applyDisbursementBorder(ws, row + i, signerLeftStartCol, signerLeftEndCol);
    _applyDisbursementBorder(ws, row + i, signerRightStartCol, signerRightEndCol);
  }

  ws.getCell(row, signerLeftStartCol).value = "Signature:/ Printed Name:";
  ws.getCell(row, signerRightStartCol).value = "Check No./ Date";
  ws.getCell(row, signerRightValueStartCol).value = "Bank Name";

  ws.getCell(row + 1, signerLeftStartCol).value = "Position:";
  ws.getCell(row + 1, signerLeftValueStartCol).value = signersApproved
    ? (voucher.signers.mayor.name ?? "").toUpperCase()
    : "";
  ws.getCell(row + 1, signerLeftValueStartCol).font = { bold: true };
  ws.getCell(row + 1, signerLeftValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell(row + 1, signerRightStartCol).value = "Signature/ Printed Name/ Date";
  ws.getCell(row + 1, signerRightValueStartCol).value = signersApproved
    ? (voucher.payee ?? "").toUpperCase()
    : "";
  ws.getCell(row + 1, signerRightValueStartCol).font = { bold: true };
  ws.getCell(row + 1, signerRightValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  ws.getCell(row + 2, signerLeftStartCol).value = "Date:";
  ws.getCell(row + 2, signerLeftValueStartCol).value = signersApproved
    ? (voucher.signers.mayor.position ?? "")
    : "";
  ws.getCell(row + 2, signerLeftValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell(row + 2, signerRightStartCol).value = "OR/Other Documents";
  ws.getCell(row + 2, signerRightValueStartCol).value = "JEV No./ Date";
  ws.getCell(row + 2, signerRightValueStartCol).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  ws.getCell(row + 3, signerLeftStartCol).value = "";
  ws.getCell(row + 3, signerRightStartCol).value = "";

  ws.getRow(row).height = 40;
  ws.getRow(row + 1).height = 52;
  ws.getRow(row + 2).height = 40;
  ws.getRow(row + 3).height = 34;

  const sectionCEnd = row + 3;
  _applyDisbursementSectionBox(ws, sectionCStart, sectionCEnd, signerLeftStartCol, signerLeftEndCol);
  _applyDisbursementSectionBox(ws, sectionCStart, sectionCEnd, signerRightStartCol, signerRightEndCol);
  row += 4;

  for (let r = 1; r <= row; r++) {
    for (let c = 1; c <= 15; c++) {
      // Ensure a consistent export typography while preserving style attributes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cell = ws.getCell(r, c) as any;
      cell.font = {
        ...(cell.font ?? {}),
        name: "Arial Narrow",
      };
    }
    ws.getRow(r).commit();
  }

  const rawBuffer = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(rawBuffer)) return rawBuffer;
  return Buffer.from(rawBuffer as unknown as Uint8Array);
}

async function _buildObrFormExcelBuffer(request: ObrRequestType, headerTemplatePath: string | null): Promise<Buffer> {
  const { Workbook } = await import("@cj-tech-master/excelts");

  const wb = new Workbook();
  const ws = wb.addWorksheet("OBR Form");
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 24;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 18;

  let row = 1;
  if (headerTemplatePath) {
    const headerWb = new Workbook();
    await headerWb.xlsx.readFile(headerTemplatePath);
    row = await _copyTemplateRows(headerWb, ws, row);
  }

  ws.mergeCells(row, 1, row, 7);
  ws.getCell(row, 1).value = "OBLIGATION REQUEST";
  ws.getCell(row, 1).font = { bold: true, size: 20, name: "Times New Roman" };
  ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = `Request: ${request.requestNumber}`;
  ws.getCell(row, 5).value = `Obligation No.: ${request.obrNumber ?? ""}`;
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = `Payee: ${request.payee ?? ""}`;
  ws.getCell(row, 5).value = `PR No.: ${request.prNumber ?? ""}`;
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = `Office: ${request.officeAddress}`;
  ws.getCell(row, 5).value = "Date:";
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 7);
  ws.getCell(row, 1).value = "Address:";
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 2, row, 4);
  ws.getCell(row, 1).value = "RC";
  ws.getCell(row, 2).value = "PARTICULARS";
  ws.getCell(row, 5).value = "FPP";
  ws.getCell(row, 6).value = "ACCOUNT CODE";
  ws.getCell(row, 7).value = "AMOUNT";
  _applyCellBorder(ws, row, 1, 7);
  for (let col = 1; col <= 7; col++) {
    ws.getCell(row, col).font = { bold: true };
    ws.getCell(row, col).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  row++;

  let totalAmount = 0;
  for (const item of request.requestItems) {
    const amount = _toMoneyNumber(item.amount);
    totalAmount += amount;

    ws.mergeCells(row, 2, row, 4);
    ws.getCell(row, 1).value = item.responsibilityCenter.name;
    ws.getCell(row, 2).value = item.particulars;
    ws.getCell(row, 5).value = item.expenseCode.name;
    ws.getCell(row, 6).value = item.expenseCode.accountCode ?? "-";
    ws.getCell(row, 7).value = amount;
    ws.getCell(row, 7).numFmt = "#,##0.00";
    _applyCellBorder(ws, row, 1, 7);
    row++;
  }

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 6);
  if (request.requestItems.length === 1) {
    const singleItem = request.requestItems[0];
    ws.getCell(row, 1).value = `Charges: ${buildChargesString(
      singleItem.responsibilityCenter.name,
      singleItem.expenseCode.name,
      singleItem.amount,
    )}`;
  }
  ws.getCell(row, 5).value = "Total Amount Requested:";
  ws.getCell(row, 7).value = totalAmount;
  ws.getCell(row, 7).numFmt = "#,##0.00";
  ws.getCell(row, 5).font = { bold: true };
  ws.getCell(row, 7).font = { bold: true };
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = "Amount in Words:";
  ws.getCell(row, 5).value = amountToWords(totalAmount).toUpperCase();
  ws.getCell(row, 5).font = { bold: true, color: { argb: "FF0000FF" } };
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = "Certified:";
  ws.getCell(row, 5).value = "Certified:";
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = "☁ECharges to appropriation/allotment necessary, lawful and under my direct supervision";
  ws.getCell(row, 5).value = "☁EExistence of available appropriation";
  _applyCellBorder(ws, row, 1, 7);
  row++;

  ws.mergeCells(row, 1, row, 4);
  ws.mergeCells(row, 5, row, 7);
  ws.getCell(row, 1).value = "☁ESupporting documents valid, proper and legal";
  _applyCellBorder(ws, row, 1, 7);
  row++;

  const signerBlocks: ObrFormSignerBlock[] = request.approvers.slice(0, 3).map((approver, idx) => ({
    printedName: approver.signer?.name ?? "-",
    position: approver.position.name,
    roleLabel: idx === 0
      ? "Head, Requesting Office/Authorized Representative"
      : idx === 1
        ? "Head, Budget Unit/Authorized Representative"
        : "Local Chief Executive/Authorized Representative",
  }));

  if (signerBlocks.length <= 2) {
    _renderSignerBlock(ws, row, 1, 4, signerBlocks[0] ?? {
      printedName: "-",
      position: "-",
      roleLabel: "Head, Requesting Office/Authorized Representative",
    });
    _renderSignerBlock(ws, row, 5, 7, signerBlocks[1] ?? {
      printedName: "-",
      position: "-",
      roleLabel: "Head, Budget Unit/Authorized Representative",
    });
  } else {
    _renderSignerBlock(ws, row, 1, 2, signerBlocks[0]);
    _renderSignerBlock(ws, row, 3, 5, signerBlocks[1]);
    _renderSignerBlock(ws, row, 6, 7, signerBlocks[2]);
  }
  row += 5;

  for (let r = 1; r <= row; r++) {
    for (let c = 1; c <= 7; c++) {
      // Ensure a consistent export typography while preserving style attributes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cell = ws.getCell(r, c) as any;
      cell.font = {
        ...(cell.font ?? {}),
        name: "Arial Narrow",
      };
    }
  }

  for (let r = 1; r <= row; r++) {
    ws.getRow(r).commit();
  }

  const rawBuffer = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(rawBuffer)) return rawBuffer;
  return Buffer.from(rawBuffer as unknown as Uint8Array);
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

type UpdateObrRequestItemPayload = {
  particulars?: string;
  amount?: string;
}

type UpdateObrRequestHeaderPayload = {
  payee?: string;
  officeAddress?: string;
  obrNumber?: string;
  prNumber?: string;
}

type CreateDisbursementItemPayload = {
  requestItemId: string;
  explanation: string;
  taxType?: string;
  vatableAmount?: string;
};

type CreateDisbursementPayload = {
  oneForAll: boolean;
  withCheque?: boolean;
  particulars?: string;
  explanation?: string;
  grossAmount?: string;
  taxType?: string;
  vatableAmount?: string;
  items: CreateDisbursementItemPayload[];
}

type CreateStandaloneDisbursementItemPayload = {
  particulars: string;
  explanation: string;
  grossAmount: string;
  taxType?: string;
  vatableAmount?: string;
};

type CreateStandaloneDisbursementPayload = {
  payee: string;
  officeAddress: string;
  responsibilityCenterId: string;
  prNumber?: string;
  withCheque?: boolean;
  items: CreateStandaloneDisbursementItemPayload[];
}

type ObrRequestItemObject = {
  id: string;
  particulars: string;
  amount: string;
  expenseCode: ExpenseCodeObject;
  responsibilityCenter: {
    id: string;
    name: string;
  };
}

type PendingDisbursementForAccountant = {
  id: string;
  disbursementVoucherNumber: string;
  createdAt: Date;
  payee?: string | null;
  address: string;
  particulars: string;
  explanation: Optional<string>;
  isOneForAll: boolean;
  withCheque: boolean;
  grossAmount: Optional<string>;
  vatableAmount: Optional<string>;
  taxType: Optional<string>;
  taxBreakdown: ObrDisbursementTaxBreakdown;
  status: Optional<string>;
  accountantSigningStatus: string;
  responsibilityCenter: { id: string; aa: string };
  fundType: Optional<{ id: string; name: string; description: Optional<string> }>;
  prNumber: Optional<string>;
  request: {
    id: string;
    requestNumber: string;
  } | null;
  requestItem: {
    id: string;
    particulars: string;
    amount: string;
  };
};

type PendingDisbursementBatchForAccountant = {
  batchId: string;
  requestId: string | null;
  requestNumber: string | null;
  isHeadless: boolean;
  payee?: string | null;
  address: string;
  isOneForAll: boolean;
  withCheque: boolean;
  accountantSigningStatus: string;
  totalGrossAmount: string;
  itemCount: number;
  items: PendingDisbursementForAccountant[];
  requestItems: Array<{
    id: string;
    particulars: string;
    amount: string;
    responsibilityCenter: string;
    expenseName: string;
  }>;
};

export type ObrTemplateType = templateBucket.TemplateType;

export type ObrTemplateInfo = {
  id: string;
  templateType: ObrTemplateType;
  createdAt: string;
  updatedAt: string;
};

export type ObrTemplatesBundle = {
  header: ObrTemplateInfo | null;
  footer: ObrTemplateInfo | null;
};

export type ObrTemplateUploadInput = {
  type: ObrTemplateType;
  file: Buffer;
  filename: string;
};

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
  submittedForApproval: boolean;
  disbursementApproved: boolean;
  promoted: boolean;
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
  explanation: Optional<string>;
  isOneForAll: boolean;
  withCheque: boolean;
  disbursementBatchId: string;
  requestId: string | null;
  requestItemId: string | null;
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
      id: string | null;
      name: string | null;
      position: string | null;
    }
    treasurer: {
      id: string | null;
      name: string | null;
      position: string | null;
    }
    mayor: {
      id: string | null;
      name: string | null;
      position: string | null;
    }
    headOfOffice: {
      id: string | null;
      name: string | null;
      position: string | null;
    }
  }
  accountantSigningStatus: string;
  fundType: Optional<{
    id: string;
    name: string;
    description: Optional<string>;
  }>
  status: Optional<string>;
  prNumber: Optional<string>;
  hasElecData: boolean;
}

type ObrDisbursementElectronicItem = {
  id: string;
  billingName: string;
  meterSerial: string;
  account: string;
  gross: string;
  vatableSales: string;
  taxType: TaxType;
}

export type ValidApproverPermissionType =
  | "obr.disbursement.accountant.approve"
  | "obr.disbursement.treasurer.approve"
  | "obr.disbursement.mayor.approve";

type TaxType = "vat-g" | "vat-s" | "nvat-g" | "nvat-s";
type DisbursementStatus = "PREPARATION" | "PROCESSING" | "ON HOLD" | "FOR RELEASE" | "PAID";

type UpdateDisbursementVoucherPayload = {
  particulars?: Optional<string>;
  explanation?: Optional<string>;
  grossAmount?: Optional<string>;
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

type CreateObrMainDataItemPayload = {
  payee: string;
  address: string;
  responsibilityCenterId: string;
  expenseCodeId: string;
  particulars: string;
  amount: string;
  prNumber?: string;
  prAmount?: string;
  saaobId?: string;
  aipReferences?: Array<{
    aipId: string;
    amount: string;
  }>;
};

type CreateObrMainDataPayload = {
  obrNumber: string;
  requestId?: string;
  items: Array<CreateObrMainDataItemPayload>;
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
