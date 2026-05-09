import { eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseClasses, expenseClassOfficeCodes, officeCodes } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";
import { DateTime } from "luxon";

/**
 * Creates a new expense class record.
 *
 * Checks for an existing record with the same name before creating a new one.
 * If allowedOfficeCodeIds is provided and non-empty, the expense class will be
 * restricted to those office codes. Otherwise it is available to all.
 */
export async function create(payload: CreateExpenseClass): Promise<Result<ExpenseClass>> {
  try {
    const [existingExpenseClass] = await db
      .select({ id: expenseClasses.id })
      .from(expenseClasses)
      .where(eq(expenseClasses.accountName, payload.accountName))
      .limit(1);

    if (existingExpenseClass) {
      return new Failure(ErrorCodes.ValidationFailure, "Item already exists with the same name.");
    }

    // Validate office code IDs if provided
    let validatedOfficeCodeIds: Array<{ id: string; name: string; }> = [];
    if (payload.allowedOfficeCodeIds && payload.allowedOfficeCodeIds.length > 0) {
      const validation = await validateOfficeCodeIds(payload.allowedOfficeCodeIds);
      if (validation.length !== payload.allowedOfficeCodeIds.length) {
        return new Failure(ErrorCodes.ValidationFailure, "One or more office codes are invalid.");
      }

      validatedOfficeCodeIds = validation;
    }

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(expenseClasses)
        .values({
          accountName: payload.accountName,
          ...(validatorUtilities.isNotEmpty(payload.fpp) ? { fpp: payload.fpp } : {}),
          ...(validatorUtilities.isNotEmpty(payload.classification) ? { classification: payload.classification } : {}),
          ...(validatorUtilities.isNotEmpty(payload.subClassification) ? { subClassification: payload.subClassification } : {}),
          ...(validatorUtilities.isNotEmpty(payload.group) ? { group: payload.group } : {}),
          ...(validatorUtilities.isNotEmpty(payload.accountCode) ? { accountCode: payload.accountCode } : {}),
          ...(validatorUtilities.isNotEmpty(payload.class) ? { class: payload.class } : {}),
        })
        .returning();

      if (!created) return null;

      if (validatedOfficeCodeIds.length > 0) {
        await tx.insert(expenseClassOfficeCodes).values(
          validatedOfficeCodeIds.map(officeCodeId => ({
            expenseClassId: created.id,
            officeCodeId: officeCodeId.id,
          })),
        );
      }

      return created;
    });

    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Failed to create expense.");
    }

    const allowedFor = await fetchAllowedFor(result.id);
    return new Success({ ...result, allowedFor });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create expense.", {}, e);
  }
}

/**
 * Updates an existing expense class by its identifier.
 *
 * If allowedOfficeCodeIds is provided (even as an empty array), the office code
 * associations are fully replaced. If not provided, associations are left unchanged.
 */
export async function update(id: string, payload: Partial<CreateExpenseClass>): Promise<Result<ExpenseClass>> {
  try {
    const [targetExpenseClass] = await db
      .select({ id: expenseClasses.id })
      .from(expenseClasses)
      .where(eq(expenseClasses.id, id))
      .limit(1);
    if (!targetExpenseClass) {
      return new Failure(ErrorCodes.ResourceNotFound, "Expense class not found.");
    }

    // Validate office code IDs if provided
    let validatedOfficeCodeIds: Array<{ id: string; name: string; }> = [];
    if (payload.allowedOfficeCodeIds && payload.allowedOfficeCodeIds.length > 0) {
      const validation = await validateOfficeCodeIds(payload.allowedOfficeCodeIds);
      if (validation.length !== payload.allowedOfficeCodeIds.length) {
        return new Failure(ErrorCodes.ValidationFailure, "One or more office codes are invalid.");
      }

      validatedOfficeCodeIds = validation;
    }

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(expenseClasses)
        .set({
          ...(validatorUtilities.isNotEmpty(payload.accountName) ? { accountName: payload.accountName } : {}),
          ...(validatorUtilities.isNotEmpty(payload.fpp) ? { fpp: payload.fpp } : {}),
          ...(validatorUtilities.isNotEmpty(payload.classification) ? { classification: payload.classification } : {}),
          ...(validatorUtilities.isNotEmpty(payload.subClassification) ? { subClassification: payload.subClassification } : {}),
          ...(validatorUtilities.isNotEmpty(payload.group) ? { group: payload.group } : {}),
          ...(validatorUtilities.isNotEmpty(payload.accountCode) ? { accountCode: payload.accountCode } : {}),
          ...(validatorUtilities.isNotEmpty(payload.class) ? { class: payload.class } : {}),
        })
        .where(eq(expenseClasses.id, id))
        .returning();

      if (!updated) return null;

      if (validatedOfficeCodeIds !== undefined) {
        await tx.delete(expenseClassOfficeCodes).where(
          eq(expenseClassOfficeCodes.expenseClassId, id),
        );
        if (validatedOfficeCodeIds.length > 0) {
          await tx.insert(expenseClassOfficeCodes).values(
            validatedOfficeCodeIds.map(officeCodeId => ({
              expenseClassId: id,
              officeCodeId: officeCodeId.id,
            })),
          );
        }
      }

      return updated;
    });

    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Failed to update expense.");
    }

    const allowedFor = await fetchAllowedFor(result.id);
    return new Success({ ...result, allowedFor });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update expense.", {}, e);
  }
}

