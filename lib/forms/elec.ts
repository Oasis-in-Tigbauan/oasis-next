import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { obrDisbursementElectronic, obrDisbursementVouchers } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import * as casts from "@/lib/types/casts";
import { validatorUtilities } from "@/lib/validators";

/**
 * Computes the derived tax breakdown fields from stored gross and vatableSales values.
 *
 * @description
 * Calculates `vat5` (5% of vatableSales), `evat2` (2% of vatableSales), and
 * `net` (gross minus vat5 minus evat2) using exact decimal arithmetic.
 *
 * @param {string} gross - The gross amount as a decimal string.
 * @param {string} vatableSales - The vatable sales amount as a decimal string.
 * @returns {{ vat5: string; evat2: string; net: string }} The computed derived fields as decimal strings.
 */
function _computeDerivedValues(gross: string, vatableSales: string): { vat5: string; evat2: string; net: string } {
  const vatableSalesDecimal = casts.castFromDecimal(vatableSales);
  const vat5 = vatableSalesDecimal.mul("0.05");
  const evat2 = vatableSalesDecimal.mul("0.02");
  const net = casts.castFromDecimal(gross).minus(vat5).minus(evat2);
  return {
    vat5: vat5.toString(),
    evat2: evat2.toString(),
    net: net.toString(),
  };
}

/**
 * Returns all electricity bill records joined with their parent disbursement voucher.
 *
 * @description
 * Selects all rows from `obr_disbursement_electronic` joined with `obr_disbursement_vouchers`
 * to include the disbursement voucher number alongside each record.
 *
 * On success, wraps the list in a {@link Success}. On unexpected failure, wraps the error in
 * a fatal {@link Failure}.
 *
 * @async
 * @function getAll
 * @returns {Promise<Result<ElecFormItem[]>>} All electricity bill records on success, or a
 *                                            failure result on error.
 *
 * @remarks
 * - Returns an empty array when no records exist.
 */
export async function getAll(): Promise<Result<ElecFormItem[]>> {
  try {
    const rows = await db
      .select({
        id: obrDisbursementElectronic.id,
        dvId: obrDisbursementVouchers.id,
        disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
        billingName: obrDisbursementElectronic.billingName,
        meterSerial: obrDisbursementElectronic.meterSerial,
        account: obrDisbursementElectronic.account,
        gross: obrDisbursementElectronic.gross,
        vatableSales: obrDisbursementElectronic.vatableSales,
        taxType: obrDisbursementElectronic.taxType,
      })
      .from(obrDisbursementElectronic)
      .innerJoin(
        obrDisbursementVouchers,
        eq(obrDisbursementVouchers.id, obrDisbursementElectronic.voucherId),
      );

    return new Success(
      rows.map(row => {
        const derived = _computeDerivedValues(row.gross, row.vatableSales);
        return {
          id: row.id,
          dv: {
            id: row.dvId,
            disbursementVoucherNumber: row.disbursementVoucherNumber,
          },
          billingName: row.billingName,
          meterSerial: row.meterSerial,
          account: row.account,
          gross: row.gross,
          vatableSales: row.vatableSales,
          taxType: row.taxType,
          vat5: derived.vat5,
          evat2: derived.evat2,
          net: derived.net,
        };
      }),
    );
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to retrieve electricity bill records.", {}, e);
  }
}

/**
 * Creates a new electricity bill record linked to a disbursement voucher.
 *
 * @description
 * Verifies that the referenced disbursement voucher (`dvId`) exists, then inserts a new
 * row into `obr_disbursement_electronic`. After inserting, computes the derived fields
 * `vat5`, `evat2`, and `net` from the stored `gross` and `vatableSales` values and
 * includes them in the returned record.
 *
 * On success, wraps the created record in a {@link Success}. On validation failure, returns
 * a {@link Failure} describing the missing voucher. On unexpected failure, wraps the error
 * in a fatal {@link Failure}.
 *
 * @async
 * @function createElectricityBill
 * @param {ElecFormPayload} payload - Input data for the new electricity bill record.
 * @returns {Promise<Result<ElecFormItem>>} The created electricity bill record on success,
 *                                          or a failure result on error.
 *
 * @remarks
 * - `vat5`, `evat2`, and `net` are computed server-side and included in the response; they
 *   are not stored as separate columns in the database.
 * - The `taxType` value must match the `tax_types` enum: `vat-g`, `vat-s`, `nvat-g`, `nvat-s`.
 */
