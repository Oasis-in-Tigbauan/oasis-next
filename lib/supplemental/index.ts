import { DateTime } from "luxon";
import { asc, eq } from "drizzle-orm";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { supplemental } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

/**
 * Retrieves all supplemental items sorted by creation date in ascending order.
 *
 * @description
 * Fetches every row from the supplemental table and maps them to domain items. The quarter is derived from each item's
 * creation timestamp by converting the UTC database timestamp to UTC+8 and computing the calendar quarter.
 *
 * On success, wraps the mapped list in a {@link Success}. On unexpected failure, wraps the exception in a fatal
 * {@link Failure}.
 *
 * @async
 * @function all
 * @returns {Promise<Result<SupplementalItem[]>>} A result wrapper containing all supplemental items on success, or a
 *                                                failure result on error.
 *
 * @remarks
 * - Sorting is performed by `createdAt` ascending with `id` as a stable secondary key.
 * - `quarter` is a derived field and is not persisted in the database.
 */
export async function all(): Promise<Result<Array<SupplementalItem>>> {
  try {
    const rows = await db
      .select({
        id: supplemental.id,
        supplementalOrAugmentation: supplemental.supplementalOrAugmentation,
        charges: supplemental.charges,
        amount: supplemental.amount,
        supplementalType: supplemental.supplementalType,
        aipCode: supplemental.aipCode,
        date: supplemental.createdAt,
      })
      .from(supplemental)
      .orderBy(asc(supplemental.createdAt), asc(supplemental.id));

    return new Success(rows.map(row => _mapRowToItem(row)));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch supplemental items.", {}, e);
  }
}

/**
 * Creates a new supplemental item.
 *
 * @description
 * Validates the payload and inserts a new supplemental row authored by the given user. The inserted row is fetched and
 * returned as a mapped domain item with `quarter` derived from the created timestamp in UTC+8.
 *
 * On success, wraps the created item in a {@link Success}. On validation failure, returns a {@link Failure} with
 * validation details. On unexpected failure, wraps the exception in a fatal {@link Failure}.
 *
 * @async
 * @function create
 * @param {CreateSupplementalItem} payload - Payload containing values for the new supplemental item.
 * @param {string} authorId - Identifier of the authenticated user creating the item.
 * @returns {Promise<Result<SupplementalItem>>} A result wrapper containing the created supplemental item on success, or
 *                                              a failure result on error.
 *
 * @remarks
 * - Financial amount is stored as a decimal string via decimal cast helpers.
 * - Empty optional text fields are normalized to `null` before persistence.
 */
export async function create(payload: CreateSupplementalItem, authorId: string): Promise<Result<SupplementalItem>> {
  try {
    const [inserted] = await db
      .insert(supplemental)
      .values({
        supplementalOrAugmentation: _toNullableText(payload.supplementalOrAugmentation),
        charges: _toNullableText(payload.charges),
        amount: casts.castToDecimal(payload.amount),
        supplementalType: payload.supplementalType,
        aipCode: _toNullableText(payload.aipCode),
        author: authorId,
      })
      .returning({ id: supplemental.id });

    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, "Failed to create supplemental item.", { payload, authorId });
    }

    const item = await _getSupplementalById(inserted.id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve created supplemental item.", { id: inserted.id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create supplemental item.", { payload, authorId }, e);
  }
}

/**
 * Updates an existing supplemental item using a partial payload.
 *
 * @description
 * Validates the target supplemental ID and update payload, verifies existence, and applies only fields provided by the
 * caller. The updated row is fetched and mapped back to a domain item.
 *
 * On success, wraps the updated item in a {@link Success}. On validation or missing-resource failures, returns an
 * appropriate {@link Failure}. On unexpected failure, wraps the exception in a fatal {@link Failure}.
 *
 * @async
 * @function update
 * @param {string} supplementalId - Identifier of the supplemental item to update.
 * @param {UpdateSupplementalItem} payload - Partial payload with fields to update.
 * @returns {Promise<Result<SupplementalItem>>} A result wrapper containing the updated item on success, or a failure
 *                                              result on error.
 *
 * @remarks
 * - Empty optional text fields are persisted as `null` when explicitly set.
 * - Omitting a field leaves the existing database value unchanged.
 */
