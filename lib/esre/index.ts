import { eq, inArray } from "drizzle-orm";
import { Decimal } from "decimal.js";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { amountToWords, formatAmountWithoutCurrency } from "@/common/obr/form-export-layout";
import {
  esre,
  expenseClasses,
  expenseType as expenseTypeTable,
  fundTypes,
  obrMainData,
  office,
  officeCodes,
  saaobEntries,
} from "@/lib/db/schema";
import { validatorUtilities } from "@/lib/validators";

/**
 * Retrieves all ESRE items with their related funding source, OBR, and expense type details resolved.
 *
 * @description
 * Fetches all ESRE records joined with their funding source. For records that reference an OBR item, the first
 * associated OBR office item is resolved along with its expense class and office details. Expense types are resolved
 * for records that carry an expense type reference. The `disbursed` value for each item is computed as the difference
 * between the linked OBR office item amount and the ESRE amount, or `"0.00"` when no OBR item is linked.
 *
 * On success, wraps the mapped item list in a {@link Success}. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function all
 * @returns {Promise<Result<EsreItem[]>>} A result wrapper containing all ESRE items on success, or a failure result
 *                                        on error.
 *
 * @remarks
 * - OBR office item data is batch-fetched across all items to avoid N+1 queries.
 * - Only the first OBR office item per OBR item is used; subsequent entries are ignored.
 * - Returns an empty array when no ESRE items exist.
 */