export async function all(): Promise<Result<Array<ExpenseClass>>> {
  try {
    const allClasses = await db
      .select({
        id: expenseClasses.id,
        accountName: expenseClasses.accountName,
        fpp: expenseClasses.fpp,
        classification: expenseClasses.classification,
        subClassification: expenseClasses.subClassification,
        group: expenseClasses.group,
        accountCode: expenseClasses.accountCode,
        class: expenseClasses.class,
      })
      .from(expenseClasses)
      .where(isNull(expenseClasses.deletedAt))
      .orderBy(expenseClasses.createdAt);

    // Fetch all join table entries in one query
    const associations = await db
      .select({
        expenseClassId: expenseClassOfficeCodes.expenseClassId,
        officeCodeId: officeCodes.id,
        aa: officeCodes.aa,
      })
      .from(expenseClassOfficeCodes)
      .innerJoin(officeCodes, eq(expenseClassOfficeCodes.officeCodeId, officeCodes.id));

    // Group by expenseClassId
    const allowedForMap = new Map<string, Array<{ id: string; aa: string }>>();
    for (const row of associations) {
      const existing = allowedForMap.get(row.expenseClassId) ?? [];
      existing.push({ id: row.officeCodeId, aa: row.aa });
      allowedForMap.set(row.expenseClassId, existing);
    }

    const result: ExpenseClass[] = allClasses.map(ec => ({
      ...ec,
      allowedFor: allowedForMap.get(ec.id) ?? [],
    }));

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch expense classes.", {}, e);
  }
}

/**
 * Returns all expense classes available for a given office code.
 * An expense class is available if it has no office code restrictions,
 * or if it explicitly includes the given office code.
 */
export async function getAllByOfficeCode(officeCodeId: string): Promise<Result<Array<BaseExpenseClass>>> {
  try {
    // IDs of expense classes that have ANY restriction set
    const withRestrictions = await db
      .selectDistinct({ expenseClassId: expenseClassOfficeCodes.expenseClassId })
      .from(expenseClassOfficeCodes);

    const restrictedIds = new Set(withRestrictions.map(r => r.expenseClassId));

    // IDs of expense classes that explicitly allow this office code
    const allowedForCode = await db
      .selectDistinct({ expenseClassId: expenseClassOfficeCodes.expenseClassId })
      .from(expenseClassOfficeCodes)
      .where(eq(expenseClassOfficeCodes.officeCodeId, officeCodeId));

    const allowedIds = new Set(allowedForCode.map(r => r.expenseClassId));

    const allClasses = await db
      .select({
        id: expenseClasses.id,
        accountName: expenseClasses.accountName,
        fpp: expenseClasses.fpp,
        classification: expenseClasses.classification,
        subClassification: expenseClasses.subClassification,
        group: expenseClasses.group,
        accountCode: expenseClasses.accountCode,
        class: expenseClasses.class,
      })
      .from(expenseClasses)
      .where(isNull(expenseClasses.deletedAt))
      .orderBy(expenseClasses.createdAt);

    // Unrestricted (no entries in join table) OR explicitly allowed
    const filtered = allClasses.filter(ec =>
      !restrictedIds.has(ec.id) || allowedIds.has(ec.id),
    );

    return new Success(filtered);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch expense classes.", {}, e);
  }
}

export async function removeSoftly(id: string): Promise<Result<null>> {
  try {
    const [targetExpenseClass] = await db
      .select({ id: expenseClasses.id, deletedAt: expenseClasses.deletedAt })
      .from(expenseClasses)
      .where(eq(expenseClasses.id, id))
      .limit(1);
    if (!targetExpenseClass || targetExpenseClass.deletedAt) {
      return new Failure(ErrorCodes.ResourceNotFound, "Expense class not found.");
    }

    await db.update(expenseClasses)
      .set({ deletedAt: DateTime.utc().toJSDate() })
      .where(eq(expenseClasses.id, targetExpenseClass.id));

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to remove the expense class.", { id }, e);
  }
}

/**
 * Validates that all provided office code IDs exist in the database.
 * Returns a deduplicated list of valid IDs, or a Failure if any are invalid.
 */
async function validateOfficeCodeIds(ids: string[]): Promise<Array<{ id: string; name: string; }>> {
  const unique = [...new Set(ids)];
  const found = await db.select({ id: officeCodes.id, name: officeCodes.aa })
    .from(officeCodes)
    .where(inArray(officeCodes.id, unique));
  if (found.length !== unique.length) {
    return [];
  }

  return found;
}

/**
 * Fetches the allowedFor list for a single expense class.
 */
async function fetchAllowedFor(expenseClassId: string): Promise<Array<{ id: string; aa: string }>> {
  const rows = await db
    .select({ id: officeCodes.id, aa: officeCodes.aa })
    .from(expenseClassOfficeCodes)
    .innerJoin(officeCodes, eq(expenseClassOfficeCodes.officeCodeId, officeCodes.id))
    .where(eq(expenseClassOfficeCodes.expenseClassId, expenseClassId));
  return rows;
}


type CreateExpenseClass = {
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
  allowedOfficeCodeIds?: string[];
}

type BaseExpenseClass = {
  id: string;
  accountName: string;
  fpp: string | null;
  classification: string | null;
  subClassification: string | null;
  group: string | null;
  accountCode: string | null;
  class: string | null;
}

type ExpenseClass = BaseExpenseClass & {
  allowedFor: Array<{ id: string; aa: string }>;
}