export async function update(supplementalId: string, payload: UpdateSupplementalItem): Promise<Result<SupplementalItem>> {
  try {
    const [existing] = await db
      .select({ id: supplemental.id })
      .from(supplemental)
      .where(eq(supplemental.id, supplementalId))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such supplemental item found.", { supplementalId });
    }

    const updateSet: Partial<{
      supplementalOrAugmentation: string | null;
      charges: string | null;
      amount: string;
      supplementalType: SupplementalType;
      aipCode: string | null;
    }> = {};

    if ("supplementalOrAugmentation" in payload) {
      updateSet.supplementalOrAugmentation = _toNullableText(payload.supplementalOrAugmentation);
    }
    if ("charges" in payload) {
      updateSet.charges = _toNullableText(payload.charges);
    }
    if ("amount" in payload && payload.amount !== undefined) {
      updateSet.amount = casts.castToDecimal(payload.amount);
    }
    if ("supplementalType" in payload && payload.supplementalType !== undefined) {
      updateSet.supplementalType = payload.supplementalType;
    }
    if ("aipCode" in payload) {
      updateSet.aipCode = _toNullableText(payload.aipCode);
    }

    if (Object.keys(updateSet).length > 0) {
      await db
        .update(supplemental)
        .set(updateSet)
        .where(eq(supplemental.id, supplementalId));
    }

    const item = await _getSupplementalById(supplementalId);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve updated supplemental item.", { supplementalId });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update supplemental item.", { supplementalId, payload }, e);
  }
}

/**
 * Deletes an existing supplemental item.
 *
 * @description
 * Validates the supplemental identifier, ensures the record exists, and deletes it from the supplemental table.
 *
 * On success, wraps `null` in a {@link Success}. On validation or missing-resource failures, returns an appropriate
 * {@link Failure}. On unexpected failure, wraps the exception in a fatal {@link Failure}.
 *
 * @async
 * @function delete
 * @param {string} supplementalId - Identifier of the supplemental item to delete.
 * @returns {Promise<Result<null>>} A result wrapper containing null on successful deletion, or a failure result on
 *                                  error.
 */
export async function remove(supplementalId: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: supplemental.id })
      .from(supplemental)
      .where(eq(supplemental.id, supplementalId))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such supplemental item found.", { supplementalId });
    }

    await db.delete(supplemental).where(eq(supplemental.id, supplementalId));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete supplemental item.", { supplementalId }, e);
  }
}

async function _getSupplementalById(id: string): Promise<SupplementalItem | null> {
  const [row] = await db
    .select({
      id: supplemental.id,
      supplementalOrAugmentation: supplemental.supplementalOrAugmentation,
      charges: supplemental.charges,
      amount: supplemental.amount,
      supplementalType: supplemental.supplementalType,
      aipCode: supplemental.aipCode,
      date: supplemental.createdAt,
    })
    .from(supplemental)
    .where(eq(supplemental.id, id))
    .limit(1);

  if (!row) return null;
  return _mapRowToItem(row);
}

function _mapRowToItem(row: SupplementalRow): SupplementalItem {
  return {
    id: row.id,
    supplementalOrAugmentation: row.supplementalOrAugmentation,
    charges: row.charges,
    amount: row.amount,
    supplementalType: row.supplementalType,
    aipCode: row.aipCode,
    date: row.date,
    quarter: _getQuarterLabelUtcPlus8(row.date),
  };
}

function _getQuarterLabelUtcPlus8(date: Date): string {
  const quarter = DateTime.fromJSDate(date, { zone: "utc" })
    .setZone("UTC+8")
    .quarter;

  return `Quarter ${quarter}`;
}

function _toNullableText(value: Optional<string>): string | null {
  return validatorUtilities.isNotEmpty(value) ? value!.trim() : null;
}

type SupplementalType = "less" | "add";

type SupplementalRow = {
  id: string;
  supplementalOrAugmentation: Optional<string>;
  charges: Optional<string>;
  amount: string;
  supplementalType: SupplementalType;
  aipCode: Optional<string>;
  date: Date;
};

type SupplementalItem = {
  id: string;
  supplementalOrAugmentation: Optional<string>;
  charges: Optional<string>;
  amount: string;
  supplementalType: SupplementalType;
  aipCode: Optional<string>;
  date: Date;
  quarter: string;
};

type CreateSupplementalItem = {
  supplementalOrAugmentation: Optional<string>;
  charges: Optional<string>;
  amount: string;
  supplementalType: SupplementalType;
  aipCode: Optional<string>;
};

type UpdateSupplementalItem = Partial<CreateSupplementalItem>;