export async function all(): Promise<Result<EsreItem[]>> {
  try {
    const rows = await db
      .select({
        id: esre.id,
        date: esre.createdAt,
        payee: esre.payee,
        natureOfPayment: esre.natureOfPayment,
        amount: esre.amount,
        checkStatus: esre.checkStatus,
        checkNumber: esre.checkNumber,
        dvOrPayrollNumber: esre.dvOrPayrollNumber,
        remarks: esre.remarks,
        obrItemId: esre.obrItemId,
        expenseTypeId: esre.expenseTypeId,
        saaobId: esre.saaobId,
        fundingSourceId: fundTypes.id,
        fundingSourceName: fundTypes.name,
      })
      .from(esre)
      .innerJoin(fundTypes, eq(esre.fundingSourceId, fundTypes.id));

    if (rows.length === 0) return new Success([]);

    const obrItemIds = [...new Set(rows.filter(r => r.obrItemId).map(r => r.obrItemId!))];
    const expenseTypeIds = [...new Set(rows.filter(r => r.expenseTypeId).map(r => r.expenseTypeId!))];
    const saaobIds = [...new Set(rows.filter(r => r.saaobId).map(r => r.saaobId!))];

    const [obrMainDataItems, expenseTypes, saaobItems] = await Promise.all([
      obrItemIds.length > 0
        ? db
          .select({
            id: obrMainData.id,
            obligated: obrMainData.obligated,
            obrNumber: obrMainData.obrNumber,
            expenseClassId: expenseClasses.id,
            accountName: expenseClasses.accountName,
            accountCode: expenseClasses.accountCode,
            subClassification: expenseClasses.subClassification,
            officeId: office.id,
            officeName: office.name,
          })
          .from(obrMainData)
          .innerJoin(expenseClasses, eq(expenseClasses.id, obrMainData.expenseCodeId))
          .innerJoin(officeCodes, eq(officeCodes.id, obrMainData.responsibilityCenterId))
          .innerJoin(office, eq(office.id, officeCodes.officeId))
          .where(inArray(obrMainData.id, obrItemIds))
        : Promise.resolve([] as Array<{
          id: string;
          obligated: string;
          obrNumber: string;
          expenseClassId: string;
          accountName: string;
          accountCode: string | null;
          subClassification: string | null;
          officeId: string;
          officeName: string;
        }>),
      expenseTypeIds.length > 0
        ? db
          .select({ id: expenseTypeTable.id, name: expenseTypeTable.name })
          .from(expenseTypeTable)
          .where(inArray(expenseTypeTable.id, expenseTypeIds))
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      saaobIds.length > 0
        ? db
          .select({ id: saaobEntries.id, name: saaobEntries.name })
          .from(saaobEntries)
          .where(inArray(saaobEntries.id, saaobIds))
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    // Take the FIRST obrOfficeItem per obrItemId (skip subsequent entries)
    const obrMainDataById = new Map<string, typeof obrMainDataItems[number]>();
    for (const item of obrMainDataItems) {
      if (!obrMainDataById.has(item.id)) {
        obrMainDataById.set(item.id, item);
      }
    }

    const expenseTypeMap = new Map(expenseTypes.map(et => [et.id, et]));
    const saaobMap = new Map(saaobItems.map(s => [s.id, s]));

    return new Success(rows.map(row => {
      const obrEntry = row.obrItemId ? obrMainDataById.get(row.obrItemId) : undefined;
      const et = row.expenseTypeId ? expenseTypeMap.get(row.expenseTypeId) : undefined;
      const saaob = row.saaobId ? saaobMap.get(row.saaobId) : undefined;

      return {
        id: row.id,
        date: row.date,
        payee: row.payee,
        natureOfPayment: row.natureOfPayment,
        amount: row.amount,
        checkStatus: row.checkStatus,
        checkNumber: row.checkNumber,
        dvOrPayrollNumber: row.dvOrPayrollNumber,
        remarks: row.remarks,
        fundingSource: { id: row.fundingSourceId, name: row.fundingSourceName },
        expenseType: et ? { id: et.id, name: et.name } : null,
        saaob: saaob ? { id: saaob.id, name: saaob.name } : null,
        obr: obrEntry && row.obrItemId
          ? {
            id: row.obrItemId,
            requestNumber: obrEntry.obrNumber,
            expenseClass: {
              id: obrEntry.expenseClassId,
              accountName: obrEntry.accountName,
              accountCode: obrEntry.accountCode,
              subClassification: obrEntry.subClassification,
            },
            office: {
              id: obrEntry.officeId,
              name: obrEntry.officeName,
            },
          }
          : null,
        disbursed: obrEntry
          ? new Decimal(obrEntry.obligated).minus(new Decimal(row.amount)).toFixed(2)
          : "0.00",
      } satisfies EsreItem;
    }));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch ESRE items.", {}, e);
  }
}

/**
 * Creates a new ESRE item from the given payload.
 *
 * @description
 * Validates that the referenced funding source exists. If an OBR item ID is provided, validates that the OBR item
 * exists and resolves the first associated OBR office item to derive the `charges` value from the office name and
 * expense class account name. If an expense type ID is provided, validates that it exists. The record is then inserted
 * and the fully mapped item is returned via {@link _getEsreById}.
 *
 * On success, wraps the created item in a {@link Success}. On validation failure, returns a {@link Failure} describing
 * the invalid reference. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function create
 * @param {CreateEsrePayload} payload - Payload containing the required and optional fields for the new ESRE item.
 * @returns {Promise<Result<EsreItem>>} A result wrapper containing the created ESRE item on success, or a failure
 *                                      result on error.
 *
 * @remarks
 * - `checkStatus` defaults to null unless provided in the payload.
 * - `charges` is derived automatically from the linked OBR item's office and expense class; it is null when no OBR
 *   item is linked.
 * - Optional fields are omitted from the insert when not provided or empty.
 */
export async function create(payload: CreateEsrePayload): Promise<Result<EsreItem>> {
  try {
    // Validate funding source
    const [fundingSource] = await db
      .select({ id: fundTypes.id })
      .from(fundTypes)
      .where(eq(fundTypes.id, payload.fundingSourceId))
      .limit(1);
    if (!fundingSource) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid funding source.", { payload });
    }

    // Validate OBR item if provided
    if (validatorUtilities.isUuid(payload.obrId)) {
      const [obrMainDataRow] = await db
        .select({ id: obrMainData.id })
        .from(obrMainData)
        .where(eq(obrMainData.id, payload.obrId!))
        .limit(1);
      if (!obrMainDataRow) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid OBR item.", { payload });
      }
    }

    // Validate expense type if provided
    if (validatorUtilities.isUuid(payload.expenseTypeId)) {
      const [et] = await db
        .select({ id: expenseTypeTable.id })
        .from(expenseTypeTable)
        .where(eq(expenseTypeTable.id, payload.expenseTypeId!))
        .limit(1);
      if (!et) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid expense type.", { payload });
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
        return new Failure(ErrorCodes.ValidationFailure, "Invalid SAAOB entry.", { payload });
      }
    }

    const [inserted] = await db
      .insert(esre)
      .values({
        payee: payload.payee,
        natureOfPayment: payload.natureOfPayment,
        amount: casts.castToDecimal(payload.amount),
        fundingSourceId: payload.fundingSourceId,
        ...(validatorUtilities.isUuid(payload.obrId) ? { obrItemId: payload.obrId } : {}),
        ...(validatorUtilities.isUuid(payload.expenseTypeId) ? { expenseTypeId: payload.expenseTypeId } : {}),
        ...(validatorUtilities.isUuid(payload.saaobId) ? { saaobId: payload.saaobId } : {}),
        ...(validatorUtilities.isNotEmpty(payload.remarks) ? { remarks: payload.remarks } : {}),
        ...(validatorUtilities.isNotEmpty(payload.dvOrPayrollNumber) ? { dvOrPayrollNumber: payload.dvOrPayrollNumber } : {}),
        ...(validatorUtilities.isNotEmpty(payload.checkNumber) ? { checkNumber: payload.checkNumber } : {}),
      })
      .returning({ id: esre.id });
    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, "Failed to create ESRE item.", { payload });
    }

    const item = await _getEsreById(inserted.id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve created ESRE item.", { id: inserted.id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create ESRE item.", { payload }, e);
  }
}

