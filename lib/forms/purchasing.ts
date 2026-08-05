import {desc, eq, inArray} from 'drizzle-orm';
import {DateTime} from 'luxon';
import {toWords} from 'to-words';

import {type User} from '@/lib/accounts';
import {db} from '@/lib/db';
import * as permissions from '@/lib/db/permissions';
import {
  aipReferences,
  expenseClasses,
  lbacItems,
  modeOfProcurements,
  office,
  officePosition,
  purchasing,
  purchasingAip,
  user,
} from '@/lib/db/schema';
import {ErrorCodes, Failure, Result, Success} from '@/lib/one-of';
import * as casts from '@/lib/types/casts';

/**
 * Creates purchase-request rows for the requesting office actor.
 *
 * @description
 * Validates signatories, resolves all LBAC-derived AIP metadata, inserts one purchasing row per item,
 * and inserts cached AIP rows for every inserted purchasing row.
 *
 * @async
 * @function createPurchaseRequest
 * @param {PurchaseRequestPayload} payload - Purchase request payload.
 * @param {User} actor - Authenticated actor creating the purchase request.
 * @returns {Promise<Result<PurchaseRequestItem[]>>} Created purchase-request rows mapped for API response.
 */
export async function createPurchaseRequest(
  payload: PurchaseRequestPayload,
  actor: User,
): Promise<Result<PurchaseRequestItem[]>> {
  try {
    if (payload.items.length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, 'At least one purchase item is required.', {
        payload,
        userId: actor.id,
      });
    }

    if (payload.aip.length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, 'At least one AIP reference is required.', {
        payload,
        userId: actor.id,
      });
    }

    const signatoryError = await _validateSignatories(
      payload.signatories.headOfOfficeId,
      payload.signatories.treasurerId,
      payload.signatories.approverId,
      actor.office.id,
    );
    if (signatoryError) {
      return new Failure(ErrorCodes.ValidationFailure, signatoryError, {payload, userId: actor.id});
    }

    const aipData = await _resolveAipData(payload.aip.map((a) => a.id));
    if (!aipData) {
      return new Failure(ErrorCodes.ValidationFailure, 'Some AIP references cannot be resolved.', {
        payload,
        userId: actor.id,
      });
    }

    const signatoryIds = Array.from(
      new Set([
        payload.signatories.headOfOfficeId,
        payload.signatories.treasurerId,
        payload.signatories.approverId,
      ]),
    );

    const signatoryRows = await db
      .select({
        id: user.id,
        name: user.name,
        position: officePosition.name,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
      .where(inArray(user.id, signatoryIds));

    if (signatoryRows.length !== signatoryIds.length) {
      return new Failure(ErrorCodes.ValidationFailure, 'Some signatories cannot be resolved.', {
        payload,
        userId: actor.id,
      });
    }

    const signatoryMap = new Map(signatoryRows.map((s) => [s.id, s]));
    const headOfOffice = signatoryMap.get(payload.signatories.headOfOfficeId);
    if (!headOfOffice) {
      return new Failure(ErrorCodes.ValidationFailure, 'Invalid head of office signatory.', {
        payload,
        userId: actor.id,
      });
    }

    const insertedIds = await db.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(purchasing)
        .values(
          payload.items.map((item) => ({
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
            requestingOfficeId: actor.office.id,
            requestingUserId: actor.id,
          })),
        )
        .returning({id: purchasing.id});

      const aipInsertRows = insertedRows.flatMap((inserted) =>
        payload.aip.map((entry) => {
          const resolved = aipData.get(entry.id)!;

          return {
            purchasingId: inserted.id,
            lbacReferenceId: entry.id,
            aipCode: resolved.aipCode,
            ppa: resolved.ppa,
            sourceOfFund: resolved.sourceOfFund,
          };
        }),
      );

      if (aipInsertRows.length > 0) {
        await tx.insert(purchasingAip).values(aipInsertRows);
      }

      return insertedRows.map((row) => row.id);
    });

    const items = await _fetchPurchaseRequestItemBatch(insertedIds, actor.office.name);
    return new Success(items);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to create purchase request.',
      {payload, userId: actor.id},
      e,
    );
  }
}

/**
 * Creates purchase-order details for a set of purchasing rows.
 *
 * @description
 * Ensures all purchasing rows exist in the caller's office, validates mode of procurement when provided,
 * then applies purchase-order fields in one update transaction.
 *
 * @async
 * @function createPurchaseOrder
 * @param {PurchaseOrderPayload} payload - Purchase order payload.
 * @param {User} actor - Authenticated actor creating the purchase order.
 * @returns {Promise<Result<PurchaseRequestItem[]>>} Updated purchase-request rows mapped for API response.
 */
