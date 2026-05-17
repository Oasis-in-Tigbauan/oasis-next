import { desc, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";

import { type User } from "@/lib/accounts";
import { db } from "@/lib/db";
import * as permissions from "@/lib/db/permissions";
import {
  aipReferences,
  expenseClasses,
  lbacItems,
  modeOfProcurements,
  officePosition,
  purchasing,
  purchasingAip,
  user,
  user as userSchema,
} from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import * as casts from "@/lib/types/casts";

/**
 * Creates purchase-request rows for the requesting office user.
 *
 * @description
 * Validates signatories, resolves all LBAC-derived AIP metadata, inserts one purchasing row per item,
 * and inserts cached AIP rows for every inserted purchasing row.
 *
 * @async
 * @function createPurchaseRequest
 * @param {PurchaseRequestPayload} payload - Purchase request payload.
 * @param {User} user - Authenticated user creating the purchase request.
 * @returns {Promise<Result<PurchaseRequestItem[]>>} Created purchase-request rows mapped for API response.
 */
export async function createPurchaseRequest(
  payload: PurchaseRequestPayload,
  user: User,
): Promise<Result<PurchaseRequestItem[]>> {
  try {
    if (payload.items.length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "At least one purchase item is required.",
        { payload, userId: user.id },
      );
    }

    if (payload.aip.length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "At least one AIP reference is required.",
        { payload, userId: user.id },
      );
    }

    const signatoryError = await _validateSignatories(
      payload.signatories.headOfOfficeId,
      payload.signatories.treasurerId,
      payload.signatories.approverId,
      user.office.id,
    );
    if (signatoryError) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        signatoryError,
        { payload, userId: user.id },
      );
    }

    const aipData = await _resolveAipData(payload.aip.map(a => a.id));
    if (!aipData) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Some AIP references cannot be resolved.",
        { payload, userId: user.id },
      );
    }

    const signatoryIds = Array.from(new Set([
      payload.signatories.headOfOfficeId,
      payload.signatories.treasurerId,
      payload.signatories.approverId,
    ]));

    const signatoryRows = await db
      .select({
        id: userSchema.id,
        name: userSchema.name,
        position: officePosition.name,
      })
      .from(userSchema)
      .innerJoin(officePosition, eq(userSchema.officePositionId, officePosition.id))
      .where(inArray(userSchema.id, signatoryIds));

    if (signatoryRows.length !== signatoryIds.length) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Some signatories cannot be resolved.",
        { payload, userId: user.id },
      );
    }

    const signatoryMap = new Map(signatoryRows.map(s => [s.id, s]));
    const headOfOffice = signatoryMap.get(payload.signatories.headOfOfficeId);
    if (!headOfOffice) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Invalid head of office signatory.",
        { payload, userId: user.id },
      );
    }

    const insertedIds = await db.transaction(async tx => {
      const insertedRows = await tx
        .insert(purchasing)
        .values(payload.items.map(item => ({
          prNumber: payload.prNumber,
          unit: item.unit,
          itemDescription: item.description,
          quantity: casts.castToDecimal(item.quantity),
          unitCost: casts.castToDecimal(item.unitCost),
          purpose: payload.purpose,
          headOfOfficeId: payload.signatories.headOfOfficeId,
          headOfOfficeName: headOfOffice.name,
          headOfOfficePosition: headOfOffice.position,
          treasurerId: payload.signatories.treasurerId,
          approverId: payload.signatories.approverId,
          requestingOfficeId: user.office.id,
          requestingUserId: user.id,
        })))
        .returning({ id: purchasing.id });

      const aipInsertRows = insertedRows.flatMap(inserted => payload.aip.map(entry => {
        const resolved = aipData.get(entry.id)!;

        return {
          purchasingId: inserted.id,
          lbacReferenceId: entry.id,
          aipCode: resolved.aipCode,
          ppa: resolved.ppa,
          sourceOfFund: resolved.sourceOfFund,
        };
      }));

      if (aipInsertRows.length > 0) {
        await tx.insert(purchasingAip).values(aipInsertRows);
      }

      return insertedRows.map(row => row.id);
    });

    const items = await _fetchPurchaseRequestItemBatch(insertedIds, user.office.name);
    return new Success(items);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to create purchase request.",
      { payload, userId: user.id },
      e,
    );
  }
}