export async function createElectricityBill(payload: ElecFormPayload): Promise<Result<ElecFormItem>> {
  try {
    const [dv] = await db
      .select({
        id: obrDisbursementVouchers.id,
        disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
      })
      .from(obrDisbursementVouchers)
      .where(eq(obrDisbursementVouchers.id, payload.dvId))
      .limit(1);

    if (!dv) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such disbursement voucher found.",
        { dvId: payload.dvId },
      );
    }

    const [inserted] = await db
      .insert(obrDisbursementElectronic)
      .values({
        voucherId: payload.dvId,
        billingName: payload.billingName,
        meterSerial: payload.meterSerial,
        account: payload.account,
        gross: casts.castToDecimal(payload.gross),
        vatableSales: casts.castToDecimal(payload.vatableSales),
        taxType: payload.taxType as "vat-g" | "vat-s" | "nvat-g" | "nvat-s",
      })
      .returning({ id: obrDisbursementElectronic.id });

    const derived = _computeDerivedValues(payload.gross, payload.vatableSales);

    return new Success({
      id: inserted.id,
      dv: {
        id: dv.id,
        disbursementVoucherNumber: dv.disbursementVoucherNumber,
      },
      billingName: payload.billingName,
      meterSerial: payload.meterSerial,
      account: payload.account,
      gross: payload.gross,
      vatableSales: payload.vatableSales,
      taxType: payload.taxType,
      vat5: derived.vat5,
      evat2: derived.evat2,
      net: derived.net,
    });
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create electricity bill record.", { payload }, e);
  }
}

/**
 * Updates an existing electricity bill record with the provided partial payload.
 *
 * @description
 * Checks that the record identified by `id` exists, builds a partial update object from the
 * non-empty fields in the payload, and applies the update. Returns the updated record joined
 * with its parent disbursement voucher.
 *
 * On success, wraps the updated record in a {@link Success}. On validation failure, returns a
 * {@link Failure} when no updatable fields are present. On resource-not-found failure, returns a
 * {@link Failure} when the record does not exist. On unexpected failure, wraps the error in a
 * fatal {@link Failure}.
 *
 * @async
 * @function updateElectricityBill
 * @param {string} id - Identifier of the electricity bill record to update.
 * @param {Partial<ElecFormPayload>} payload - Partial payload containing fields to update.
 * @returns {Promise<Result<ElecFormItem>>} The updated electricity bill record on success,
 *                                          or a failure result on error.
 *
 * @remarks
 * - At least one updatable field (`billingName`, `meterSerial`, `account`, `gross`,
 *   `vatableSales`, or `taxType`) must be present.
 * - `dvId` from the payload is ignored during update.
 * - `vat5`, `evat2`, and `net` are computed server-side from the final `gross` and
 *   `vatableSales` values and included in the response; they are not stored columns.
 */