export async function createPurchaseOrder(
  payload: PurchaseOrderPayload,
  actor: User,
): Promise<Result<PurchaseRequestItem[]>> {
  try {
    if (payload.items.length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        'At least one purchase request item is required.',
        {payload, userId: actor.id},
      );
    }

    const uniqueIds = Array.from(new Set(payload.items));

    const targetRows = await db
      .select({
        id: purchasing.id,
        prNumber: purchasing.prNumber,
        purchaseOrderNumber: purchasing.purchaseOrderNumber,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(inArray(purchasing.id, uniqueIds));

    if (targetRows.length !== uniqueIds.length) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        'Some purchase request items were not found.',
        {payload, userId: actor.id},
      );
    }

    if (targetRows.some((row) => row.requestingOfficeId !== actor.office.id)) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        'Cannot create purchase order for another office.',
        {payload, userId: actor.id},
      );
    }

    if (targetRows.some((row) => row.purchaseOrderNumber?.trim())) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        'One or more selected items already have a purchase order assigned.',
        {payload, userId: actor.id},
      );
    }

    const normalizedProcurementId =
      typeof payload.modeOfProcurementId === 'string' ? payload.modeOfProcurementId.trim() : '';

    let procurementId: string | null = null;
    if (normalizedProcurementId) {
      const [procurement] = await db
        .select({id: modeOfProcurements.id})
        .from(modeOfProcurements)
        .where(eq(modeOfProcurements.id, normalizedProcurementId))
        .limit(1);

      if (!procurement) {
        return new Failure(ErrorCodes.ValidationFailure, 'Invalid mode of procurement.', {
          payload,
          userId: actor.id,
        });
      }

      procurementId = normalizedProcurementId;
    }

    const dateOfDelivery = payload.dateOfDelivery
      ? _parseDateFromManilaToUtc(payload.dateOfDelivery)
      : null;

    if (payload.dateOfDelivery && !dateOfDelivery) {
      return new Failure(ErrorCodes.ValidationFailure, 'Invalid delivery date.', {
        payload,
        userId: actor.id,
      });
    }

    await db.transaction(async (tx) => {
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

    const items = await _fetchPurchaseRequestItemBatch(uniqueIds, actor.office.name);
    return new Success(items);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to create purchase order.',
      {payload, userId: actor.id},
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
 * @param {User} actor - Authenticated actor requesting the update.
 * @returns {Promise<Result<PurchaseRequestItem>>} Updated row mapped for API response.
 */
export async function updateRequest(
  id: string,
  payload: UpdatePurchaseRequestPayload,
  actor: User,
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
      return new Failure(ErrorCodes.ResourceNotFound, 'No such purchase request item found.', {
        id,
        payload,
        userId: actor.id,
      });
    }

    if (existing.requestingOfficeId !== actor.office.id) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        'Cannot update a purchase request from another office.',
        {id, payload, userId: actor.id},
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
      const normalizedProcurementId =
        typeof payload.modeOfProcurementId === 'string' ? payload.modeOfProcurementId.trim() : '';

      if (!normalizedProcurementId) {
        updateSet.procurementId = null;
      } else {
        const [procurement] = await db
          .select({id: modeOfProcurements.id})
          .from(modeOfProcurements)
          .where(eq(modeOfProcurements.id, normalizedProcurementId))
          .limit(1);

        if (!procurement) {
          return new Failure(ErrorCodes.ValidationFailure, 'Invalid mode of procurement.', {
            id,
            payload,
            userId: actor.id,
          });
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
        return new Failure(ErrorCodes.ValidationFailure, 'Invalid delivery date.', {
          id,
          payload,
          userId: actor.id,
        });
      }

      updateSet.dateOfDelivery = parsedDate;
    }

    if (payload.deliveryTerm !== undefined) {
      updateSet.deliveryTerm = payload.deliveryTerm;
    }

    if (payload.paymentTerm !== undefined) {
      updateSet.paymentTerm = payload.paymentTerm;
    }

    const hasAipPayload = Object.prototype.hasOwnProperty.call(payload, 'aip');
    const aipPayload = payload.aip ?? [];

    let aipData: Map<string, ResolvedAipData> | null = null;
    if (hasAipPayload) {
      aipData = await _resolveAipData(aipPayload.map((a) => a.id));
      if (!aipData) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          'Some AIP references cannot be resolved.',
          {id, payload, userId: actor.id},
        );
      }
    }

    if (Object.keys(updateSet).length > 0 || hasAipPayload) {
      await db.transaction(async (tx) => {
        if (Object.keys(updateSet).length > 0) {
          await tx.update(purchasing).set(updateSet).where(eq(purchasing.id, id));
        }

        if (hasAipPayload) {
          await tx.delete(purchasingAip).where(eq(purchasingAip.purchasingId, id));

          if (aipPayload.length > 0) {
            await tx.insert(purchasingAip).values(
              aipPayload.map((entry) => {
                const resolved = aipData!.get(entry.id)!;

                return {
                  purchasingId: id,
                  lbacReferenceId: entry.id,
                  aipCode: resolved.aipCode,
                  ppa: resolved.ppa,
                  sourceOfFund: resolved.sourceOfFund,
                };
              }),
            );
          }
        }
      });
    }

    const [item] = await _fetchPurchaseRequestItemBatch([id], actor.office.name);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, 'Failed to retrieve updated purchase request item.', {
        id,
        payload,
        userId: actor.id,
      });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to update purchase request.',
      {id, payload, userId: actor.id},
      e,
    );
  }
}