/**
 * Updates an existing ESRE item with the given partial payload.
 *
 * @description
 * Verifies that the ESRE item exists; returns a resource-not-found failure if not. Validates any provided funding
 * source or expense type references. Handles the OBR item link update: when `obrId` is explicitly `null`, the link
 * and `charges` are cleared; when a new UUID is provided, the OBR item is validated and `charges` is re-derived from
 * the first associated OBR office item. Only fields present in the payload are written to the database; absent fields
 * are left unchanged. The fully mapped item is returned via {@link _getEsreById}.
 *
 * On success, wraps the updated item in a {@link Success}. On validation or not-found failure, returns an appropriate
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function update
 * @param {string} id - Identifier of the ESRE item to update.
 * @param {UpdateEsrePayload} payload - Partial payload containing the fields to update.
 * @returns {Promise<Result<EsreItem>>} A result wrapper containing the updated ESRE item on success, or a failure
 *                                      result on error.
 *
 * @remarks
 * - Passing `obrId: null` clears the OBR item link and sets `charges` to null.
 * - Omitting `obrId` from the payload leaves the existing OBR link unchanged.
 * - `checkStatus` can be explicitly set or cleared (null) via this method.
 */
export async function update(id: string, payload: UpdateEsrePayload): Promise<Result<EsreItem>> {
  try {
    // Verify ESRE item exists
    const [existing] = await db
      .select({ id: esre.id })
      .from(esre)
      .where(eq(esre.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such ESRE item found.", { id });
    }

    // Validate funding source if provided
    if (validatorUtilities.isUuid(payload.fundingSourceId)) {
      const [fs] = await db
        .select({ id: fundTypes.id })
        .from(fundTypes)
        .where(eq(fundTypes.id, payload.fundingSourceId!))
        .limit(1);
      if (!fs) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid funding source.", { payload });
      }
    }

    // Handle obrId — undefined = no change; null = clear link; UUID = set new link and re-derive charges
    let obrItemUpdate: { obrItemId: string | null } | undefined = undefined;
    if (typeof payload.obrId !== "undefined") {
      if (payload.obrId === null) {
        obrItemUpdate = { obrItemId: null };
      } else if (validatorUtilities.isUuid(payload.obrId)) {
        const [obrMainDataRow] = await db
          .select({ id: obrMainData.id })
          .from(obrMainData)
          .where(eq(obrMainData.id, payload.obrId))
          .limit(1);
        if (!obrMainDataRow) {
          return new Failure(ErrorCodes.ValidationFailure, "Invalid OBR item.", { payload });
        }

        obrItemUpdate = {
          obrItemId: payload.obrId,
        };
      }
    }

    // Validate saaobId if provided (null = clear, UUID = set)
    let saaobUpdate: { saaobId: string | null } | undefined = undefined;
    if (typeof payload.saaobId !== "undefined") {
      if (payload.saaobId === null) {
        saaobUpdate = { saaobId: null };
      } else if (validatorUtilities.isUuid(payload.saaobId)) {
        const [saaobRow] = await db
          .select({ id: saaobEntries.id })
          .from(saaobEntries)
          .where(eq(saaobEntries.id, payload.saaobId))
          .limit(1);
        if (!saaobRow) {
          return new Failure(ErrorCodes.ValidationFailure, "Invalid SAAOB entry.", { payload });
        }
        saaobUpdate = { saaobId: payload.saaobId };
      }
    }

    // Validate expense type if provided
    if (validatorUtilities.isUuid(payload.expenseTypeId)) {
      const [et] = await db
        .select({ id: expenseTypeTable.id })
        .from(expenseTypeTable)
        .where(eq(expenseTypeTable.id, payload.expenseTypeId!))
        .limit(1);
      if (!et) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid expense type.", { payload });
      }
    }

    await db
      .update(esre)
      .set({
        ...(validatorUtilities.isNotEmpty(payload.payee) ? { payee: payload.payee } : {}),
        ...(validatorUtilities.isNotEmpty(payload.natureOfPayment) ? { natureOfPayment: payload.natureOfPayment } : {}),
        ...(payload.amount !== undefined ? { amount: casts.castToDecimal(payload.amount) } : {}),
        ...(validatorUtilities.isUuid(payload.fundingSourceId) ? { fundingSourceId: payload.fundingSourceId } : {}),
        ...(validatorUtilities.isUuid(payload.expenseTypeId) ? { expenseTypeId: payload.expenseTypeId } : {}),
        ...(validatorUtilities.isNotEmpty(payload.remarks) ? { remarks: payload.remarks } : {}),
        ...(validatorUtilities.isNotEmpty(payload.dvOrPayrollNumber) ? { dvOrPayrollNumber: payload.dvOrPayrollNumber } : {}),
        ...(validatorUtilities.isNotEmpty(payload.checkNumber) ? { checkNumber: payload.checkNumber } : {}),
        ...(typeof payload.checkStatus !== "undefined" ? { checkStatus: payload.checkStatus } : {}),
        ...(obrItemUpdate !== undefined ? obrItemUpdate : {}),
        ...(saaobUpdate !== undefined ? saaobUpdate : {}),
      })
      .where(eq(esre.id, id));

    const item = await _getEsreById(id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve updated ESRE item.", { id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update ESRE item.", { id, payload }, e);
  }
}