export async function updateElectricityBill(
  id: string,
  payload: Partial<ElecFormPayload>,
): Promise<Result<ElecFormItem>> {
  try {
    const [existing] = await db
      .select({
        id: obrDisbursementElectronic.id,
        dvId: obrDisbursementVouchers.id,
        disbursementVoucherNumber: obrDisbursementVouchers.disbursementVoucherNumber,
        billingName: obrDisbursementElectronic.billingName,
        meterSerial: obrDisbursementElectronic.meterSerial,
        account: obrDisbursementElectronic.account,
        gross: obrDisbursementElectronic.gross,
        vatableSales: obrDisbursementElectronic.vatableSales,
        taxType: obrDisbursementElectronic.taxType,
      })
      .from(obrDisbursementElectronic)
      .innerJoin(
        obrDisbursementVouchers,
        eq(obrDisbursementVouchers.id, obrDisbursementElectronic.voucherId),
      )
      .where(eq(obrDisbursementElectronic.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such electricity bill record found.",
        { id },
      );
    }

    const updatePayload = {
      ...(validatorUtilities.isNotEmpty(payload.billingName) ? { billingName: payload.billingName! } : {}),
      ...(validatorUtilities.isNotEmpty(payload.meterSerial) ? { meterSerial: payload.meterSerial! } : {}),
      ...(validatorUtilities.isNotEmpty(payload.account) ? { account: payload.account! } : {}),
      ...(validatorUtilities.isNumber(payload.gross) ? { gross: casts.castToDecimal(payload.gross!) } : {}),
      ...(validatorUtilities.isNumber(payload.vatableSales) ? { vatableSales: casts.castToDecimal(payload.vatableSales!) } : {}),
      ...(validatorUtilities.isNotEmpty(payload.taxType) ? { taxType: payload.taxType as "vat-g" | "vat-s" | "nvat-g" | "nvat-s" } : {}),
    };

    if (Object.keys(updatePayload).length === 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "No updatable payload found.",
        { id, payload },
      );
    }

    await db
      .update(obrDisbursementElectronic)
      .set(updatePayload)
      .where(eq(obrDisbursementElectronic.id, id));

    const finalGross = updatePayload.gross ?? existing.gross;
    const finalVatableSales = updatePayload.vatableSales ?? existing.vatableSales;
    const derived = _computeDerivedValues(finalGross, finalVatableSales);

    return new Success({
      id: existing.id,
      dv: {
        id: existing.dvId,
        disbursementVoucherNumber: existing.disbursementVoucherNumber,
      },
      billingName: updatePayload.billingName ?? existing.billingName,
      meterSerial: updatePayload.meterSerial ?? existing.meterSerial,
      account: updatePayload.account ?? existing.account,
      gross: finalGross,
      vatableSales: finalVatableSales,
      taxType: updatePayload.taxType ?? existing.taxType,
      vat5: derived.vat5,
      evat2: derived.evat2,
      net: derived.net,
    });
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update electricity bill record.", { id, payload }, e);
  }
}

/**
 * Deletes an electricity bill record by its identifier.
 *
 * @description
 * Checks that the record identified by `id` exists, then permanently removes it from the
 * database.
 *
 * On success, returns a {@link Success} wrapping `null`. On resource-not-found failure,
 * returns a {@link Failure} when the record does not exist. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function deleteElectricityBill
 * @param {string} id - Identifier of the electricity bill record to delete.
 * @returns {Promise<Result<null>>} `null` on success, or a failure result on error.
 *
 * @remarks
 * - This operation is permanent and cannot be undone.
 */
export async function deleteElectricityBill(id: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: obrDisbursementElectronic.id })
      .from(obrDisbursementElectronic)
      .where(eq(obrDisbursementElectronic.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such electricity bill record found.",
        { id },
      );
    }

    await db
      .delete(obrDisbursementElectronic)
      .where(eq(obrDisbursementElectronic.id, id));

    return new Success(null);
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete electricity bill record.", { id }, e);
  }
}

/**
 * Represents the input payload for creating or updating an electricity bill record.
 */
type ElecFormPayload = {
  dvId: string;
  billingName: string;
  meterSerial: string;
  account: string;
  gross: string;
  vatableSales: string;
  taxType: string;
};

/**
 * Represents a single electricity bill record returned from the service layer.
 */
type ElecFormItem = {
  id: string;
  dv: {
    id: string;
    disbursementVoucherNumber: string;
  };
  billingName: string;
  meterSerial: string;
  account: string;
  gross: string;
  vatableSales: string;
  vat5: string;
  evat2: string;
  net: string;
  taxType: string;
};