/**
 * Creates purchase-order details for a set of purchasing rows.
 *
 * @description
 * Ensures all purchasing rows exist in the caller's office, verifies they share the same PR number,
 * validates mode of procurement when provided, then applies purchase-order fields in one update transaction.
 *
 * @async
 * @function createPurchaseOrder
 * @param {PurchaseOrderPayload} payload - Purchase order payload.
 * @param {User} user - Authenticated user creating the purchase order.
 * @returns {Promise<Result<PurchaseRequestItem[]>>} Updated purchase-request rows mapped for API response.
 */
export async function createPurchaseOrder(
  payload: PurchaseOrderPayload,
  user: User,
): Promise<Result<PurchaseRequestItem[]>> {
  try {
    if (payload.items.length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "At least one purchase request item is required.",
        { payload, userId: user.id },
      );
    }

    const uniqueIds = Array.from(new Set(payload.items));

    const targetRows = await db
      .select({
        id: purchasing.id,
        prNumber: purchasing.prNumber,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(inArray(purchasing.id, uniqueIds));

    if (targetRows.length !== uniqueIds.length) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "Some purchase request items were not found.",
        { payload, userId: user.id },
      );
    }

    if (targetRows.some(row => row.requestingOfficeId !== user.office.id)) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "Cannot create purchase order for another office.",
        { payload, userId: user.id },
      );
    }

    const prNumbers = new Set(targetRows.map(row => row.prNumber));
    if (prNumbers.size !== 1) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Purchase order items must share the same PR number.",
        { payload, userId: user.id },
      );
    }

    const normalizedProcurementId = typeof payload.modeOfProcurementId === "string"
      ? payload.modeOfProcurementId.trim()
      : "";

    let procurementId: string | null = null;
    if (normalizedProcurementId) {
      const [procurement] = await db
        .select({ id: modeOfProcurements.id })
        .from(modeOfProcurements)
        .where(eq(modeOfProcurements.id, normalizedProcurementId))
        .limit(1);

      if (!procurement) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Invalid mode of procurement.",
          { payload, userId: user.id },
        );
      }

      procurementId = normalizedProcurementId;
    }

    const dateOfDelivery = payload.dateOfDelivery
      ? _parseDateFromManilaToUtc(payload.dateOfDelivery)
      : null;

    if (payload.dateOfDelivery && !dateOfDelivery) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Invalid delivery date.",
        { payload, userId: user.id },
      );
    }

    await db.transaction(async tx => {
      await tx
        .update(purchasing)
        .set({
          supplier: payload.supplier,
          address: payload.address,
          tinNumber: payload.tinNumber ?? null,
          purchaseOrderNumber: payload.purchaseOrderNumber,
          procurementId,
          placeOfDelivery: payload.placeOfDelivery ?? null,
          dateOfDelivery,
          deliveryTerm: payload.deliveryTerm ?? null,
          paymentTerm: payload.paymentTerm ?? null,
        })
        .where(inArray(purchasing.id, uniqueIds));
    });

    const items = await _fetchPurchaseRequestItemBatch(uniqueIds, user.office.name);
    return new Success(items);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to create purchase order.",
      { payload, userId: user.id },
      e,
    );
  }
}

/**
 * Updates a single purchase-request row.
 *
 * @description
 * Validates ownership by office, updates only allowed request/order fields, and optionally replaces
 * associated AIP rows when `aip` is present in the payload.
 *
 * @async
 * @function updateRequest
 * @param {string} id - Purchasing row identifier.
 * @param {UpdatePurchaseRequestPayload} payload - Partial update payload.
 * @param {User} user - Authenticated user requesting the update.
 * @returns {Promise<Result<PurchaseRequestItem>>} Updated row mapped for API response.
 */