/**
 * Removes an existing ESRE item by its identifier.
 *
 * @description
 * Deletes the ESRE record matching the given identifier. If no record matches, the operation completes silently
 * (idempotent delete).
 *
 * On success, wraps `undefined` in a {@link Success}. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function remove
 * @param {string} id - Identifier of the ESRE item to remove.
 * @returns {Promise<Result<void>>} A result wrapper containing void on success, or a failure result on error.
 */
export async function remove(id: string): Promise<Result<void>> {
  try {
    await db.delete(esre).where(eq(esre.id, id));
    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to remove ESRE item.", { id }, e);
  }
}

/**
 * Builds print data for a cheque from selected ESRE rows.
 *
 * @description
 * Fetches the selected ESRE rows, validates that they all exist and belong to one payee, then computes the summed
 * cheque amount and amount-in-words value. The returned object is intended for the cheque print route.
 *
 * @async
 * @function getChequePrintData
 * @param {string[]} ids - ESRE row identifiers selected for cheque printing.
 * @returns {Promise<Result<EsreChequePrintData>>} Cheque print data on success, or a failure result on validation/error.
 *
 * @remarks
 * - Multiple selected ESRE rows are allowed, but a single cheque can only have one payee.
 * - Monetary values remain string-backed and are summed through Decimal.
 */