/**
 * Lists all purchase-request rows for the authenticated actor's office.
 *
 * @async
 * @function getPurchaseRequests
 * @param {User} actor - Authenticated actor.
 * @returns {Promise<Result<PurchaseRequestItem[]>>} Purchase request rows for the actor's office.
 */
export async function getPurchaseRequests(actor: User): Promise<Result<PurchaseRequestItem[]>> {
  try {
    const rows = await db
      .select({id: purchasing.id})
      .from(purchasing)
      .where(eq(purchasing.requestingOfficeId, actor.office.id))
      .orderBy(desc(purchasing.createdAt), desc(purchasing.id));

    const items = await _fetchPurchaseRequestItemBatch(
      rows.map((row) => row.id),
      actor.office.name,
    );
    return new Success(items);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to fetch purchase requests.',
      {userId: actor.id},
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
 * @param {User} actor - Authenticated actor requesting valid signatories.
 * @returns {Promise<Result<PurchasingSignatoriesResponse>>} Signatories grouped by role.
 */
export async function getValidSignatories(
  actor: User,
): Promise<Result<PurchasingSignatoriesResponse>> {
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
      .filter(
        (position) =>
          position.officeId === actor.office.id &&
          position.permissions.includes(permissions.OFFICE_HEAD),
      )
      .map((position) => position.id);

    const treasurerPositionIds = positions
      .filter((position) =>
        position.permissions.includes(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE),
      )
      .map((position) => position.id);

    const mayorPositionIds = positions
      .filter((position) =>
        position.permissions.includes(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE),
      )
      .map((position) => position.id);

    const allPositionIds = Array.from(
      new Set([...headPositionIds, ...treasurerPositionIds, ...mayorPositionIds]),
    );

    if (allPositionIds.length === 0) {
      return new Success({
        headOfOffice: [],
        treasurer: [],
        mayor: [],
      });
    }

    const users = await db
      .select({
        id: user.id,
        name: user.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(user)
      .innerJoin(officePosition, eq(user.officePositionId, officePosition.id))
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
      a.name.localeCompare(b.name, 'en', {sensitivity: 'base'});

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
      'Unable to fetch valid purchasing signatories.',
      {userId: actor.id},
      e,
    );
  }
}

/**
 * Deletes a single purchase-request row owned by the authenticated actor's office.
 *
 * @async
 * @function deletePurchaseRequest
 * @param {string} id - Purchasing row identifier.
 * @param {User} actor - Authenticated actor.
 * @returns {Promise<Result<null>>} Null on successful deletion.
 */
export async function deletePurchaseRequest(id: string, actor: User): Promise<Result<null>> {
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
      return new Failure(ErrorCodes.ResourceNotFound, 'No such purchase request item found.', {
        id,
        userId: actor.id,
      });
    }

    if (existing.requestingOfficeId !== actor.office.id) {
      return new Failure(
        ErrorCodes.InsufficientPermissions,
        'Cannot delete a purchase request from another office.',
        {id, userId: actor.id},
      );
    }

    await db.delete(purchasing).where(eq(purchasing.id, id));

    return new Success(null);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to delete purchase request.',
      {id, userId: actor.id},
      e,
    );
  }
}