export async function updateRequest(
  id: string,
  payload: UpdatePurchaseRequestPayload,
  user: User,
): Promise<Result<PurchaseRequestItem>> {
  try {
    const [existing] = await db
      .select({
        id: purchasing.id,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(eq(purchasing.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such purchase request item found.",
        { id, payload, userId: user.id },
      );
    }

    if (existing.requestingOfficeId !== user.office.id) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "Cannot update a purchase request from another office.",
        { id, payload, userId: user.id },
      );
    }

    const updateSet: Partial<{
      prNumber: string;
      purpose: string;
      supplier: string | null;
      address: string | null;
      tinNumber: string | null;
      purchaseOrderNumber: string | null;
      procurementId: string | null;
      placeOfDelivery: string | null;
      dateOfDelivery: Date | null;
      deliveryTerm: string | null;
      paymentTerm: string | null;
    }> = {};

    if (payload.prNumber !== undefined) {
      updateSet.prNumber = payload.prNumber;
    }

    if (payload.purpose !== undefined) {
      updateSet.purpose = payload.purpose;
    }

    if (payload.supplier !== undefined) {
      updateSet.supplier = payload.supplier;
    }

    if (payload.address !== undefined) {
      updateSet.address = payload.address;
    }

    if (payload.tinNumber !== undefined) {
      updateSet.tinNumber = payload.tinNumber;
    }

    if (payload.purchaseOrderNumber !== undefined) {
      updateSet.purchaseOrderNumber = payload.purchaseOrderNumber;
    }

    if (payload.modeOfProcurementId !== undefined) {
      const normalizedProcurementId = typeof payload.modeOfProcurementId === "string"
        ? payload.modeOfProcurementId.trim()
        : "";

      if (!normalizedProcurementId) {
        updateSet.procurementId = null;
      } else {
        const [procurement] = await db
          .select({ id: modeOfProcurements.id })
          .from(modeOfProcurements)
          .where(eq(modeOfProcurements.id, normalizedProcurementId))
          .limit(1);

        if (!procurement) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "Invalid mode of procurement.",
            { id, payload, userId: user.id },
          );
        }

        updateSet.procurementId = normalizedProcurementId;
      }
    }

    if (payload.placeOfDelivery !== undefined) {
      updateSet.placeOfDelivery = payload.placeOfDelivery;
    }

    if (payload.dateOfDelivery !== undefined) {
      const parsedDate = _parseDateFromManilaToUtc(payload.dateOfDelivery);
      if (!parsedDate) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Invalid delivery date.",
          { id, payload, userId: user.id },
        );
      }

      updateSet.dateOfDelivery = parsedDate;
    }

    if (payload.deliveryTerm !== undefined) {
      updateSet.deliveryTerm = payload.deliveryTerm;
    }

    if (payload.paymentTerm !== undefined) {
      updateSet.paymentTerm = payload.paymentTerm;
    }

    const hasAipPayload = Object.prototype.hasOwnProperty.call(payload, "aip");
    const aipPayload = payload.aip ?? [];

    let aipData: Map<string, ResolvedAipData> | null = null;
    if (hasAipPayload) {
      aipData = await _resolveAipData(aipPayload.map(a => a.id));
      if (!aipData) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Some AIP references cannot be resolved.",
          { id, payload, userId: user.id },
        );
      }
    }

    if (Object.keys(updateSet).length > 0 || hasAipPayload) {
      await db.transaction(async tx => {
        if (Object.keys(updateSet).length > 0) {
          await tx
            .update(purchasing)
            .set(updateSet)
            .where(eq(purchasing.id, id));
        }

        if (hasAipPayload) {
          await tx
            .delete(purchasingAip)
            .where(eq(purchasingAip.purchasingId, id));

          if (aipPayload.length > 0) {
            await tx
              .insert(purchasingAip)
              .values(aipPayload.map(entry => {
                const resolved = aipData!.get(entry.id)!;

                return {
                  purchasingId: id,
                  lbacReferenceId: entry.id,
                  aipCode: resolved.aipCode,
                  ppa: resolved.ppa,
                  sourceOfFund: resolved.sourceOfFund,
                };
              }));
          }
        }
      });
    }

    const [item] = await _fetchPurchaseRequestItemBatch([id], user.office.name);
    if (!item) {
      return new Failure(
        ErrorCodes.Fatal,
        "Failed to retrieve updated purchase request item.",
        { id, payload, userId: user.id },
      );
    }

    return new Success(item);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to update purchase request.",
      { id, payload, userId: user.id },
      e,
    );
  }
}