export async function getChequePrintData(ids: string[]): Promise<Result<EsreChequePrintData>> {
  try {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "Select at least one ESRE item to print a cheque.");
    }

    const rows = await db
      .select({
        id: esre.id,
        payee: esre.payee,
        amount: esre.amount,
        checkNumber: esre.checkNumber,
      })
      .from(esre)
      .where(inArray(esre.id, uniqueIds));

    if (rows.length !== uniqueIds.length) {
      return new Failure(ErrorCodes.ResourceNotFound, "One or more selected ESRE items were not found.", { ids });
    }

    const payees = [...new Set(rows.map(row => row.payee?.trim() ?? "").filter(Boolean))];
    if (payees.length !== 1) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Selected ESRE items must have the same payee to print one cheque.",
        { payees },
      );
    }

    const total = rows.reduce((sum, row) => sum.plus(new Decimal(row.amount)), new Decimal(0));
    const totalText = total.toFixed(2);

    return new Success({
      payee: payees[0],
      amount: totalText,
      amountFormatted: formatAmountWithoutCurrency(totalText),
      amountWords: amountToWords(totalText).toUpperCase(),
      checkNumber: rows.find(row => row.checkNumber?.trim())?.checkNumber?.trim() ?? null,
      selectedCount: rows.length,
      itemIds: uniqueIds,
      printedAt: new Date(),
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to build ESRE cheque print data.", { ids }, e);
  }
}

/**
 * Retrieves a single ESRE item by its identifier with all related data resolved and the disbursed amount computed.
 *
 * @param {string} id - Identifier of the ESRE item to retrieve.
 * @returns {Promise<EsreItem | null>} The fully mapped ESRE item if found, otherwise null.
 *
 * @remarks
 * - Fetches the first associated OBR office item when an OBR item is linked.
 * - Computes `disbursed` as the difference between the OBR office item amount and the ESRE amount.
 * - Fetches expense type details when an expense type is linked.
 */
