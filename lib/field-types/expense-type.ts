import { desc, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { expenseType } from "@/lib/db/schema";
import { validatorUtilities } from "@/lib/validators";

export async function create(payload: ExpenseTypePayload): Promise<Result<ExpenseType>> {
  try {
    const [result] = await db
      .select({
        any: count(expenseType.id),
      })
      .from(expenseType)
      .where(eq(expenseType.name, payload.name));
    if (result?.any > 0) {
      return new Failure(ErrorCodes.ValidationFailure, "Expense type already exists.", payload);
    }

    // Create the office code.
    const [fundType] = await db
      .insert(expenseType)
      .values({
        name: payload.name,
        ...(validatorUtilities.isNotEmpty(payload.description) ? { description: payload.description } : {}),
      })
      .returning();
    if (!fundType) {
      return new Failure(ErrorCodes.Fatal, "Unable to create a expense type.");
    }

    return new Success({
      id: fundType.id,
      name: fundType.name,
      description: fundType.description,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create expense type.", payload, e);
  }
}

export async function all(): Promise<Result<Array<ExpenseType>>> {
  try {
    const allFundTypes = await db
      .select({
        id: expenseType.id,
        name: expenseType.name,
        description: expenseType.description,
      })
      .from(expenseType)
      .orderBy(desc(expenseType.createdAt));

    return new Success(allFundTypes);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch expense types.", {}, e);
  }
}

export async function update(id: string, payload: Partial<UpdateExpenseTypePayload>): Promise<Result<ExpenseType>> {
  try {
    const [target] = await db
      .select({
        id: expenseType.id,
        name: expenseType.name,
        description: expenseType.description,
      })
      .from(expenseType)
      .where(eq(expenseType.id, id))
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such expense type found.", { id });
    }

    // Filter out unserializable content and empty values
    const values: Partial<ExpenseTypePayload> = validatorUtilities.filterUpdatedFields(payload);

    // Apply updates
    const [updated] = await db
      .update(expenseType)
      .set({
        ...(validatorUtilities.isExisty(values.name) ? { name: values.name } : {}),
        ...(validatorUtilities.isExisty(values.description) ? { description: values.description } : {}),
      })
      .where(eq(expenseType.id, target.id))
      .returning();

    return new Success({
      id: updated.id,
      name: updated.name,
      description: updated.description,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update expense type.", { ...payload, id }, e);
  }
}

type ExpenseTypePayload = {
  name: string;
  description: Optional<string>;
};

type UpdateExpenseTypePayload = Partial<ExpenseTypePayload>;

export type ExpenseType = {
  id: string;
  name: string;
  description: Optional<string>;
}