/**
 * Lists all purchase-request rows for the authenticated user's office.
 *
 * @async
 * @function getPurchaseRequests
 * @param {User} user - Authenticated user.
 * @returns {Promise<Result<PurchaseRequestItem[]>>} Purchase request rows for the user's office.
 */
export async function getPurchaseRequests(user: User): Promise<Result<PurchaseRequestItem[]>> {
  try {
    const rows = await db
      .select({ id: purchasing.id })
      .from(purchasing)
      .where(eq(purchasing.requestingOfficeId, user.office.id))
      .orderBy(desc(purchasing.createdAt), desc(purchasing.id));

    const items = await _fetchPurchaseRequestItemBatch(rows.map(row => row.id), user.office.name);
    return new Success(items);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to fetch purchase requests.",
      { userId: user.id },
      e,
    );
  }
}

/**
 * Lists users eligible to sign purchasing documents for the authenticated office.
 *
 * @description
 * Resolves office positions and returns users for three signing roles:
 * - Head of Office (must be in the caller's office and hold `office.head`)
 * - Treasurer (must hold `obr.disbursement.treasurer.approve`)
 * - Mayor (must hold `obr.disbursement.mayor.approve`)
 *
 * @async
 * @function getValidSignatories
 * @param {User} user - Authenticated user requesting valid signatories.
 * @returns {Promise<Result<PurchasingSignatoriesResponse>>} Signatories grouped by role.
 */
export async function getValidSignatories(user: User): Promise<Result<PurchasingSignatoriesResponse>> {
  try {
    const positions = await db
      .select({
        id: officePosition.id,
        name: officePosition.name,
        permissions: officePosition.permissions,
        officeId: officePosition.officeId,
      })
      .from(officePosition);

    const headPositionIds = positions
      .filter(position =>
        position.officeId === user.office.id
          && position.permissions.includes(permissions.OFFICE_HEAD),
      )
      .map(position => position.id);

    const treasurerPositionIds = positions
      .filter(position =>
        position.permissions.includes(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE),
      )
      .map(position => position.id);

    const mayorPositionIds = positions
      .filter(position =>
        position.permissions.includes(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE),
      )
      .map(position => position.id);

    const allPositionIds = Array.from(new Set([
      ...headPositionIds,
      ...treasurerPositionIds,
      ...mayorPositionIds,
    ]));

    if (allPositionIds.length === 0) {
      return new Success({
        headOfOffice: [],
        treasurer: [],
        mayor: [],
      });
    }

    const users = await db
      .select({
        id: userSchema.id,
        name: userSchema.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(userSchema)
      .innerJoin(officePosition, eq(userSchema.officePositionId, officePosition.id))
      .where(inArray(officePosition.id, allPositionIds));

    const heads: PurchasingSignatory[] = [];
    const treasurers: PurchasingSignatory[] = [];
    const mayors: PurchasingSignatory[] = [];

    const headSet = new Set(headPositionIds);
    const treasurerSet = new Set(treasurerPositionIds);
    const mayorSet = new Set(mayorPositionIds);

    for (const signatory of users) {
      const entry: PurchasingSignatory = {
        id: signatory.id,
        name: signatory.name,
        position: signatory.positionName,
      };

      if (headSet.has(signatory.positionId)) {
        heads.push(entry);
      }

      if (treasurerSet.has(signatory.positionId)) {
        treasurers.push(entry);
      }

      if (mayorSet.has(signatory.positionId)) {
        mayors.push(entry);
      }
    }

    const byName = (a: PurchasingSignatory, b: PurchasingSignatory) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" });

    heads.sort(byName);
    treasurers.sort(byName);
    mayors.sort(byName);

    return new Success({
      headOfOffice: heads,
      treasurer: treasurers,
      mayor: mayors,
    });
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to fetch valid purchasing signatories.",
      { userId: user.id },
      e,
    );
  }
}

/**
 * Deletes a single purchase-request row owned by the authenticated user's office.
 *
 * @async
 * @function deletePurchaseRequest
 * @param {string} id - Purchasing row identifier.
 * @param {User} user - Authenticated user.
 * @returns {Promise<Result<null>>} Null on successful deletion.
 */
export async function deletePurchaseRequest(id: string, user: User): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({
        id: purchasing.id,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(eq(purchasing.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such purchase request item found.",
        { id, userId: user.id },
      );
    }

    if (existing.requestingOfficeId !== user.office.id) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        "Cannot delete a purchase request from another office.",
        { id, userId: user.id },
      );
    }

    await db
      .delete(purchasing)
      .where(eq(purchasing.id, id));

    return new Success(null);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to delete purchase request.",
      { id, userId: user.id },
      e,
    );
  }
}