export async function exportPurchaseRequestToBuffer(
  options: ExportPurchaseOptions,
): Promise<Result<Buffer>> {
  try {
    const {Workbook} = await import('@cj-tech-master/excelts');

    const [sourceItem] = await db
      .select({
        prNumber: purchasing.prNumber,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(eq(purchasing.id, options.id))
      .limit(1);

    if (!sourceItem) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Purchase request item not found.');
    }

    const allIds = await db
      .select({id: purchasing.id})
      .from(purchasing)
      .where(eq(purchasing.prNumber, sourceItem.prNumber))
      .orderBy(purchasing.createdAt);

    if (allIds.length === 0) {
      return new Failure(ErrorCodes.ResourceNotFound, 'No purchase request items found.');
    }

    const ids = allIds.map((r) => r.id);

    const rows = await db.select().from(purchasing).where(inArray(purchasing.id, ids));

    const aipRows = await db
      .select()
      .from(purchasingAip)
      .where(inArray(purchasingAip.purchasingId, ids));

    const [officeRow] = await db
      .select({name: office.name})
      .from(office)
      .where(eq(office.id, sourceItem.requestingOfficeId))
      .limit(1);

    const userIds = Array.from(
      new Set(
        rows.flatMap((r) => [r.requestingUserId, r.treasurerId, r.approverId, r.headOfOfficeId]),
      ),
    );

    const userRows =
      userIds.length > 0
        ? await db
            .select({
              id: user.id,
              name: user.name,
              position: officePosition.name,
            })
            .from(user)
            .leftJoin(officePosition, eq(user.officePositionId, officePosition.id))
            .where(inArray(user.id, userIds))
        : [];

    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const aipMap = new Map<
      string,
      Array<{
        aipCode: string;
        ppa: string;
        sourceOfFund: string | null;
        amountCharged: string | null;
      }>
    >();
    for (const ar of aipRows) {
      if (!aipMap.has(ar.purchasingId)) {
        aipMap.set(ar.purchasingId, []);
      }
      aipMap.get(ar.purchasingId)!.push({
        aipCode: ar.aipCode,
        ppa: ar.ppa,
        sourceOfFund: ar.sourceOfFund,
        amountCharged: ar.amountCharged,
      });
    }

    const first = rows[0];
    const firstAip = aipMap.get(first.id) ?? [];
    const aipCode = firstAip[0]?.aipCode ?? '';
    const ppa = firstAip[0]?.ppa ?? '';

    const resolveSignatory = (userId: string): ExportSignatory => {
      const u = userMap.get(userId);
      return {name: u?.name ?? 'Unknown', title: u?.position ?? ''};
    };

    const requestedBy = resolveSignatory(first.headOfOfficeId);
    const cashAvailable = resolveSignatory(first.treasurerId);
    const approvedByUser = resolveSignatory(first.approverId);

    const items: ExportItem[] = rows.map((row, idx) => ({
      id: idx + 1,
      unit: row.unit,
      description: row.itemDescription,
      quantity: row.quantity === null ? '' : Number(row.quantity),
      unitCost: row.unitCost === null ? '' : Number(row.unitCost),
    }));

    const wb = new Workbook();
    const ws = wb.addWorksheet('Purchase Request', {views: [{showGridLines: true}]});

    ws.columns = [{width: 10}, {width: 12}, {width: 42}, {width: 12}, {width: 14}, {width: 16}];

    const thinSide = {style: 'thin' as const, color: {argb: '000000'}};
    const thinBorder = {top: thinSide, bottom: thinSide, left: thinSide, right: thinSide};

    const applyBorders = (startRow: number, endRow: number, startCol: number, endCol: number) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          ws.getCell(r, c).border = thinBorder;
        }
      }
    };

    ws.mergeCells('A2:F2');
    const titleCell = ws.getCell('A2');
    titleCell.value = 'PURCHASE REQUEST';
    titleCell.font = {name: 'Arial', size: 18, bold: true};
    titleCell.alignment = {horizontal: 'center', vertical: 'middle'};
    ws.getRow(2).height = 32;

    ws.getCell('A4').value = 'LGU:   MUNICIPAL GOVERNMENT OF TIGBAUAN';
    ws.getCell('A4').font = {name: 'Arial', size: 11, bold: true};

    ws.getCell('E4').value = 'Fund:';
    ws.getCell('E4').font = {name: 'Arial', size: 11};
    ws.getCell('E4').alignment = {horizontal: 'right'};
    ws.getCell('F4').value = firstAip[0]?.sourceOfFund ?? '';
    ws.getCell('F4').font = {name: 'Arial', size: 11, bold: true, underline: true};

    applyBorders(5, 6, 1, 3);
    applyBorders(5, 6, 4, 5);
    applyBorders(5, 6, 6, 6);

    ws.mergeCells('A5:C5');
    ws.getCell('A5').value = `Department:  ${officeRow?.name ?? ''}`;
    ws.getCell('A5').font = {name: 'Arial', size: 10};

    ws.mergeCells('A6:C6');
    ws.getCell('A6').value = `Section:       ${''}`;
    ws.getCell('A6').font = {name: 'Arial', size: 10};

    ws.getCell('D5').value = 'PR No.';
    ws.getCell('D5').font = {name: 'Arial', size: 10};
    ws.getCell('E5').value = first.prNumber ?? '';
    ws.getCell('E5').font = {name: 'Arial', size: 10, bold: true, color: {argb: 'FFFF0000'}};

    ws.mergeCells('D6:E6');
    ws.getCell('D6').value = `FPP: ${''}`;
    ws.getCell('D6').font = {name: 'Arial', size: 10};

    ws.getCell('F5').value = 'Date:';
    ws.getCell('F5').font = {name: 'Arial', size: 10};

    const headers = ['Item No.', 'Unit', 'Item Description', 'Quantity', 'Unit Cost', 'Total Cost'];
    const headerRow = ws.getRow(8);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = {name: 'Arial', size: 10, bold: true};
      cell.alignment = {horizontal: 'center', vertical: 'middle'};
      cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFFFF2CC'}};
      cell.border = thinBorder;
    });

    let currentLine = 9;
    let grandTotal = 0;
    for (const item of items) {
      const row = ws.getRow(currentLine);
      row.height = 20;
      row.getCell(1).value = item.id;
      row.getCell(1).alignment = {horizontal: 'center'};
      row.getCell(2).value = item.unit;
      row.getCell(2).alignment = {horizontal: 'center'};
      row.getCell(3).value = item.description;
      row.getCell(3).alignment = {horizontal: 'left'};
      row.getCell(4).value = item.quantity;
      row.getCell(4).alignment = {horizontal: 'center'};
      row.getCell(5).value = item.unitCost;
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(5).alignment = {horizontal: 'right'};
      if (typeof item.quantity === 'number' && typeof item.unitCost === 'number') {
        const itemTotal = item.quantity * item.unitCost;
        grandTotal += itemTotal;
        row.getCell(6).value = {formula: `D${currentLine}*E${currentLine}`, result: itemTotal};
      } else {
        row.getCell(6).value = '-';
      }
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(6).alignment = {horizontal: 'right'};
      for (let c = 1; c <= 6; c++) {
        row.getCell(c).border = thinBorder;
        row.getCell(c).font = {name: 'Arial', size: 10};
      }
      currentLine++;
    }

    const totalRow = ws.getRow(currentLine);
    ws.mergeCells(`A${currentLine}:E${currentLine}`);
    totalRow.getCell(1).value = 'TOTAL-------';
    totalRow.getCell(1).font = {name: 'Arial', size: 10, bold: true};
    totalRow.getCell(1).alignment = {horizontal: 'right'};
    totalRow.getCell(6).value = {formula: `SUM(F9:F${currentLine - 1})`, result: grandTotal};
    totalRow.getCell(6).font = {name: 'Arial', size: 10, bold: true};
    totalRow.getCell(6).numFmt = '#,##0.00';
    totalRow.getCell(6).alignment = {horizontal: 'right'};
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    ws.mergeCells(`A${currentLine}:A${currentLine + 2}`);
    ws.getCell(`A${currentLine}`).value = 'Purpose:';
    ws.getCell(`A${currentLine}`).font = {name: 'Arial', size: 10};
    ws.getCell(`A${currentLine}`).alignment = {vertical: 'top'};
    ws.mergeCells(`B${currentLine}:F${currentLine + 2}`);
    ws.getCell(`B${currentLine}`).value = first.purpose ?? '';
    ws.getCell(`B${currentLine}`).font = {name: 'Arial', size: 10};
    ws.getCell(`B${currentLine}`).alignment = {vertical: 'top', wrapText: true};
    applyBorders(currentLine, currentLine + 2, 1, 6);
    currentLine += 3;

    ws.getCell(`A${currentLine}`).value = 'AIP/PPA:';
    ws.getCell(`A${currentLine}`).font = {name: 'Arial', size: 10};
    ws.mergeCells(`B${currentLine}:F${currentLine}`);
    ws.getCell(`B${currentLine}`).value = `${ppa}          ${aipCode}`;
    ws.getCell(`B${currentLine}`).font = {name: 'Arial', size: 9};
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    ws.getCell(`A${currentLine}`).value = 'Charges:';
    ws.getCell(`A${currentLine}`).font = {name: 'Arial', size: 10};
    ws.mergeCells(`B${currentLine}:F${currentLine + 1}`);
    ws.getCell(`B${currentLine}`).value = `${firstAip[0]?.sourceOfFund ?? ''}\n${aipCode}`;
    ws.getCell(`B${currentLine}`).font = {name: 'Arial', size: 9};
    ws.getCell(`B${currentLine}`).alignment = {wrapText: true, vertical: 'top'};
    applyBorders(currentLine, currentLine + 1, 1, 6);
    currentLine += 2;

    ws.mergeCells(`A${currentLine}:B${currentLine}`);
    ws.getCell(`A${currentLine}`).value = 'Requested by:';
    ws.mergeCells(`C${currentLine}:D${currentLine}`);
    ws.getCell(`C${currentLine}`).value = 'Cash Availability:';
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(`E${currentLine}`).value = 'Approved by:';
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).font = {name: 'Arial', size: 10, bold: true};
      ws.getCell(currentLine, col).border = {
        top: thinSide,
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }
    currentLine++;

    ws.getRow(currentLine).height = 35;
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).border = {
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }
    currentLine++;

    ws.mergeCells(`A${currentLine}:B${currentLine}`);
    ws.getCell(`A${currentLine}`).value = requestedBy.name;
    ws.mergeCells(`C${currentLine}:D${currentLine}`);
    ws.getCell(`C${currentLine}`).value = cashAvailable.name;
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(`E${currentLine}`).value = approvedByUser.name;
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).font = {name: 'Arial', size: 10, bold: true};
      ws.getCell(currentLine, col).alignment = {horizontal: 'center'};
      ws.getCell(currentLine, col).border = {
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }
    currentLine++;

    ws.getRow(currentLine).height = 32;
    ws.mergeCells(`A${currentLine}:B${currentLine}`);
    ws.getCell(`A${currentLine}`).value = requestedBy.title;
    ws.mergeCells(`C${currentLine}:D${currentLine}`);
    ws.getCell(`C${currentLine}`).value = cashAvailable.title;
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(`E${currentLine}`).value = approvedByUser.title;
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).font = {name: 'Arial', size: 9};
      ws.getCell(currentLine, col).alignment = {
        horizontal: 'center',
        wrapText: true,
        vertical: 'middle',
      };
      ws.getCell(currentLine, col).border = {
        bottom: thinSide,
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }

    const rawBuffer = await wb.xlsx.writeBuffer();
    if (rawBuffer instanceof Buffer) return new Success(rawBuffer);
    return new Success(Buffer.from(rawBuffer as unknown as Uint8Array));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Failed to export purchase request.', {}, e as Error);
  }
}