async function _getEsreById(id: string): Promise<EsreItem | null> {
  const [row] = await db
    .select({
      id: esre.id,
      date: esre.createdAt,
      payee: esre.payee,
      natureOfPayment: esre.natureOfPayment,
      amount: esre.amount,
      checkStatus: esre.checkStatus,
      checkNumber: esre.checkNumber,
      dvOrPayrollNumber: esre.dvOrPayrollNumber,
      remarks: esre.remarks,
      obrItemId: esre.obrItemId,
      expenseTypeId: esre.expenseTypeId,
      saaobId: esre.saaobId,
      fundingSourceId: fundTypes.id,
      fundingSourceName: fundTypes.name,
    })
    .from(esre)
    .innerJoin(fundTypes, eq(esre.fundingSourceId, fundTypes.id))
    .where(eq(esre.id, id))
    .limit(1);

  if (!row) return null;

  // Fetch first OBR office item details if an OBR item is linked
  let obrData: EsreItem["obr"] = null;
  let disbursed = "0.00";
  if (row.obrItemId) {
    const [obrEntry] = await db
      .select({
        obligated: obrMainData.obligated,
        obrNumber: obrMainData.obrNumber,
        expenseClassId: expenseClasses.id,
        accountName: expenseClasses.accountName,
        accountCode: expenseClasses.accountCode,
        subClassification: expenseClasses.subClassification,
        officeId: office.id,
        officeName: office.name,
      })
      .from(obrMainData)
      .innerJoin(expenseClasses, eq(expenseClasses.id, obrMainData.expenseCodeId))
      .innerJoin(officeCodes, eq(officeCodes.id, obrMainData.responsibilityCenterId))
      .innerJoin(office, eq(office.id, officeCodes.officeId))
      .where(eq(obrMainData.id, row.obrItemId))
      .limit(1);

    if (obrEntry) {
      obrData = {
        id: row.obrItemId,
        requestNumber: obrEntry.obrNumber,
        expenseClass: {
          id: obrEntry.expenseClassId,
          accountName: obrEntry.accountName,
          accountCode: obrEntry.accountCode,
          subClassification: obrEntry.subClassification,
        },
        office: {
          id: obrEntry.officeId,
          name: obrEntry.officeName,
        },
      };
      disbursed = new Decimal(obrEntry.obligated).minus(new Decimal(row.amount)).toFixed(2);
    }
  }

  // Fetch expense type details if linked
  let expenseTypeData: EsreItem["expenseType"] = null;
  if (row.expenseTypeId) {
    const [etRow] = await db
      .select({ id: expenseTypeTable.id, name: expenseTypeTable.name })
      .from(expenseTypeTable)
      .where(eq(expenseTypeTable.id, row.expenseTypeId))
      .limit(1);
    if (etRow) expenseTypeData = { id: etRow.id, name: etRow.name };
  }

  // Fetch SAAOB entry details if linked
  let saaobData: EsreItem["saaob"] = null;
  if (row.saaobId) {
    const [saaobRow] = await db
      .select({ id: saaobEntries.id, name: saaobEntries.name })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, row.saaobId))
      .limit(1);
    if (saaobRow) saaobData = { id: saaobRow.id, name: saaobRow.name };
  }

  return {
    id: row.id,
    date: row.date,
    payee: row.payee,
    natureOfPayment: row.natureOfPayment,
    amount: row.amount,
    checkStatus: row.checkStatus,
    checkNumber: row.checkNumber,
    dvOrPayrollNumber: row.dvOrPayrollNumber,
    remarks: row.remarks,
    fundingSource: { id: row.fundingSourceId, name: row.fundingSourceName },
    expenseType: expenseTypeData,
    saaob: saaobData,
    obr: obrData,
    disbursed,
  };
}

type CheckStatusType = "ON HOLD" | "FOR RELEASE" | "PAID" | "CANCELLED";

type CreateEsrePayload = {
  payee: string;
  natureOfPayment: string;
  amount: string;
  fundingSourceId: string;
  remarks?: string;
  obrId?: string;
  expenseTypeId?: string;
  saaobId?: string;
  dvOrPayrollNumber?: string;
  checkNumber?: string;
  checkStatus?: Optional<CheckStatusType>;
};

type UpdateEsrePayload = {
  payee?: string;
  natureOfPayment?: string;
  amount?: string;
  fundingSourceId?: string;
  checkStatus?: CheckStatusType | null;
  remarks?: string;
  obrId?: string | null;
  expenseTypeId?: string;
  saaobId?: string | null;
  dvOrPayrollNumber?: string;
  checkNumber?: string;
};

type EsreItem = {
  id: string;
  date: Date;
  payee: Optional<string>;
  natureOfPayment: string;
  amount: string;
  checkStatus: Optional<string>;
  checkNumber: Optional<string>;
  dvOrPayrollNumber: Optional<string>;
  remarks: Optional<string>;
  fundingSource: {
    id: string;
    name: string;
  };
  expenseType: Optional<{
    id: string;
    name: string;
  }>;
  saaob: Optional<{
    id: string;
    name: string;
  }>;
  obr: Optional<{
    id: string;
    requestNumber: string;
    expenseClass: {
      id: string;
      accountName: string;
      accountCode: Optional<string>;
      subClassification: Optional<string>;
    };
    office: {
      id: string;
      name: string;
    };
  }>;
  disbursed: string;
};

export type EsreChequePrintData = {
  payee: string;
  amount: string;
  amountFormatted: string;
  amountWords: string;
  checkNumber: string | null;
  selectedCount: number;
  itemIds: string[];
  printedAt: Date;
};