/**
 * Validates signatory users against required permissions and office constraints.
 *
 * @async
 * @function _validateSignatories
 * @param {string} headOfOfficeId - Head-of-office user identifier.
 * @param {string} treasurerId - Treasurer user identifier.
 * @param {string} approverId - Approver user identifier.
 * @param {string} userOfficeId - Office identifier of the request owner.
 * @returns {Promise<string | null>} Validation error text, or null when valid.
 */
async function _validateSignatories(
  headOfOfficeId: string,
  treasurerId: string,
  approverId: string,
  userOfficeId: string,
): Promise<string | null> {
  const [headRows, treasurerRows, approverRows] = await Promise.all([
    db
      .select({
        id: user.id,
        officeId: officePosition.officeId,
        permissions: officePosition.permissions,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(eq(user.id, headOfOfficeId))
      .limit(1),
    db
      .select({
        id: user.id,
        permissions: officePosition.permissions,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(eq(user.id, treasurerId))
      .limit(1),
    db
      .select({
        id: user.id,
        permissions: officePosition.permissions,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(eq(user.id, approverId))
      .limit(1),
  ]);

  const head = headRows[0];
  if (!head) {
    return "Invalid head of office signatory.";
  }

  const headPermissions = new Set(head.permissions);
  if (!headPermissions.has(permissions.OFFICE_HEAD) || head.officeId !== userOfficeId) {
    return "Head of office signatory must belong to your office and hold office-head permission.";
  }

  const treasurer = treasurerRows[0];
  if (!treasurer) {
    return "Invalid treasurer signatory.";
  }

  const treasurerPermissions = new Set(treasurer.permissions);
  if (!treasurerPermissions.has(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE)) {
    return "Treasurer signatory does not have treasurer approval permission.";
  }

  const approver = approverRows[0];
  if (!approver) {
    return "Invalid approver signatory.";
  }

  const approverPermissions = new Set(approver.permissions);
  if (!approverPermissions.has(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE)) {
    return "Approver signatory does not have mayor approval permission.";
  }

  return null;
}

/**
 * Resolves LBAC references into cached AIP details for purchasing_aip rows.
 *
 * @async
 * @function _resolveAipData
 * @param {string[]} lbacIds - LBAC item IDs to resolve.
 * @returns {Promise<Map<string, ResolvedAipData> | null>} Map keyed by LBAC ID, or null when any reference is invalid.
 */
async function _resolveAipData(lbacIds: string[]): Promise<Map<string, ResolvedAipData> | null> {
  const uniqueLbacIds = Array.from(new Set(lbacIds));
  if (uniqueLbacIds.length === 0) {
    return new Map();
  }

  const lbacRows = await db
    .select({
      id: lbacItems.id,
      aipReferenceId: lbacItems.aipRefCode,
      mfoPpa: lbacItems.mfoPpa,
      expenseCodeId: lbacItems.expenseCodeId,
    })
    .from(lbacItems)
    .where(inArray(lbacItems.id, uniqueLbacIds));

  if (lbacRows.length !== uniqueLbacIds.length) {
    return null;
  }

  const aipReferenceIds = Array.from(new Set(
    lbacRows
      .map(row => row.aipReferenceId)
      .filter((id): id is string => typeof id === "string"),
  ));

  const expenseCodeIds = Array.from(new Set(
    lbacRows
      .map(row => row.expenseCodeId)
      .filter((id): id is string => typeof id === "string"),
  ));

  const [aipRows, expenseRows] = await Promise.all([
    aipReferenceIds.length === 0
      ? Promise.resolve([])
      : db
        .select({
          id: aipReferences.id,
          aipReferenceCode: aipReferences.aipReferenceCode,
        })
        .from(aipReferences)
        .where(inArray(aipReferences.id, aipReferenceIds)),
    expenseCodeIds.length === 0
      ? Promise.resolve([])
      : db
        .select({
          id: expenseClasses.id,
          accountName: expenseClasses.accountName,
          accountCode: expenseClasses.accountCode,
        })
        .from(expenseClasses)
        .where(inArray(expenseClasses.id, expenseCodeIds)),
  ]);

  const aipById = new Map(aipRows.map(row => [row.id, row]));
  const expenseById = new Map(expenseRows.map(row => [row.id, row]));

  const result = new Map<string, ResolvedAipData>();

  for (const row of lbacRows) {
    if (!row.aipReferenceId) {
      return null;
    }

    const aipReference = aipById.get(row.aipReferenceId);
    if (!aipReference) {
      return null;
    }

    let sourceOfFund: Optional<string> = null;

    if (row.expenseCodeId) {
      const expenseClass = expenseById.get(row.expenseCodeId);
      if (!expenseClass) {
        return null;
      }

      sourceOfFund = expenseClass.accountCode
        ? `${expenseClass.accountName} ${expenseClass.accountCode}`
        : expenseClass.accountName;
    }

    result.set(row.id, {
      aipCode: aipReference.aipReferenceCode,
      ppa: row.mfoPpa,
      sourceOfFund,
    });
  }

  return result;
}

/**
 * Fetches purchasing rows and all related data in batches.
 *
 * @async
 * @function _fetchPurchaseRequestItemBatch
 * @param {string[]} ids - Purchasing row IDs to fetch.
 * @param {string} officeName - Office name to embed in response objects.
 * @returns {Promise<PurchaseRequestItem[]>} Mapped purchasing records in the same order as the input IDs.
 */
async function _fetchPurchaseRequestItemBatch(
  ids: string[],
  officeName: string,
): Promise<PurchaseRequestItem[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: purchasing.id,
      prNumber: purchasing.prNumber,
      purchaseOrderNumber: purchasing.purchaseOrderNumber,
      supplier: purchasing.supplier,
      address: purchasing.address,
      tinNumber: purchasing.tinNumber,
      placeOfDelivery: purchasing.placeOfDelivery,
      dateOfDelivery: purchasing.dateOfDelivery,
      deliveryTerm: purchasing.deliveryTerm,
      paymentTerm: purchasing.paymentTerm,
      unit: purchasing.unit,
      itemDescription: purchasing.itemDescription,
      quantity: purchasing.quantity,
      unitCost: purchasing.unitCost,
      purpose: purchasing.purpose,
      headOfOfficeId: purchasing.headOfOfficeId,
      headOfOfficeName: purchasing.headOfOfficeName,
      headOfOfficePosition: purchasing.headOfOfficePosition,
      procurementId: purchasing.procurementId,
      treasurerId: purchasing.treasurerId,
      approverId: purchasing.approverId,
      requestingOfficeId: purchasing.requestingOfficeId,
      requestingUserId: purchasing.requestingUserId,
      createdAt: purchasing.createdAt,
    })
    .from(purchasing)
    .where(inArray(purchasing.id, uniqueIds));

  const rowById = new Map(rows.map(row => [row.id, row]));

  const userIds = Array.from(new Set(rows.flatMap(row => [
    row.requestingUserId,
    row.treasurerId,
    row.approverId,
  ])));

  const procurementIds = Array.from(new Set(
    rows
      .map(row => row.procurementId)
      .filter((value): value is string => typeof value === "string"),
  ));

  const [aipRows, users, procurementRows] = await Promise.all([
    db
      .select({
        id: purchasingAip.id,
        purchasingId: purchasingAip.purchasingId,
        lbacReferenceId: purchasingAip.lbacReferenceId,
        aipCode: purchasingAip.aipCode,
        ppa: purchasingAip.ppa,
        sourceOfFund: purchasingAip.sourceOfFund,
        amountCharged: purchasingAip.amountCharged,
      })
      .from(purchasingAip)
      .where(inArray(purchasingAip.purchasingId, uniqueIds)),
    userIds.length === 0
      ? Promise.resolve([])
      : db
        .select({
          id: userSchema.id,
          name: userSchema.name,
          position: officePosition.name,
        })
        .from(userSchema)
        .leftJoin(officePosition, eq(userSchema.officePositionId, officePosition.id))
        .where(inArray(userSchema.id, userIds)),
    procurementIds.length === 0
      ? Promise.resolve([])
      : db
        .select({
          id: modeOfProcurements.id,
          name: modeOfProcurements.name,
          description: modeOfProcurements.description,
        })
        .from(modeOfProcurements)
        .where(inArray(modeOfProcurements.id, procurementIds)),
  ]);

  const aipMap = new Map<string, PurchaseRequestItem["aip"]>();
  for (const aipRow of aipRows) {
    if (!aipMap.has(aipRow.purchasingId)) {
      aipMap.set(aipRow.purchasingId, []);
    }

    aipMap.get(aipRow.purchasingId)!.push({
      id: aipRow.lbacReferenceId,
      aipCode: aipRow.aipCode,
      ppa: aipRow.ppa,
      sourceOfFund: aipRow.sourceOfFund,
      amountCharged: aipRow.amountCharged,
    });
  }

  const userMap = new Map(users.map(row => [row.id, row]));
  const procurementMap = new Map(procurementRows.map(row => [row.id, row]));

  const result: PurchaseRequestItem[] = [];

  for (const id of ids) {
    const row = rowById.get(id);
    if (!row) {
      continue;
    }

    const requestingUser = userMap.get(row.requestingUserId);
    const treasurer = userMap.get(row.treasurerId);
    const approver = userMap.get(row.approverId);

    const modeOfProcurement = row.procurementId
      ? procurementMap.get(row.procurementId)
      : null;

    result.push({
      id: row.id,
      prNumber: row.prNumber,
      date: DateTime
        .fromJSDate(row.createdAt, { zone: "Asia/Manila" })
        .toFormat("MM/dd/yyyy"),
      modeOfProcurement: modeOfProcurement
        ? {
          id: modeOfProcurement.id,
          name: modeOfProcurement.name,
          description: modeOfProcurement.description ?? undefined,
        }
        : null,
      purchaseOrderNumber: row.purchaseOrderNumber,
      supplier: row.supplier,
      address: row.address,
      tinNumber: row.tinNumber,
      placeOfDelivery: row.placeOfDelivery,
      dateOfDelivery: row.dateOfDelivery
        ? DateTime
          .fromJSDate(row.dateOfDelivery, { zone: "UTC" })
          .setZone("Asia/Manila")
          .toFormat("MM/dd/yyyy")
        : null,
      deliveryTerm: row.deliveryTerm,
      paymentTerm: row.paymentTerm,
      unit: row.unit,
      itemDescription: row.itemDescription,
      quantity: row.quantity,
      unitCost: row.unitCost,
      totalCost: casts
        .castFromDecimal(row.quantity)
        .mul(casts.castFromDecimal(row.unitCost))
        .toString(),
      purpose: row.purpose,
      requestingUser: {
        id: row.requestingUserId,
        name: requestingUser?.name ?? "Unknown user",
      },
      requestingOffice: {
        id: row.requestingOfficeId,
        name: officeName,
      },
      headOfOffice: {
        id: row.headOfOfficeId,
        name: row.headOfOfficeName,
        position: row.headOfOfficePosition,
      },
      approvedBy: {
        id: row.approverId,
        name: approver?.name ?? "Unknown user",
        position: approver?.position ?? "",
      },
      treasurer: {
        id: row.treasurerId,
        name: treasurer?.name ?? "Unknown user",
        position: treasurer?.position ?? "",
      },
      aip: aipMap.get(row.id) ?? [],
    });
  }

  return result;
}

/**
 * Parses an ISO date string from UTC+8 into a UTC JS Date.
 *
 * @param {string} value - ISO date text from client.
 * @returns {Date | null} UTC Date when valid, otherwise null.
 */
function _parseDateFromManilaToUtc(value: string): Date | null {
  const parsed = DateTime.fromISO(value, { zone: "Asia/Manila" });
  if (!parsed.isValid) {
    return null;
  }

  return parsed.toUTC().toJSDate();
}

type ResolvedAipData = {
  aipCode: string;
  ppa: string;
  sourceOfFund: Optional<string>;
};

/**
 * Creates/assigns purchase-order details for one or more purchase-request rows.
 */
export type PurchaseOrderPayload = {
  supplier: string;
  address: string;
  tinNumber?: string;
  purchaseOrderNumber: string;
  modeOfProcurementId?: string;
  placeOfDelivery?: string;
  dateOfDelivery?: string;
  deliveryTerm?: string;
  paymentTerm?: string;
  items: Array<string>;
};

/**
 * Updates a single purchasing row without touching item columns.
 */
export type UpdatePurchaseRequestPayload = Partial<
  Omit<PurchaseRequestPayload, "signatories" | "items"> & Omit<PurchaseOrderPayload, "items">
>;

/**
 * Purchasing item model returned by purchasing service functions.
 */
export type PurchaseRequestItem = {
  id: string;
  prNumber: string;
  date: string;
  modeOfProcurement: Optional<{
    id: string;
    name: string;
    description?: string;
  }>;
  purchaseOrderNumber: Optional<string>;
  supplier: Optional<string>;
  address: Optional<string>;
  tinNumber: Optional<string>;
  placeOfDelivery: Optional<string>;
  dateOfDelivery: Optional<string>;
  deliveryTerm: Optional<string>;
  paymentTerm: Optional<string>;
  unit: string;
  itemDescription: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  purpose: string;
  requestingUser: {
    id: string;
    name: string;
  };
  requestingOffice: {
    id: string;
    name: string;
  };
  headOfOffice: {
    id: string;
    name: string;
    position: string;
  };
  approvedBy: {
    id: string;
    name: string;
    position: string;
  };
  treasurer: {
    id: string;
    name: string;
    position: string;
  };
  aip: Array<{
    id: string;
    aipCode: string;
    ppa: string;
    sourceOfFund: Optional<string>;
    amountCharged: Optional<string>;
  }>;
};

/**
 * Creates purchase-request rows for a single purchase request number.
 */
export type PurchaseRequestPayload = {
  prNumber: string;
  items: Array<{
    unit: string;
    description: string;
    quantity: string;
    unitCost: string;
  }>;
  purpose: string;
  aip: Array<{
    idx: number;
    id: string;
  }>;
  signatories: {
    headOfOfficeId: string;
    treasurerId: string;
    approverId: string;
  };
};

export type PurchasingSignatory = {
  id: string;
  name: string;
  position: string;
};

export type PurchasingSignatoriesResponse = {
  headOfOffice: PurchasingSignatory[];
  treasurer: PurchasingSignatory[];
  mayor: PurchasingSignatory[];
};