export async function exportPurchaseOrderToBuffer(
  options: ExportPurchaseOptions,
): Promise<Result<Buffer>> {
  try {
    const {Workbook} = await import('@cj-tech-master/excelts');

    const [sourceItem] = await db
      .select({
        purchaseOrderNumber: purchasing.purchaseOrderNumber,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(eq(purchasing.id, options.id))
      .limit(1);

    if (!sourceItem) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Purchase order item not found.');
    }

    if (!sourceItem.purchaseOrderNumber) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        'Purchase order has not been created for this item.',
      );
    }

    const allIds = await db
      .select({id: purchasing.id})
      .from(purchasing)
      .where(eq(purchasing.purchaseOrderNumber, sourceItem.purchaseOrderNumber))
      .orderBy(purchasing.createdAt);

    if (allIds.length === 0) {
      return new Failure(ErrorCodes.ResourceNotFound, 'No purchase order items found.');
    }

    const ids = allIds.map((r) => r.id);

    const rows = await db.select().from(purchasing).where(inArray(purchasing.id, ids));

    const first = rows[0];
    const prNumbers = Array.from(new Set(rows.map((row) => row.prNumber))).join(', ');

    const items: ExportItem[] = rows.map((row, idx) => ({
      id: idx + 1,
      unit: row.unit,
      description: row.itemDescription,
      quantity: row.quantity === null ? '' : Number(row.quantity),
      unitCost: row.unitCost === null ? '' : Number(row.unitCost),
    }));

    let modeOfProcurement = '';
    if (first.procurementId) {
      const [procRow] = await db
        .select({name: modeOfProcurements.name})
        .from(modeOfProcurements)
        .where(eq(modeOfProcurements.id, first.procurementId))
        .limit(1);
      modeOfProcurement = procRow?.name ?? '';
    }

    const wb = new Workbook();
    const ws = wb.addWorksheet('Purchase Order', {views: [{showGridLines: true}]});

    ws.columns = [{width: 10}, {width: 12}, {width: 42}, {width: 12}, {width: 14}, {width: 16}];

    const thinSide = {style: 'thin' as const, color: {argb: '000000'}};
    const thinBorder = {top: thinSide, bottom: thinSide, left: thinSide, right: thinSide};

    const applyBorders = (startRow: number, endRow: number, startCol: number, endCol: number) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          ws.getCell(r, c).border = thinBorder;
        }
      }
    };

    const formatDate = (d: Date | null | undefined): string =>
      d
        ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
        : '';

    // ── Title section ──────────────────────────────────────────────────────
    ws.mergeCells('A2:F2');
    const titleCell = ws.getCell('A2');
    titleCell.value = 'PURCHASE ORDER';
    titleCell.font = {name: 'Arial', size: 18, bold: true};
    titleCell.alignment = {horizontal: 'center', vertical: 'middle'};
    ws.getRow(2).height = 32;

    ws.mergeCells('A3:F3');
    const subCell = ws.getCell('A3');
    subCell.value = 'Municipal Government of Tigbauan';
    subCell.font = {name: 'Arial', size: 13, bold: true};
    subCell.alignment = {horizontal: 'center', vertical: 'middle'};
    ws.getRow(3).height = 24;

    ws.mergeCells('A4:F4');
    const lguCell = ws.getCell('A4');
    lguCell.value = 'LGU';
    lguCell.font = {name: 'Arial', size: 11, bold: true};
    lguCell.alignment = {horizontal: 'center', vertical: 'middle'};
    ws.getRow(4).height = 20;

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(5, 5, 1, 6);

    // ── Supplier / PO details (rows 6-8) ───────────────────────────────────
    const poDateStr = formatDate(first.createdAt);

    type FieldRow = {label: string; value: string; bold?: boolean; red?: boolean};
    const leftFields: FieldRow[] = [
      {label: 'Supplier:', value: first.supplier ?? ''},
      {label: 'Address:', value: first.address ?? ''},
      {label: 'TIN:', value: first.tinNumber ?? ''},
      {label: '', value: ''},
    ];
    const rightFields: FieldRow[] = [
      {label: 'PO No.:', value: first.purchaseOrderNumber ?? '', bold: true, red: true},
      {label: 'Date:', value: poDateStr},
      {label: 'Mode of Procurement:', value: modeOfProcurement},
      {label: 'PR No./s:', value: prNumbers, bold: true, red: true},
    ];

    for (let i = 0; i < 4; i++) {
      const r = 6 + i;
      applyBorders(r, r, 1, 6);

      // Left side: label in col A, value merged B:C
      ws.getCell(r, 1).value = leftFields[i].label;
      ws.getCell(r, 1).font = {name: 'Arial', size: 10, bold: true};
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(r, 2).value = leftFields[i].value;
      ws.getCell(r, 2).font = {name: 'Arial', size: 10};

      // Right side: label in col D, value merged E:F
      ws.getCell(r, 4).value = rightFields[i].label;
      ws.getCell(r, 4).font = {name: 'Arial', size: 10, bold: true};
      ws.mergeCells(`E${r}:F${r}`);
      ws.getCell(r, 5).value = rightFields[i].value;
      ws.getCell(r, 5).font = {
        name: 'Arial',
        size: 10,
        bold: i === 0 || i === 3,
        color: i === 0 || i === 3 ? {argb: 'FFFF0000'} : undefined,
      };
    }

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(10, 10, 1, 6);

    // ── Salutation ─────────────────────────────────────────────────────────
    ws.mergeCells('A11:F11');
    ws.getCell('A11').value = 'Gentlemen:';
    ws.getCell('A11').font = {name: 'Arial', size: 10};
    ws.getRow(11).height = 18;

    ws.mergeCells('A12:F12');
    ws.getCell('A12').value =
      '    Please furnish this Office the following articles subject to the terms and conditions contained herein:';
    ws.getCell('A12').font = {name: 'Arial', size: 10};
    ws.getRow(12).height = 18;

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(13, 13, 1, 6);

    // ── Delivery details (rows 14-15) ──────────────────────────────────────
    const deliveryDateStr = formatDate(first.dateOfDelivery);

    const deliveryLeft: FieldRow[] = [
      {label: 'Place of Delivery:', value: first.placeOfDelivery ?? ''},
      {label: 'Date of Delivery:', value: deliveryDateStr},
    ];
    const deliveryRight: FieldRow[] = [
      {label: 'Delivery Term:', value: first.deliveryTerm ?? ''},
      {label: 'Payment Term:', value: first.paymentTerm ?? ''},
    ];

    for (let i = 0; i < 2; i++) {
      const r = 14 + i;
      applyBorders(r, r, 1, 6);

      ws.getCell(r, 1).value = deliveryLeft[i].label;
      ws.getCell(r, 1).font = {name: 'Arial', size: 10, bold: true};
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(r, 2).value = deliveryLeft[i].value;
      ws.getCell(r, 2).font = {name: 'Arial', size: 10};

      ws.getCell(r, 4).value = deliveryRight[i].label;
      ws.getCell(r, 4).font = {name: 'Arial', size: 10, bold: true};
      ws.mergeCells(`E${r}:F${r}`);
      ws.getCell(r, 5).value = deliveryRight[i].value;
      ws.getCell(r, 5).font = {name: 'Arial', size: 10};
    }

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(16, 16, 1, 6);

    // ── Table header ───────────────────────────────────────────────────────
    const headers = ['Item No.', 'Unit', 'Item Description', 'Quantity', 'Unit Cost', 'Total Cost'];
    const headerRow = ws.getRow(17);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = {name: 'Arial', size: 10, bold: true};
      cell.alignment = {horizontal: 'center', vertical: 'middle'};
      cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFFFF2CC'}};
      cell.border = thinBorder;
    });

    // ── Separator below header ─────────────────────────────────────────────
    applyBorders(18, 18, 1, 6);

    // ── Item rows ──────────────────────────────────────────────────────────
    let currentLine = 19;
    let grandTotal = 0;
    for (const item of items) {
      const row = ws.getRow(currentLine);
      row.height = 20;
      row.getCell(1).value = item.id;
      row.getCell(1).alignment = {horizontal: 'center'};
      row.getCell(2).value = item.unit;
      row.getCell(2).alignment = {horizontal: 'center'};
      row.getCell(3).value = item.description;
      row.getCell(3).alignment = {horizontal: 'left'};
      row.getCell(4).value = item.quantity;
      row.getCell(4).alignment = {horizontal: 'center'};
      row.getCell(5).value = item.unitCost;
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(5).alignment = {horizontal: 'right'};
      if (typeof item.quantity === 'number' && typeof item.unitCost === 'number') {
        const itemTotal = item.quantity * item.unitCost;
        grandTotal += itemTotal;
        row.getCell(6).value = {formula: `D${currentLine}*E${currentLine}`, result: itemTotal};
      } else {
        row.getCell(6).value = '-';
      }
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(6).alignment = {horizontal: 'right'};
      for (let c = 1; c <= 6; c++) {
        row.getCell(c).border = thinBorder;
        row.getCell(c).font = {name: 'Arial', size: 10};
      }
      currentLine++;
    }

    // ── Separator after items ──────────────────────────────────────────────
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    // ── SUB-TOTAL row ─────────────────────────────────────────────────────
    ws.mergeCells(`A${currentLine}:E${currentLine}`);
    ws.getCell(currentLine, 1).value = 'SUB-TOTAL';
    ws.getCell(currentLine, 1).font = {name: 'Arial', size: 10, bold: true};
    ws.getCell(currentLine, 1).alignment = {horizontal: 'right'};
    ws.getCell(currentLine, 6).value = grandTotal;
    ws.getCell(currentLine, 6).numFmt = '#,##0.00';
    ws.getCell(currentLine, 6).font = {name: 'Arial', size: 10, bold: true};
    ws.getCell(currentLine, 6).alignment = {horizontal: 'right'};
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    // ── Amount in words row ────────────────────────────────────────────────
    ws.mergeCells(`A${currentLine}:D${currentLine}`);
    ws.getCell(currentLine, 1).value = '(TOTAL AMOUNT IN WORDS)';
    ws.getCell(currentLine, 1).font = {name: 'Arial', size: 10};
    ws.getCell(currentLine, 1).alignment = {horizontal: 'center'};
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(currentLine, 5).value = toWords(grandTotal, {localeCode: 'en-PH'});
    ws.getCell(currentLine, 5).font = {name: 'Arial', size: 10, bold: true};
    ws.getCell(currentLine, 5).alignment = {horizontal: 'center'};
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    // ── Closing separator ──────────────────────────────────────────────────
    applyBorders(currentLine, currentLine, 1, 6);

    const rawBuffer = await wb.xlsx.writeBuffer();
    if (rawBuffer instanceof Buffer) return new Success(rawBuffer);
    return new Success(Buffer.from(rawBuffer as unknown as Uint8Array));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Failed to export purchase order.', {}, e as Error);
  }
}

