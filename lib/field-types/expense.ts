import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseClasses } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

/**
 * Creates a new expense class record.
 *
 * Checks for an existing record with the same name before creating a new one.
 * Optional fields are included only when provided.
 *
 * @param {CreateExpenseClass} payload - The expense class data to create.
 * @returns A promise that resolves to a success result containing the created record,
 * or a failure result if a duplicate exists or creation fails.
 */
export async function create(payload: CreateExpenseClass): Promise<Result<ExpenseClass>> {
  try {
    const [existingExpenseClass] = await db
      .select({
        id: expenseClasses.id,
      })
      .from(expenseClasses)
      .where(eq(expenseClasses.accountName, payload.accountName))
      .limit(1);

    // Do not add if there is already an existing item.
    if (existingExpenseClass) {
      return new Failure(ErrorCodes.ValidationFailure, "Item already exists with the same name.");
    }

    const [result] = await db
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
    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Failed to create expense.");
    }

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create expense.", {}, e);
  }
}

/**
 * Updates an existing expense class by its identifier.
 *
 * Verifies that the target record exists before applying changes.
 * Only non-empty fields from the provided payload are included in the update.
 *
 * @param id - The unique identifier of the expense class to update.
 * @param payload - A partial set of expense class fields to modify.
 * @returns A promise that resolves to a success result containing the updated expense class,
 * or a failure result if the record is not found or the update operation fails.
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

    // Update Payload.
    const [result] = await db
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
    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Failed to update expense.");
    }

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update expense.", {}, e);
  }
}

export async function all(): Promise<Result<Array<ExpenseClass>>> {
  try {
    const all = await db
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
      .orderBy(expenseClasses.createdAt);

    return new Success(all);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch expense classes.", {}, e);
  }
}

type CreateExpenseClass = {
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
}

type ExpenseClass = {
  id: string;
} & CreateExpenseClass;