/**
 * Validates signatory users against required permissions and office constraints.
 *
 * @async
 * @function _validateSignatories
 * @param {string} headOfOfficeId - Head-of-office actor identifier.
 * @param {string} treasurerId - Treasurer actor identifier.
 * @param {string} approverId - Approver actor identifier.
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
    return 'Invalid head of office signatory.';
  }

  const headPermissions = new Set(head.permissions);
  if (!headPermissions.has(permissions.OFFICE_HEAD) || head.officeId !== userOfficeId) {
    return 'Head of office signatory must belong to your office and hold office-head permission.';
  }

  const treasurer = treasurerRows[0];
  if (!treasurer) {
    return 'Invalid treasurer signatory.';
  }

  const treasurerPermissions = new Set(treasurer.permissions);
  if (!treasurerPermissions.has(permissions.OBR_DISBURSEMENT_TREASURER_APPROVE)) {
    return 'Treasurer signatory does not have treasurer approval permission.';
  }

  const approver = approverRows[0];
  if (!approver) {
    return 'Invalid approver signatory.';
  }

  const approverPermissions = new Set(approver.permissions);
  if (!approverPermissions.has(permissions.OBR_DISBURSEMENT_MAYOR_APPROVE)) {
    return 'Approver signatory does not have mayor approval permission.';
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

  const aipReferenceIds = Array.from(
    new Set(
      lbacRows
        .map((row) => row.aipReferenceId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );

  const expenseCodeIds = Array.from(
    new Set(
      lbacRows.map((row) => row.expenseCodeId).filter((id): id is string => typeof id === 'string'),
    ),
  );

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

  const aipById = new Map(aipRows.map((row) => [row.id, row]));
  const expenseById = new Map(expenseRows.map((row) => [row.id, row]));

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

  const rowById = new Map(rows.map((row) => [row.id, row]));

  const userIds = Array.from(
    new Set(rows.flatMap((row) => [row.requestingUserId, row.treasurerId, row.approverId])),
  );

  const procurementIds = Array.from(
    new Set(
      rows
        .map((row) => row.procurementId)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );

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
        implementingOffice: aipReferences.implementingOffice,
      })
      .from(purchasingAip)
      .leftJoin(lbacItems, eq(lbacItems.id, purchasingAip.lbacReferenceId))
      .leftJoin(aipReferences, eq(aipReferences.id, lbacItems.aipRefCode))
      .where(inArray(purchasingAip.purchasingId, uniqueIds)),
    userIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: user.id,
            name: user.name,
            position: officePosition.name,
          })
          .from(user)
          .leftJoin(officePosition, eq(user.officePositionId, officePosition.id))
          .where(inArray(user.id, userIds)),
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

  const aipMap = new Map<string, PurchaseRequestItem['aip']>();
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
      implementingOffice: aipRow.implementingOffice,
    });
  }

  const userMap = new Map(users.map((row) => [row.id, row]));
  const procurementMap = new Map(procurementRows.map((row) => [row.id, row]));

  const result: PurchaseRequestItem[] = [];

  for (const id of ids) {
    const row = rowById.get(id);
    if (!row) {
      continue;
    }

    const requestingUser = userMap.get(row.requestingUserId);
    const treasurer = userMap.get(row.treasurerId);
    const approver = userMap.get(row.approverId);

    const modeOfProcurement = row.procurementId ? procurementMap.get(row.procurementId) : null;

    result.push({
      id: row.id,
      prNumber: row.prNumber,
      date: DateTime.fromJSDate(row.createdAt, {zone: 'Asia/Manila'}).toFormat('MM/dd/yyyy'),
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
        ? DateTime.fromJSDate(row.dateOfDelivery, {zone: 'UTC'})
            .setZone('Asia/Manila')
            .toFormat('MM/dd/yyyy')
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
        name: requestingUser?.name ?? 'Unknown actor',
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
        name: approver?.name ?? 'Unknown actor',
        position: approver?.position ?? '',
      },
      treasurer: {
        id: row.treasurerId,
        name: treasurer?.name ?? 'Unknown actor',
        position: treasurer?.position ?? '',
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
  const parsed = DateTime.fromISO(value, {zone: 'Asia/Manila'});
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
  Omit<PurchaseRequestPayload, 'signatories' | 'items'> & Omit<PurchaseOrderPayload, 'items'>
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
    implementingOffice: Optional<string>;
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

type ExportPurchaseOptions = {
  id: string;
};

type ExportItem = {
  id: number;
  unit: string;
  description: string;
  quantity: number | '';
  unitCost: number | '';
};

type ExportSignatory = {
  name: string;
  title: string;
};
